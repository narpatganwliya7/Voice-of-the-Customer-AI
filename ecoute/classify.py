"""Distil the LLM's annotations into a fast local classifier that scores every review.

Free, private and instant: once trained, scoring a new review needs no API call.
Features = multilingual sentence embedding + TF-IDF words + star rating.
One calibrated linear model per target, thresholds tuned on out-of-fold predictions,
and every number in the report comes from data the model did not train on.
"""
from __future__ import annotations

import json
import logging
import re
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from scipy import sparse
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, f1_score, precision_recall_fscore_support
from sklearn.model_selection import KFold, cross_val_predict

from .common import now
from .taxonomy import ASPECTS, CHURN, OVERALL

log = logging.getLogger(__name__)
EMBED_MODEL = "sentence-transformers/paraphrase-multilingual-mpnet-base-v2"
MIN_POSITIVES = 8
UPDATE_RX = re.compile(r"(depuis|apr[eè]s) (la |cette |une |les )?(derni[eè]re |nouvelle )?(mise [àa] jour|maj|m\.a\.j|update|version)|"
                       r"\bmaj\b|mise [àa] jour.{0,40}(plante|bug|marche plus|fonctionne plus|impossible)", re.I)


def review_text(df: pd.DataFrame) -> list[str]:
    return [" ".join(x for x in (t, s) if x)[:1500] for t, s in zip(df.title.fillna(""), df.text.fillna(""))]


# --- embeddings (cached by review_id) -------------------------------------------------
class Embeddings:
    def __init__(self, cache_dir: Path, model: str = EMBED_MODEL, embed_fn=None, batch: int = 256):
        self.path = Path(cache_dir) / (re.sub(r"[^a-z0-9]+", "-", model.lower()) + ".npz")
        self.model, self.batch, self._fn = model, batch, embed_fn
        self.ids, self.mat = np.array([], dtype=object), None
        if self.path.exists():
            z = np.load(self.path, allow_pickle=True)
            self.ids, self.mat = z["ids"], z["mat"]

    def _encoder(self):
        if self._fn is None:
            from fastembed import TextEmbedding
            m = TextEmbedding(self.model)
            self._fn = lambda texts: np.array(list(m.embed(texts, batch_size=64)), dtype=np.float32)
        return self._fn

    def get(self, df: pd.DataFrame) -> np.ndarray:
        index = {rid: i for i, rid in enumerate(self.ids)}
        missing = df[~df.review_id.isin(index)]
        if len(missing):
            log.info("Embedding %d new reviews with %s", len(missing), self.model)
            enc, texts, parts = self._encoder(), review_text(missing), []
            for i in range(0, len(texts), self.batch):
                parts.append(enc(texts[i:i + self.batch]).astype(np.float16))
                if (i // self.batch) % 40 == 0:
                    log.info("  %d / %d", min(i + self.batch, len(texts)), len(texts))
            new = np.vstack(parts)
            self.mat = new if self.mat is None else np.vstack([self.mat, new])
            self.ids = np.concatenate([self.ids, missing.review_id.to_numpy(dtype=object)])
            self.path.parent.mkdir(parents=True, exist_ok=True)
            np.savez(self.path, ids=self.ids, mat=self.mat)
            index = {rid: i for i, rid in enumerate(self.ids)}
        return self.mat[[index[r] for r in df.review_id]].astype(np.float32)


# --- features ---------------------------------------------------------------------------
class Featurizer:
    def __init__(self):
        self.tfidf = TfidfVectorizer(ngram_range=(1, 2), min_df=3, max_features=60000, sublinear_tf=True,
                                     strip_accents="unicode", lowercase=True)

    def fit(self, texts: list[str]) -> "Featurizer":
        self.tfidf.fit(texts)
        return self

    def transform(self, texts: list[str], emb: np.ndarray, ratings) -> sparse.csr_matrix:
        stars = np.eye(5, dtype=np.float32)[np.clip(np.asarray(ratings, dtype=int), 1, 5) - 1]
        emb = emb / (np.linalg.norm(emb, axis=1, keepdims=True) + 1e-9)
        return sparse.hstack([self.tfidf.transform(texts), sparse.csr_matrix(emb), sparse.csr_matrix(stars * 0.5)]).tocsr()


def _lr(**kw):
    return LogisticRegression(C=4.0, max_iter=3000, solver="liblinear" if not kw.get("multi") else "lbfgs",
                              class_weight=kw.get("cw"))


def _best_threshold(y, p) -> tuple[float, float]:
    best = (0.5, 0.0)
    for t in np.arange(0.15, 0.81, 0.025):
        f = f1_score(y, p >= t, zero_division=0)
        if f > best[1]:
            best = (round(float(t), 3), f)
    return best


# --- training ---------------------------------------------------------------------------
def unpack(labels: pd.DataFrame) -> pd.DataFrame:
    df = labels.copy()
    df["aspects"] = df.aspects.map(lambda v: json.loads(v) if isinstance(v, str) else v)
    df["competitors"] = df.competitors.map(lambda v: json.loads(v) if isinstance(v, str) else v)
    return df


def train(reviews: pd.DataFrame, labels: pd.DataFrame, emb: Embeddings, folds: int = 5) -> tuple[dict, dict]:
    labels = unpack(labels)
    lab = labels.merge(reviews, on="review_id", suffixes=("", "_r"))
    train_df, gold_df = lab[lab["sample"] == "train"], lab[lab["sample"] == "gold"]
    feat = Featurizer().fit(review_text(reviews))
    X = feat.transform(review_text(train_df), emb.get(train_df), train_df.rating)
    kf = KFold(folds, shuffle=True, random_state=7)
    model = {"featurizer": feat, "aspects": {}, "embed_model": emb.model, "trained_at": now().isoformat(),
             "n_train": len(train_df)}
    report = {"n_train": len(train_df), "n_heldout": len(gold_df), "aspects": {}}

    # 1. aspect detection: one binary model per aspect
    oof_all, y_all = {}, {}
    for k in ASPECTS:
        y = np.array([any(a[0] == k for a in asp) for asp in train_df.aspects])
        if y.sum() < MIN_POSITIVES:
            report["aspects"][k] = {"support": int(y.sum()), "skipped": "too few examples"}
            continue
        p = cross_val_predict(_lr(), X, y, cv=kf, method="predict_proba")[:, 1]
        t, _ = _best_threshold(y, p)
        pr, rc, f, _ = precision_recall_fscore_support(y, p >= t, average="binary", zero_division=0)
        model["aspects"][k] = {"clf": _lr().fit(X, y), "threshold": t}
        report["aspects"][k] = {"support": int(y.sum()), "precision": round(pr, 3), "recall": round(rc, 3),
                                "f1": round(f, 3), "threshold": t}
        oof_all[k], y_all[k] = p >= t, y
    if oof_all:
        Y, P = np.column_stack(list(y_all.values())), np.column_stack(list(oof_all.values()))
        report["aspect_micro_f1"] = round(f1_score(Y, P, average="micro", zero_division=0), 3)
        report["aspect_macro_f1"] = round(f1_score(Y, P, average="macro", zero_division=0), 3)

    # 2. multi-class targets
    targets = {
        "sentiment": (train_df.sentiment.to_numpy(), OVERALL),
        "churn": (train_df.churn.to_numpy(), CHURN),
        "severity": (train_df.severity.astype(int).to_numpy(), [0, 1, 2, 3]),
        "after_update": (train_df.after_update.astype(bool).to_numpy(), [False, True]),
    }
    for name, (y, _classes) in targets.items():
        if len(set(y)) < 2:
            continue
        clf = LogisticRegression(C=4.0, max_iter=3000)
        pred = cross_val_predict(clf, X, y, cv=kf)
        report[name] = {"accuracy": round(accuracy_score(y, pred), 3),
                        "macro_f1": round(f1_score(y, pred, average="macro", zero_division=0), 3)}
        if name == "churn":
            report[name]["leaving_company_f1"] = round(f1_score(y == "company", pred == "company", zero_division=0), 3)
        model[name] = clf.fit(X, y)

    # 3. aspect polarity: (review, aspect) pairs -> positive / negative / neutral
    rows, ys = [], []
    for i, asp in enumerate(train_df.aspects):
        for k, s in asp:
            if k in model["aspects"]:
                rows.append((i, k))
                ys.append(s)
    if len(set(ys)) >= 2:
        Xp = _pair_features(X, rows)
        clf = LogisticRegression(C=4.0, max_iter=3000)
        pred = cross_val_predict(clf, Xp, ys, cv=kf)
        report["aspect_polarity"] = {"accuracy": round(accuracy_score(ys, pred), 3), "pairs": len(ys)}
        model["polarity"] = clf.fit(Xp, ys)

    # 4. held-out check: the gold set was never used for training or tuning
    if len(gold_df):
        report["heldout"] = evaluate(model, gold_df, emb)
    return model, report


def _pair_features(X, rows):
    keys = list(ASPECTS)
    onehot = np.zeros((len(rows), len(keys)), dtype=np.float32)
    for j, (_, k) in enumerate(rows):
        onehot[j, keys.index(k)] = 1.0
    return sparse.hstack([X[[i for i, _ in rows]], sparse.csr_matrix(onehot)]).tocsr()


def evaluate(model: dict, labelled: pd.DataFrame, emb: Embeddings) -> dict:
    pred = predict(model, labelled, emb)
    out, Y, P = {"n": len(labelled)}, [], []
    for k in model["aspects"]:
        Y.append([any(a[0] == k for a in asp) for asp in labelled.aspects])
        P.append([any(a[0] == k for a in asp) for asp in pred.aspects])
    if Y:
        Y, P = np.array(Y).T, np.array(P).T
        out["aspect_micro_f1"] = round(f1_score(Y, P, average="micro", zero_division=0), 3)
        out["aspect_macro_f1"] = round(f1_score(Y, P, average="macro", zero_division=0), 3)
    out["sentiment_accuracy"] = round(accuracy_score(labelled.sentiment, pred.sentiment), 3)
    out["churn_accuracy"] = round(accuracy_score(labelled.churn, pred.churn), 3)
    return out


# --- scoring ----------------------------------------------------------------------------
def predict(model: dict, df: pd.DataFrame, emb: Embeddings, chunk: int = 20000) -> pd.DataFrame:
    parts = []
    for s in range(0, len(df), chunk):
        part = df.iloc[s:s + chunk]
        texts = review_text(part)
        X = model["featurizer"].transform(texts, emb.get(part), part.rating)
        found = [[] for _ in range(len(part))]
        for k, m in model["aspects"].items():
            p = m["clf"].predict_proba(X)[:, 1]
            for i in np.flatnonzero(p >= m["threshold"]):
                found[i].append((k, float(p[i])))
        found = [sorted(f, key=lambda x: -x[1])[:4] for f in found]
        rows = [(i, k) for i, f in enumerate(found) for k, _ in f]
        pol = model["polarity"].predict(_pair_features(X, rows)) if rows and "polarity" in model else []
        aspects = [[] for _ in range(len(part))]
        for (i, k), s, (_, prob) in zip(rows, pol, [x for f in found for x in f]):
            aspects[i].append([k, str(s), round(prob, 3)])
        out = pd.DataFrame({"review_id": part.review_id.to_numpy(), "aspects": aspects})
        for name in ("sentiment", "churn", "severity", "after_update"):
            if name in model:
                proba = model[name].predict_proba(X)
                out[name] = model[name].classes_[proba.argmax(1)]
                out[name + "_conf"] = proba.max(1).round(3)
        if "after_update" in out:  # explicit wording is enough on its own
            out["after_update"] = out.after_update.astype(bool) | np.array([bool(UPDATE_RX.search(t)) for t in texts])
        parts.append(out)
    return pd.concat(parts, ignore_index=True) if parts else pd.DataFrame()


def save(model: dict, report: dict, store: Path) -> None:
    d = Path(store) / "model"
    d.mkdir(parents=True, exist_ok=True)
    joblib.dump(model, d / "classifier.joblib", compress=3)
    (d / "report.json").write_text(json.dumps(report, indent=2))


def load(store: Path) -> dict:
    return joblib.load(Path(store) / "model" / "classifier.joblib")
