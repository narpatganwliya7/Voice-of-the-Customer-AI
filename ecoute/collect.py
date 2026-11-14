"""Collection run: resolve apps, pull new reviews, store, log measured capture latency."""
from __future__ import annotations

import logging
import os
import statistics
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from pathlib import Path

from .common import load_config, now, slug
from .resolve import resolve_all
from .sources import fetch_appstore, fetch_play
from .store import Store

log = logging.getLogger(__name__)
APPS_MAX_AGE = timedelta(days=7)


def run(store_dir: Path, *, mode: str = "incremental", brands: set[str] | None = None,
        max_per_app: int = 2000, since_days: int = 180, refresh_apps: bool = False, workers: int = 4) -> dict:
    cfg = load_config()
    country, lang = cfg["market"]["country"], cfg["market"]["lang"]
    store = Store(store_dir)
    started = now()

    apps = store.load_apps()
    stale = not apps or (now() - _ts(apps.get("_resolved_at"), started)) > APPS_MAX_AGE
    missing = brands and any(b not in apps for b in brands)
    if refresh_apps or stale or missing:
        log.info("Resolving official apps...")
        fresh = resolve_all(cfg, None if (refresh_apps or stale) else brands)
        apps = {**{k: v for k, v in apps.items() if not k.startswith("_")}, **fresh}
        apps["_resolved_at"] = started.isoformat()
        store.save_apps(apps)

    valid = {(a["name"], src, a[key]["id"]) for k, a in apps.items() if not k.startswith("_")
             for key, src in (("play", "google_play"), ("ios", "app_store")) if a.get(key)}
    pruned = store.keep_apps(valid)
    if pruned:
        log.warning("Removed %d reviews from apps that failed verification", pruned)

    last = store.last_seen() if mode == "incremental" else {}
    horizon = started - timedelta(days=since_days)  # backfill depth (and a floor for incremental runs)
    wanted = [k for k in apps if not k.startswith("_") and (not brands or k in brands)]

    def job(key: str) -> list[dict]:
        a = apps[key]
        rows = []
        if a.get("play"):
            rows += fetch_play(a["name"], a["sector"], a["play"]["id"], country=country, lang=lang,
                               since=max(last.get((a["name"], "google_play"), horizon), horizon),
                               max_reviews=max_per_app)
        if a.get("ios"):
            rows += fetch_appstore(a["name"], a["sector"], a["ios"]["id"], country=country,
                                   since=max(last.get((a["name"], "app_store"), horizon), horizon))
        return rows

    with ThreadPoolExecutor(workers) as pool:
        results = dict(zip(wanted, pool.map(job, wanted)))

    per_brand, new_rows = {}, []
    for key, rows in results.items():
        added = store.add(rows)
        new_rows += added
        per_brand[apps[key]["name"]] = len(added)

    finished = now()
    report = {
        "run_id": os.environ.get("GITHUB_RUN_ID", "local"),
        "mode": mode,
        "started": started.isoformat(),
        "finished": finished.isoformat(),
        "duration_s": int((finished - started).total_seconds()),
        "brands": len(wanted),
        "new_reviews": len(new_rows),
        "total_reviews": store.count(),
        "per_brand": per_brand,
        "unresolved": sorted(apps[k]["name"] for k in wanted if not apps[k].get("play") and not apps[k].get("ios")),
    }
    # Capture latency is only meaningful for incremental runs: how long after a customer
    # posted did Écoute have the review? Measured, never assumed.
    if mode == "incremental" and new_rows:
        lags = sorted((r["collected_at"] - r["at"]).total_seconds() / 60 for r in new_rows if r["at"])
        if lags:
            report["capture_lag_min"] = {
                "median": round(statistics.median(lags), 1),
                "p90": round(lags[int(0.9 * (len(lags) - 1))], 1),
            }
    store.log_run(report)
    _summary(report, apps)
    return report


def _ts(s, default):
    from datetime import datetime
    try:
        return datetime.fromisoformat(s) if s else default - APPS_MAX_AGE * 2
    except ValueError:
        return default - APPS_MAX_AGE * 2


def _summary(report: dict, apps: dict) -> None:
    """Write a readable table to the GitHub Actions run page."""
    path = os.environ.get("GITHUB_STEP_SUMMARY")
    lines = [
        f"## Écoute collection: {report['mode']}",
        f"**{report['new_reviews']:,} new reviews** from {report['brands']} brands "
        f"in {report['duration_s']}s · {report['total_reviews']:,} reviews stored",
    ]
    if "capture_lag_min" in report:
        lag = report["capture_lag_min"]
        lines.append(f"Measured capture lag: median **{lag['median']} min**, p90 {lag['p90']} min")
    if report["unresolved"]:
        lines.append(f"⚠️ No official app found for: {', '.join(report['unresolved'])}")
    lines += ["", "| Brand | Google Play | App Store | New |", "|---|---|---|---:|"]
    for key in sorted(k for k in apps if not k.startswith("_")):
        a = apps[key]
        if a["name"] not in report["per_brand"]:
            continue
        p = (a.get("play") or {}).get("id", "—")
        i = (a.get("ios") or {}).get("id", "—")
        lines.append(f"| {a['name']} | `{p}` | `{i}` | {report['per_brand'][a['name']]:,} |")
    text = "\n".join(lines) + "\n"
    if path:
        with open(path, "a", encoding="utf-8") as f:
            f.write(text)
    else:
        print(text)


def parse_brands(s: str | None) -> set[str] | None:
    if not s or s.strip().lower() == "all":
        return None
    return {slug(x) for x in s.split(",") if x.strip()}
