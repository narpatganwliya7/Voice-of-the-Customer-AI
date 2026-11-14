"""Turn scored reviews into decisions: SQL models (DuckDB) + key-driver analysis.

Outputs JSON files in <store>/insights/ that feed the website, the PDF briefs, the agent
and the launch video. Every figure is computed here from stored reviews; nothing is typed in.
"""
from __future__ import annotations

import json
import logging
import math
from pathlib import Path

import duckdb
import numpy as np
import pandas as pd

from .common import ROOT, now
from .taxonomy import ASPECTS

log = logging.getLogger(__name__)
SQL_DIR = ROOT / "sql"


def connect(store: Path, window_days: int = 60) -> duckdb.DuckDBPyConnection:
    con = duckdb.connect()
    for f in sorted(SQL_DIR.glob("*.sql")):
        sql = f.read_text().replace("{store}", str(Path(store).resolve())).replace("{window}", str(window_days))
        con.execute(sql)
    return con


def drivers(con, min_reviews: int = 150, ridge: float = 5.0) -> dict:
    """Stars lost per topic, per brand: a ridge regression of the star rating on topic mentions.

    impact      = stars a review loses when it complains about the topic (all else equal)
    prevalence  = share of reviews that complain about it
    stars_lost  = impact x prevalence = how much the brand's average rating would rise
                  if that topic stopped generating complaints
    """
    facts = con.execute("select review_id, brand, rating from facts where in_window").df()
    ments = con.execute("select review_id, aspect, polarity from mentions where in_window").df()
    keys = list(ASPECTS)
    cols = [f"neg:{k}" for k in keys] + [f"pos:{k}" for k in keys]
    ments["col"] = ments.polarity.map({"negative": "neg", "positive": "pos"}) + ":" + ments.aspect
    wide = (ments.dropna(subset=["col"]).assign(v=1).pivot_table(index="review_id", columns="col", values="v",
                                                                 aggfunc="max", fill_value=0))
    wide = wide.reindex(columns=cols, fill_value=0)
    out = {}
    for brand, f in facts.groupby("brand"):
        if len(f) < min_reviews:
            continue
        X = wide.reindex(f.review_id).fillna(0).to_numpy(dtype=float)
        y = f.rating.to_numpy(dtype=float)
        Xc, yc = X - X.mean(0), y - y.mean()
        beta = np.linalg.solve(Xc.T @ Xc + ridge * np.eye(X.shape[1]), Xc.T @ yc)
        rows = []
        for j, k in enumerate(keys):
            prev = float(X[:, j].mean())
            impact = float(-beta[j])
            if prev > 0 and impact > 0:
                rows.append({"aspect": k, "label": ASPECTS[k][0], "prevalence": round(prev, 4),
                             "impact": round(impact, 2), "stars_lost": round(impact * prev, 3),
                             "complaints": int(X[:, j].sum())})
        rows.sort(key=lambda r: -r["stars_lost"])
        out[brand] = {"reviews": len(f), "avg_rating": round(float(y.mean()), 2),
                      "potential": round(sum(r["stars_lost"] for r in rows), 2), "drivers": rows[:8]}
    return out


def quotes(con, per_brand: int = 3) -> dict:
    """Real, short reviews that illustrate each brand's biggest pain and its praise on the same topic."""
    df = con.execute("""
        select f.review_id, f.brand, f.rating, f."at"::date as day, f.source,
               coalesce(nullif(f.title, '') || ' — ', '') || f.text as text, f.label_source,
               m.aspect, m.polarity, s.gist
        from facts f join mentions m using (review_id)
        left join read_parquet('{store}/scored.parquet') s using (review_id)
        where length(f.text) between 50 and 220
    """.replace("{store}", str(_store_of(con)))).df()
    out = {}
    for brand, g in df.groupby("brand"):
        top = (g[g.polarity == "negative"].aspect.value_counts().index[:per_brand]).tolist()
        items = []
        for k in top:
            neg = g[(g.aspect == k) & (g.polarity == "negative") & (g.rating <= 2)]
            pos = g[(g.aspect == k) & (g.polarity == "positive") & (g.rating >= 4)]
            for label, part in (("pain", neg), ("praise", pos)):
                if len(part):
                    part = part.assign(llm=(part.label_source == "llm")).sort_values(["llm", "day"], ascending=False)
                    r = part.iloc[0]
                    items.append({"aspect": k, "kind": label, "rating": int(r.rating), "day": str(r.day),
                                  "source": r.source, "text": r.text, "gist": r.gist if isinstance(r.gist, str) else None})
        out[brand] = items
    return out


_STORES: dict[int, Path] = {}


def _store_of(con) -> Path:
    return _STORES[id(con)]


def recoveries(con, min_weekly: int = 20, weeks: int = 16) -> list[dict]:
    """Brands whose weekly rating rose steadily: candidates for the 'before / after' story."""
    w = con.execute("select * from weekly").df()
    out = []
    for brand, g in w.groupby("brand"):
        g = g[g.reviews >= min_weekly].sort_values("week").tail(weeks)
        if len(g) < 10:
            continue
        x = np.arange(len(g))
        slope = float(np.polyfit(x, g.avg_rating, 1)[0])
        first, last = g.avg_rating.head(4).mean(), g.avg_rating.tail(4).mean()
        out.append({"brand": brand, "weeks": len(g), "slope_per_week": round(slope, 3),
                    "from": round(float(first), 2), "to": round(float(last), 2), "change": round(float(last - first), 2)})
    return sorted(out, key=lambda r: -r["change"])


def capture_lag(store: Path) -> dict | None:
    runs_path = Path(store) / "runs.jsonl"
    if not runs_path.exists():
        return None
    runs = [json.loads(line) for line in runs_path.read_text().splitlines() if line.strip()]
    lags = [r["capture_lag_min"]["median"] for r in runs if r.get("mode") == "incremental" and r.get("capture_lag_min")]
    if not lags:
        return {"incremental_runs": 0}
    return {"incremental_runs": len(lags), "median_of_medians_min": round(float(np.median(lags)), 1)}


def _records(df: pd.DataFrame) -> list[dict]:
    recs = json.loads(df.to_json(orient="records", date_format="iso"))
    return [{k: (None if isinstance(v, float) and math.isnan(v) else v) for k, v in r.items()} for r in recs]


def build(store: Path, window_days: int = 60) -> dict:
    store = Path(store)
    con = connect(store, window_days)
    _STORES[id(con)] = store.resolve()
    out_dir = store / "insights"
    out_dir.mkdir(exist_ok=True)
    tables = {
        "scorecard": con.execute("select * from scorecard").df(),
        "heatmap": con.execute("select * from heatmap").df(),
        "weekly": con.execute("select * from weekly").df(),
        "weekly_topics": con.execute("select * from weekly_topics where reviews >= 15").df(),
        "releases": con.execute("select * from releases").df(),
        "spikes": con.execute("select * from spikes limit 200").df(),
        "switching": con.execute("select * from switching where mentions >= 3").df(),
    }
    for name, df in tables.items():
        (out_dir / f"{name}.json").write_text(json.dumps(_records(df), ensure_ascii=False))
    extra = {"drivers": drivers(con), "quotes": quotes(con), "recoveries": recoveries(con)}
    for name, obj in extra.items():
        (out_dir / f"{name}.json").write_text(json.dumps(obj, ensure_ascii=False, default=str))

    tot = con.execute("""select count(*), count(distinct brand), min("at")::date, max("at")::date,
                                count(*) filter (where in_window) from facts""").fetchone()
    model_report = store / "model" / "report.json"
    overview = {
        "generated_at": now().isoformat(),
        "reviews": tot[0], "brands": tot[1], "first_review": str(tot[2]), "last_review": str(tot[3]),
        "window_days": window_days, "reviews_in_window": tot[4],
        "label_sources": dict(con.execute("select label_source, count(*) from facts group by 1").fetchall()),
        "capture_lag": capture_lag(store),
        "classifier": json.loads(model_report.read_text()) if model_report.exists() else None,
        "aspects": {k: {"en": v[0], "fr": v[1]} for k, v in ASPECTS.items()},
    }
    (out_dir / "overview.json").write_text(json.dumps(overview, ensure_ascii=False, indent=1, default=str))
    return {"reviews": tot[0], "files": sorted(p.name for p in out_dir.glob("*.json")),
            "spikes": len(tables["spikes"]), "top_recovery": extra["recoveries"][:1]}
