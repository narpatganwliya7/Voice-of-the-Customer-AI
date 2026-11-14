"""Review store: one Parquet file, deduplicated by review_id, plus a JSONL run log.

The store lives on the repo's `data` branch (see .github/workflows/collect.yml),
so `main` stays code-only.
"""
from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path

import duckdb
import pandas as pd

COLUMNS = ["review_id", "brand", "sector", "source", "app_id", "rating", "title", "text", "at",
           "app_version", "thumbs_up", "replied", "reply_at", "collected_at"]


class Store:
    def __init__(self, root: Path):
        self.root = Path(root)
        self.root.mkdir(parents=True, exist_ok=True)
        self.reviews = self.root / "reviews.parquet"
        self.runs = self.root / "runs.jsonl"
        self.apps = self.root / "apps.json"

    # --- reviews -------------------------------------------------------
    def last_seen(self) -> dict[tuple[str, str], datetime]:
        """Newest review time per (brand, source); used for incremental collection."""
        if not self.reviews.exists():
            return {}
        q = f"select brand, source, max(\"at\") from read_parquet('{self.reviews}') group by 1, 2"
        return {(b, s): t for b, s, t in duckdb.connect().execute(q).fetchall() if t is not None}

    def add(self, rows: list[dict]) -> list[dict]:
        """Insert rows not already stored. Returns only the new rows."""
        if not rows:
            return []
        new = pd.DataFrame(rows, columns=COLUMNS).drop_duplicates("review_id")
        if self.reviews.exists():
            old = pd.read_parquet(self.reviews)
            new = new[~new.review_id.isin(set(old.review_id))]
            merged = pd.concat([old, new], ignore_index=True) if len(new) else old
        else:
            merged = new
        if len(new):
            for c in ("at", "reply_at", "collected_at"):
                merged[c] = pd.to_datetime(merged[c], utc=True)
            merged = merged.sort_values(["brand", "at"], ascending=[True, False])
            tmp = self.reviews.with_suffix(".tmp")
            merged.to_parquet(tmp, index=False, compression="zstd")
            tmp.replace(self.reviews)
        return new.to_dict("records")

    def count(self) -> int:
        if not self.reviews.exists():
            return 0
        return duckdb.connect().execute(f"select count(*) from read_parquet('{self.reviews}')").fetchone()[0]

    # --- metadata ------------------------------------------------------
    def save_apps(self, apps: dict) -> None:
        self.apps.write_text(json.dumps(apps, ensure_ascii=False, indent=2), encoding="utf-8")

    def load_apps(self) -> dict:
        return json.loads(self.apps.read_text(encoding="utf-8")) if self.apps.exists() else {}

    def log_run(self, run: dict) -> None:
        with self.runs.open("a", encoding="utf-8") as f:
            f.write(json.dumps(run, ensure_ascii=False, default=str) + "\n")
