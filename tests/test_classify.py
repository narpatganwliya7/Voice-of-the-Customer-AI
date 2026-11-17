"""Classifier + scoring on synthetic reviews with a deterministic fake embedder (no downloads)."""
import json
import zlib

import numpy as np
import pandas as pd

from ecoute import classify, score

TOPICS = {
    "login_access": ["impossible de me connecter", "code sms jamais reçu", "mot de passe refusé"],
    "orders_delivery": ["colis jamais livré", "livraison en retard", "commande perdue"],
    "customer_service": ["service client injoignable", "conseiller très aimable", "aucune réponse du support"],
}


def fake_embed(texts):
    out = np.zeros((len(texts), 32), dtype=np.float32)
    for i, t in enumerate(texts):
        for w in t.lower().split():
            out[i, zlib.crc32(w.encode()) % 32] += 1
    return out


def make_data(n=600, seed=1):
    rng = np.random.default_rng(seed)
    reviews, labels = [], []
    keys = list(TOPICS)
    for i in range(n):
        k = keys[i % 3]
        neg = rng.random() < 0.7
        txt = rng.choice(TOPICS[k]) + (" nul" if neg else " super merci") + f" ({i})"
        if i % 10 == 0:
            txt += " depuis la dernière mise à jour"
        rid = f"r{i:04d}"
        reviews.append({"review_id": rid, "brand": "Orange", "sector": "telecom", "rating": 1 if neg else 5,
                        "title": "", "text": txt})
        labels.append({"review_id": rid, "sample": "gold" if i % 6 == 0 else "train",
                       "aspects": json.dumps([[k, "negative" if neg else "positive"]]),
                       "sentiment": "negative" if neg else "positive", "churn": "company" if (neg and i % 5 == 0) else "none",
                       "competitors": "[]", "after_update": i % 10 == 0, "severity": 2 if neg else 0, "gist": "x"})
    return pd.DataFrame(reviews), pd.DataFrame(labels)


def test_classifier_learns_and_reports_heldout(tmp_path):
    reviews, labels = make_data()
    emb = classify.Embeddings(tmp_path, embed_fn=fake_embed)
    model, rep = classify.train(reviews, labels, emb)
    assert rep["n_train"] == 500 and rep["n_heldout"] == 100
    assert rep["aspect_micro_f1"] > 0.9
    assert rep["heldout"]["aspect_micro_f1"] > 0.9 and rep["heldout"]["sentiment_accuracy"] > 0.9
    assert "skipped" in rep["aspects"]["app_reliability"]  # no examples -> not trained, said so
    pred = classify.predict(model, reviews.head(5), emb)
    assert pred.aspects[0][0][0] == "login_access" and pred.aspects[0][0][1] in ("negative", "positive")
    assert bool(pred.after_update[0]) is True  # "depuis la dernière mise à jour"


def test_embeddings_are_cached(tmp_path):
    reviews, _ = make_data(30)
    calls = []

    def fn(texts):
        calls.append(len(texts))
        return fake_embed(texts)

    classify.Embeddings(tmp_path, embed_fn=fn).get(reviews)
    classify.Embeddings(tmp_path, embed_fn=fn).get(reviews.head(10))
    assert calls == [30]


def test_score_run_prefers_llm_labels(tmp_path):
    reviews, labels = make_data(300)
    reviews.loc[1, "text"] += " je pars chez Free et SFR"
    reviews.to_parquet(tmp_path / "reviews.parquet")
    labels[labels.index % 2 == 0].to_parquet(tmp_path / "labels.parquet")
    summary = score.run(tmp_path, tmp_path / "cache", embed_fn=fake_embed, min_labels=100)
    out = pd.read_parquet(tmp_path / "scored.parquet")
    assert len(out) == 300 and summary["by_source"] == {"classifier": 150, "llm": 150}
    assert list(out.review_id) == list(reviews.review_id)
    assert sorted(json.loads(out.competitors[1])) == ["Free", "SFR"]
    assert (tmp_path / "model" / "report.json").exists()


def test_heldout_reviews_never_shape_the_vocabulary(tmp_path):
    reviews, labels = make_data()
    gold = labels[labels["sample"] == "gold"].review_id
    marker = "zxqvocabmarker"  # a word that only appears in held-out reviews
    reviews.loc[reviews.review_id.isin(gold), "text"] += f" {marker} {marker} {marker}"
    emb = classify.Embeddings(tmp_path, embed_fn=fake_embed)
    model, rep = classify.train(reviews, labels, emb)
    vocab = model["featurizer"].tfidf.vocabulary_
    assert not any(marker in w for w in vocab)
    assert "sentiment_macro_f1" in rep["heldout"]
