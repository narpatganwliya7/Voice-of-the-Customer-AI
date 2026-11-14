"""LLM-as-annotator.

1. `make_samples`: a fixed, stratified training sample (every brand, every star rating)
   plus a separate gold set that a human labels by hand to measure accuracy.
2. `run`: annotates pending reviews in batches with a free LLM, validates every answer
   against the taxonomy, saves progress often and resumes where it stopped.
The labelled sample later trains a fast local classifier that scores every review.
"""
from __future__ import annotations

import hashlib
import json
import logging
from pathlib import Path

import pandas as pd

from . import taxonomy
from .common import now
from .llm import LLMError, QuotaExhausted

log = logging.getLogger(__name__)
MIX = {"neg": 0.5, "mid": 0.15, "pos": 0.35}  # negatives over-sampled: most aspects live there


def _group(rating: int) -> str:
    return "neg" if rating <= 2 else "mid" if rating == 3 else "pos"


def _order(ids, seed: str):
    return sorted(ids, key=lambda i: hashlib.sha1(f"{seed}:{i}".encode()).hexdigest())


def make_samples(reviews: pd.DataFrame, n_train: int = 4000, n_gold: int = 300, seed: str = "ecoute") -> dict:
    df = reviews[reviews.text.str.len() >= 20].copy()
    df["g"] = df.rating.map(_group)
    brands = sorted(df.brand.unique())
    picked: dict[str, list[str]] = {"gold": [], "train": []}
    taken: set[str] = set()
    for name, n, min_len in (("gold", n_gold, 40), ("train", n_train, 20)):
        per_brand = -(-n // len(brands))
        for b in brands:
            pool = df[(df.brand == b) & (df.text.str.len() >= min_len) & ~df.review_id.isin(taken)]
            chosen = []
            for g, share in MIX.items():
                ids = _order(pool[pool.g == g].review_id, f"{seed}:{name}")
                chosen += ids[: round(per_brand * share)]
            if len(chosen) < per_brand:  # brand short on one star group: fill from the rest
                rest = _order(set(pool.review_id) - set(chosen), f"{seed}:{name}:fill")
                chosen += rest[: per_brand - len(chosen)]
            picked[name] += chosen[:per_brand]
            taken |= set(chosen[:per_brand])
        picked[name] = _order(picked[name], f"{seed}:{name}:final")[:n]
        taken = set(picked["gold"]) | set(picked["train"])
    return {"seed": seed, "created": now().isoformat(), **picked}


def _prompt(batch: pd.DataFrame) -> tuple[str, dict]:
    keymap, items = {}, []
    for i, r in enumerate(batch.itertuples(), 1):
        k = f"r{i}"
        keymap[k] = r.review_id
        text = " ".join(filter(None, [r.title, r.text]))[:1200]
        items.append({"id": k, "brand": r.brand, "sector": r.sector, "stars": int(r.rating), "text": text})
    user = "Annotate these reviews:\n" + json.dumps(items, ensure_ascii=False)
    return user, keymap


def annotate(provider, batch: pd.DataFrame) -> dict[str, dict]:
    """One LLM call for a batch. Returns {review_id: clean annotation} for valid answers only."""
    user, keymap = _prompt(batch)
    data = provider.generate(taxonomy.instructions(), user, taxonomy.response_schema())
    if isinstance(data, dict):
        data = data.get("items") or data.get("reviews") or []
    brand = dict(zip(batch.review_id, batch.brand))
    out = {}
    for item in data if isinstance(data, list) else []:
        rid = keymap.get(str(item.get("id", "")).strip()) if isinstance(item, dict) else None
        if rid and rid not in out:
            clean = taxonomy.clean(item, brand[rid])
            if clean:
                out[rid] = clean
    return out


class Labels:
    def __init__(self, store_dir: Path):
        self.path = Path(store_dir) / "labels.parquet"

    def load(self) -> pd.DataFrame:
        return pd.read_parquet(self.path) if self.path.exists() else pd.DataFrame(columns=["review_id"])

    def append(self, rows: list[dict]) -> None:
        if not rows:
            return
        new = pd.DataFrame(rows)
        for c in ("aspects", "competitors"):
            new[c] = new[c].map(lambda v: json.dumps(v, ensure_ascii=False))
        old = self.load()
        merged = pd.concat([old, new], ignore_index=True) if len(old) else new
        merged = merged.drop_duplicates("review_id", keep="last")
        tmp = self.path.with_suffix(".tmp")
        merged.to_parquet(tmp, index=False)
        tmp.replace(self.path)


def run(store_dir: Path, providers: list, *, limit: int = 5000, batch_size: int = 30,
        save_every: int = 5, max_calls: int | None = None) -> dict:
    store_dir = Path(store_dir)
    samples_path = store_dir / "samples.json"
    reviews = pd.read_parquet(store_dir / "reviews.parquet")
    if samples_path.exists():
        samples = json.loads(samples_path.read_text())
    else:
        samples = make_samples(reviews)
        samples_path.write_text(json.dumps(samples, indent=1))
    which = {rid: "gold" for rid in samples["gold"]} | {rid: "train" for rid in samples["train"]}

    labels = Labels(store_dir)
    done = set(labels.load().review_id)
    order = [r for r in samples["gold"] + samples["train"] if r not in done][:limit]
    todo = reviews.set_index("review_id").loc[[r for r in order if r in set(reviews.review_id)]].reset_index()
    log.info("%d already labelled, %d to label now", len(done), len(todo))

    stats = {"labelled": 0, "failed": 0, "calls": 0, "stopped": None}
    pending, retried, buffer = [todo.iloc[i:i + batch_size] for i in range(0, len(todo), batch_size)], set(), []
    p = 0
    while pending and p < len(providers):
        if max_calls and stats["calls"] >= max_calls:
            stats["stopped"] = "max_calls"
            break
        batch = pending.pop(0)
        provider = providers[p]
        try:
            stats["calls"] += 1
            got = annotate(provider, batch)
        except QuotaExhausted:
            log.warning("Free quota used up for provider %s", provider.name)
            pending.insert(0, batch)
            p += 1
            continue
        except LLMError as e:
            log.warning("Batch failed: %s", e)
            got = {}
        model = getattr(provider, "model", provider.name)
        for rid, a in got.items():
            buffer.append({"review_id": rid, "sample": which.get(rid, "train"), **a, "model": model,
                           "prompt_version": taxonomy.PROMPT_VERSION, "labeled_at": now()})
        stats["labelled"] += len(got)
        missing = batch[~batch.review_id.isin(got)]
        first = missing[~missing.review_id.isin(retried)]
        stats["failed"] += len(missing) - len(first)  # already retried once: give up on these
        retried |= set(first.review_id)
        if len(first):  # retry unanswered reviews once, in smaller batches
            pending += [first.iloc[i:i + 10] for i in range(0, len(first), 10)]
        if stats["calls"] % save_every == 0:
            labels.append(buffer)
            buffer = []
            log.info("progress: %d labelled in %d calls", stats["labelled"], stats["calls"])
    labels.append(buffer)
    if pending and p >= len(providers):
        stats["stopped"] = "free quota used up for today; the next run resumes here"
    all_labels = labels.load()
    stats["total_labelled"] = len(all_labels)
    stats["gold_labelled"] = int((all_labels.get("sample", pd.Series(dtype=str)) == "gold").sum())
    stats["remaining"] = len(samples["gold"]) + len(samples["train"]) - len(all_labels)
    return stats
