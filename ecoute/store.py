"""Review store: one Parquet file per brand, deduplicated by review_id, plus a JSONL run log.

The store lives on the repo's `data` branch (see scripts/databranch.sh), so `main` stays
code-only. One file per brand keeps every file small and every write cheap.
"""
from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path

import duckdb
import pandas as pd

from .common import slug

COLUMNS = ["review_id", "brand", "sector", "source", "app_id", "rating", "title", "text", "at",
           "app_version", "thumbs_up", "replied", "reply_at", "collected_at"]


class Store:
    def __init__(self, root: Path):
        self.root = Path(root)
        self.root.mkdir(parents=True, exist_ok=True)
        self.dir = self.root / "reviews"
        self.dir.mkdir(exist_ok=True)
        self.runs = self.root / "runs.jsonl"
        self.apps = self.root / "apps.json"
        legacy = self.root / "reviews.parquet"
        if legacy.exists():  # migrate the single-file layout
            df = pd.read_parquet(legacy)
            for _, part in df.groupby("brand"):
                self._write(part)
            legacy.unlink()

    def _file(self, brand: str) -> Path:
        return self.dir / f"{slug(brand)}.parquet"

    def _write(self, df: pd.DataFrame) -> None:
        df = df.reindex(columns=COLUMNS)
        for c in ("at", "reply_at", "collected_at"):
            df[c] = pd.to_datetime(df[c], utc=True)
        df = df.sort_values("at", ascending=False)
        path = self._file(df.brand.iloc[0])
        tmp = path.with_suffix(".tmp")
        df.to_parquet(tmp, index=False, compression="zstd")
        tmp.replace(path)

    def _glob(self) -> str | None:
        return str(self.dir / "*.parquet") if any(self.dir.glob("*.parquet")) else None

    # --- reviews -------------------------------------------------------
    def read(self, columns: list[str] | None = None) -> pd.DataFrame:
        files = sorted(self.dir.glob("*.parquet"))
        if not files:
            return pd.DataFrame(columns=columns or COLUMNS)
        return pd.concat([pd.read_parquet(f, columns=columns) for f in files], ignore_index=True)

    def last_seen(self) -> dict[tuple[str, str], datetime]:
        """Newest review time per (brand, source); used for incremental collection."""
        g = self._glob()
        if not g:
            return {}
        q = f"select brand, source, max(\"at\") from read_parquet('{g}') group by 1, 2"
        return {(b, s): t for b, s, t in duckdb.connect().execute(q).fetchall() if t is not None}

    def add(self, rows: list[dict]) -> list[dict]:
        """Insert rows not already stored. Returns only the new rows."""
        if not rows:
            return []
        new_all = pd.DataFrame(rows, columns=COLUMNS).drop_duplicates("review_id")
        added = []
        for brand, new in new_all.groupby("brand"):
            path = self._file(brand)
            if path.exists():
                old = pd.read_parquet(path)
                new = new[~new.review_id.isin(set(old.review_id))]
                if not len(new):
                    continue
                self._write(pd.concat([old, new], ignore_index=True))
            else:
                self._write(new.copy())
            added += new.to_dict("records")
        return added

    def keep_apps(self, valid: set[tuple[str, str, str]]) -> int:
        """Drop reviews from apps that are no longer the brand's verified app. Returns rows removed."""
        removed = 0
        for path in self.dir.glob("*.parquet"):
            df = pd.read_parquet(path)
            keep = [(b, s, a) in valid for b, s, a in zip(df.brand, df.source, df.app_id)]
            gone = len(df) - sum(keep)
            if gone:
                removed += gone
                if sum(keep):
                    self._write(df[keep].copy())
                else:
                    path.unlink()
        return removed

    def count(self) -> int:
        g = self._glob()
        return duckdb.connect().execute(f"select count(*) from read_parquet('{g}')").fetchone()[0] if g else 0

    # --- metadata ------------------------------------------------------
    def save_apps(self, apps: dict) -> None:
        self.apps.write_text(json.dumps(apps, ensure_ascii=False, indent=2), encoding="utf-8")

    def load_apps(self) -> dict:
        return json.loads(self.apps.read_text(encoding="utf-8")) if self.apps.exists() else {}

    def log_run(self, run: dict) -> None:
        with self.runs.open("a", encoding="utf-8") as f:
            f.write(json.dumps(run, ensure_ascii=False, default=str) + "\n")
