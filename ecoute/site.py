"""Build the website's data bundle from the insights (one JSON file the static site loads)."""
from __future__ import annotations

import json
import random
from pathlib import Path

import pandas as pd

from .common import now, slug
from .store import Store


def _load(d: Path, name: str, default):
    p = d / f"{name}.json"
    return json.loads(p.read_text()) if p.exists() else default


def ticker(store: Path, n: int = 80, seed: int = 11) -> list[dict]:
    """Short real reviews for the hero stream: recent, readable, a balanced mix of tones."""
    reviews = Store(store).read(["review_id", "brand", "rating", "text", "at", "source"])
    scored = pd.read_parquet(store / "scored.parquet", columns=["review_id", "sentiment", "aspects"])
    df = reviews.merge(scored, on="review_id")
    df = df[df.text.str.len().between(35, 120) & ~df.text.str.contains(r"\[(?:email|phone|number|iban)\]")]
    df = df.sort_values("at", ascending=False).groupby("brand").head(40)
    out, rng = [], random.Random(seed)
    for tone, share in (("negative", 0.55), ("positive", 0.35), ("mixed", 0.10)):
        part = df[df.sentiment == tone]
        k = min(len(part), int(n * share))
        for r in part.sample(k, random_state=seed).itertuples():
            asp = json.loads(r.aspects)
            out.append({"b": r.brand, "r": int(r.rating), "t": r.text, "s": tone,
                        "src": "Google Play" if r.source == "google_play" else "App Store",
                        "a": asp[0][0] if asp else None})
    rng.shuffle(out)
    return out


def build(store: Path, out: Path) -> dict:
    store, out = Path(store), Path(out)
    ins = store / "insights"
    overview = _load(ins, "overview", {})
    score = {r["brand"]: r for r in _load(ins, "scorecard", [])}
    drivers = _load(ins, "drivers", {})
    quotes = _load(ins, "quotes", {})
    weekly = pd.DataFrame(_load(ins, "weekly", []))
    releases = pd.DataFrame(_load(ins, "releases", []))
    switching = _load(ins, "switching", [])
    apps = Store(store).load_apps()

    brands = []
    for name, card in sorted(score.items()):
        w = weekly[weekly.brand == name].sort_values("week").tail(26) if len(weekly) else pd.DataFrame()
        rel = releases[releases.brand == name].sort_values("first_seen").tail(6) if len(releases) else pd.DataFrame()
        app = next((a for k, a in apps.items() if not k.startswith("_") and a.get("name") == name), {})
        brands.append({
            "id": slug(name), "name": name, **{k: v for k, v in card.items() if k != "brand"},
            "store_rating": (app.get("play") or {}).get("score"),
            "drivers": drivers.get(name, {}).get("drivers", []),
            "potential": drivers.get(name, {}).get("potential"),
            "quotes": quotes.get(name, []),
            "weekly": [{"w": str(r.week)[:10], "n": int(r.reviews), "r": r.avg_rating, "neg": r.negative_share}
                       for r in w.itertuples()],
            "releases": json.loads(rel.to_json(orient="records")) if len(rel) else [],
            "switching": [s for s in switching if s["from_brand"] == name][:6],
        })

    bundle = {
        "built_at": now().isoformat(),
        "overview": overview,
        "brands": brands,
        "heatmap": _load(ins, "heatmap", []),
        "spikes": _load(ins, "spikes", [])[:20],
        "switching": switching[:80],
        "recoveries": _load(ins, "recoveries", [])[:5],
        # finished investigations with verified evidence first: they open the agent console
        "agent": sorted(_load(store / "agent", "latest", []),
                        key=lambda c: (not c.get("brief"), -len(c.get("evidence") or []))),
        "ticker": ticker(store),
        "runs": [json.loads(x) for x in (store / "runs.jsonl").read_text().splitlines()[-30:]] if (store / "runs.jsonl").exists() else [],
    }
    out.mkdir(parents=True, exist_ok=True)
    (out / "bundle.json").write_text(json.dumps(bundle, ensure_ascii=False, default=str))
    return {"brands": len(brands), "ticker": len(bundle["ticker"]), "bytes": (out / "bundle.json").stat().st_size}
