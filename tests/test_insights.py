"""SQL models and key-driver analysis on a synthetic store with known answers."""
import json
from datetime import datetime, timedelta, timezone

import numpy as np
import pandas as pd

from ecoute import insights
from ecoute.store import Store


def build_store(tmp_path, n=3000, seed=3):
    rng = np.random.default_rng(seed)
    end = datetime(2026, 11, 13, tzinfo=timezone.utc)
    reviews, scored = [], []
    for i in range(n):
        brand = "Orange" if i % 2 else "SFR"
        day = end - timedelta(days=int(rng.integers(0, 150)), hours=int(rng.integers(0, 24)))
        login = rng.random() < (0.30 if brand == "SFR" else 0.08)  # SFR: login is the big pain
        fees = rng.random() < 0.10
        rating = 5 - 3 * login - 1 * fees - (rng.random() < 0.1)
        rating = int(max(1, rating))
        aspects = ([["login_access", "negative", 0.9]] if login else []) + ([["pricing_fees", "negative", 0.8]] if fees else [])
        if rating == 5:
            aspects.append(["customer_service", "positive", 0.8])
        text = ("Impossible de me connecter depuis la mise à jour, code jamais reçu, je pars chez Free"
                if login else "Très bonne application, service client rapide et efficace merci")
        rid = f"r{i}"
        reviews.append({"review_id": rid, "brand": brand, "sector": "telecom", "source": "google_play",
                        "app_id": "x", "rating": rating, "title": "", "text": text, "at": day,
                        "app_version": "9.1" if day > end - timedelta(days=40) else "9.0", "thumbs_up": 0,
                        "replied": bool(rng.random() < 0.3), "reply_at": None, "collected_at": end})
        scored.append({"review_id": rid, "aspects": json.dumps(aspects),
                       "sentiment": "negative" if rating <= 2 else "positive" if rating >= 4 else "mixed",
                       "churn": "company" if login and i % 3 == 0 else "none", "severity": 2 if login else 0,
                       "after_update": login, "competitors": json.dumps(["Free"] if login else []),
                       "label_source": "llm" if i % 10 == 0 else "classifier",
                       "gist": "Cannot log in since the update" if login else "Great app"})
    Store(tmp_path).add(reviews)
    pd.DataFrame(scored).to_parquet(tmp_path / "scored.parquet")
    return tmp_path


def test_build_insights(tmp_path):
    store = build_store(tmp_path)
    res = insights.build(store, window_days=60)
    out = store / "insights"
    assert {"overview.json", "scorecard.json", "drivers.json", "heatmap.json", "switching.json",
            "releases.json", "quotes.json", "weekly.json", "spikes.json", "recoveries.json"} <= set(res["files"])

    drivers = json.loads((out / "drivers.json").read_text())
    top = drivers["SFR"]["drivers"][0]
    assert top["aspect"] == "login_access"
    assert 2.0 < top["impact"] < 4.0  # simulated: a login complaint costs 3 stars
    assert drivers["SFR"]["drivers"][0]["stars_lost"] > drivers["Orange"]["drivers"][0]["stars_lost"]

    card = {r["brand"]: r for r in json.loads((out / "scorecard.json").read_text())}
    assert card["SFR"]["avg_rating"] < card["Orange"]["avg_rating"]
    sw = json.loads((out / "switching.json").read_text())
    assert sw[0]["to_company"] == "Free" and sw[0]["from_brand"] == "SFR"
    q = json.loads((out / "quotes.json").read_text())
    kinds = {(x["aspect"], x["kind"]) for x in q["SFR"]}
    assert ("login_access", "pain") in kinds
    rel = json.loads((out / "releases.json").read_text())
    assert any(r["previous_version"] == "9.0" for r in rel)
    ov = json.loads((out / "overview.json").read_text())
    assert ov["reviews"] == 3000 and ov["brands"] == 2 and ov["label_sources"]["llm"] == 300


def test_spike_baseline_counts_quiet_days_and_needs_history(tmp_path):
    import duckdb
    con = duckdb.connect()
    days = pd.date_range("2026-01-01", periods=40, freq="D")
    rows = []
    for d in days:  # one negative review every 4th day, then a burst on the last day
        n = 12 if d == days[-1] else (1 if d.day % 4 == 0 else 0)
        rows += [{"brand": "X", "at": d, "sentiment": "negative"}] * n
    con.register("facts_df", pd.DataFrame(rows))
    con.execute("create table facts as select * from facts_df")
    con.execute((insights.SQL_DIR / "06_spikes.sql").read_text())
    last = con.execute("select baseline, baseline_days from daily where day = '2026-02-09'").fetchall()[0]
    assert last[1] == 28 and abs(last[0] - 7 / 28) < 0.05  # quiet days count as zero, 28 calendar days
    assert con.execute("select count(*) from spikes where day = '2026-02-09'").fetchall()[0][0] == 1
    early = con.execute("select count(*) from spikes where day < '2026-01-14'").fetchall()[0][0]
    assert early == 0  # no spike is called before 14 days of history exist


def test_release_radar_compares_with_the_previous_version_number(tmp_path):
    import duckdb
    con = duckdb.connect()
    rows = []
    for v, first, n in (("11.7.1", "2026-01-02", 30), ("11.6.0", "2026-01-03", 30), ("11.7.2", "2026-02-01", 30)):
        rows += [{"brand": "X", "app_version": v, "at": pd.Timestamp(first), "source": "google_play", "rating": 3,
                  "sentiment": "neutral", "after_update": False}] * n
    con.register("facts_df", pd.DataFrame(rows))
    con.execute("create table facts as select * from facts_df")
    con.execute((insights.SQL_DIR / "05_releases.sql").read_text())
    prev = dict(con.execute("select app_version, previous_version from releases").fetchall())
    assert prev == {"11.6.0": None, "11.7.1": "11.6.0", "11.7.2": "11.7.1"}


def test_public_bundle_masks_staff_names_and_keeps_quotes_short():
    from ecoute.site import make_public
    bundle = {"brands": [{"name": "Engie", "quotes": [{"text": "Merci à la conseillère Julie pour son aide"},
                                                     {"text": "aide d'une conseillère Engie, merci"}]}],
              "ticker": [{"t": "Merci Beaucoup, super appli"}, {"t": "mot " * 120}],
              "agent": [{"evidence": [{"text": "le livreur Karim était absent"}],
                         "steps": [{"result_preview": "Monsieur Dupont m'a raccroché"}]}]}
    out = make_public(bundle)
    q = [x["text"] for x in out["brands"][0]["quotes"]]
    assert q == ["Merci à la conseillère [name] pour son aide", "aide d'une conseillère Engie, merci"]
    assert out["ticker"][0]["t"] == "Merci Beaucoup, super appli"
    assert len(out["ticker"][1]["t"]) <= 201 and out["ticker"][1]["t"].endswith("…")
    assert out["agent"][0]["evidence"][0]["text"] == "le livreur [name] était absent"
    assert "Dupont" not in out["agent"][0]["steps"][0]["result_preview"]
