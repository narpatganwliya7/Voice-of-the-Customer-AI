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
