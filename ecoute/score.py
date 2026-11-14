"""Score every review: best available label per review, plus competitor mentions.

Label source, in order of trust: LLM annotation (sample) -> local classifier (everything else).
Competitor mentions come from a name dictionary, so they are exact and explainable.
"""
from __future__ import annotations

import json
import logging
import re
from functools import lru_cache
from pathlib import Path

import pandas as pd
import yaml

from . import classify
from .common import ROOT, now
from .store import Store

log = logging.getLogger(__name__)


@lru_cache
def competitor_patterns() -> dict[str, tuple[str, re.Pattern]]:
    cfg = yaml.safe_load((ROOT / "config" / "competitors.yaml").read_text(encoding="utf-8"))
    return {name: (sector, re.compile(rf"(?<!\w)(?:{rx})(?!\w)", re.I))
            for sector, items in cfg.items() for name, rx in items.items()}


def find_competitors(text: str, brand: str, sector: str) -> list[str]:
    """Other companies named in a review. Same-sector names only, the reviewed brand excluded."""
    own = brand.lower()
    related = {"telecom": {"telecom"}, "banking": {"banking", "insurance"}, "insurance": {"insurance", "banking"},
               "mobility": {"mobility", "delivery"}, "delivery": {"delivery", "mobility"}}.get(sector, {sector})
    out = []
    for name, (sec, rx) in competitor_patterns().items():
        if sec in related and name.lower() != own and not own.startswith(name.lower().split()[0]) and rx.search(text):
            out.append(name)
    return out


def run(store_dir: Path, cache_dir: Path, *, retrain: bool = False, embed_fn=None, min_labels: int = 200) -> dict:
    store_dir = Path(store_dir)
    reviews = Store(store_dir).read()
    labels_path = store_dir / "labels.parquet"
    labels = pd.read_parquet(labels_path) if labels_path.exists() else pd.DataFrame()
    emb = classify.Embeddings(cache_dir, embed_fn=embed_fn)

    model_path = store_dir / "model" / "classifier.joblib"
    report = None
    if retrain or not model_path.exists():
        if len(labels) < min_labels:
            raise SystemExit(f"Only {len(labels)} labelled reviews: run the annotation workflow first")
        model, report = classify.train(reviews, labels, emb)
        classify.save(model, report, store_dir)
    else:
        model = classify.load(store_dir)

    emb.get(reviews)  # embed everything once (cached), then score
    pred = classify.predict(model, reviews, emb)
    pred["label_source"] = "classifier"
    if len(labels):  # the LLM's own annotation wins where we have it
        lab = classify.unpack(labels)
        lab = lab[["review_id", "aspects", "sentiment", "churn", "severity", "after_update", "gist"]].copy()
        lab["aspects"] = lab.aspects.map(lambda a: [[k, s, 1.0] for k, s in a])
        lab["label_source"] = "llm"
        pred = pd.concat([pred[~pred.review_id.isin(lab.review_id)], lab], ignore_index=True)

    meta = reviews.set_index("review_id")
    texts = classify.review_text(reviews)
    comp = {rid: find_competitors(t, b, s) for rid, t, b, s in zip(reviews.review_id, texts, reviews.brand, reviews.sector)}
    pred["competitors"] = pred.review_id.map(comp)
    pred["aspects"] = pred.aspects.map(lambda a: json.dumps(a, ensure_ascii=False))
    pred["competitors"] = pred.competitors.map(lambda a: json.dumps(a, ensure_ascii=False))
    pred["severity"] = pred.severity.astype(int)
    pred["after_update"] = pred.after_update.astype(bool)
    pred["scored_at"] = now()
    pred = pred.set_index("review_id").loc[meta.index].reset_index()
    pred.to_parquet(store_dir / "scored.parquet", index=False)

    summary = {"scored": len(pred), "by_source": pred.label_source.value_counts().to_dict(),
               "with_aspect": int((pred.aspects != "[]").sum()),
               "mentions_competitor": int((pred.competitors != "[]").sum())}
    if report:
        summary["model"] = {k: v for k, v in report.items() if k != "aspects"}
    return summary
