"""Shared helpers: config, ids, PII scrubbing, time."""
from __future__ import annotations

import hashlib
import re
import unicodedata
from datetime import datetime, timezone
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent.parent
CONFIG = ROOT / "config" / "brands.yaml"

EMAIL = re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+")
# French and international phone numbers: 06 12 34 56 78, +33 6 12 34 56 78, 0612345678
PHONE = re.compile(r"(?<!\d)(?:\+33\s?|0033\s?|0)[1-9](?:[\s.-]?\d{2}){4}(?!\d)")
IBAN = re.compile(r"\bFR\d{2}(?:\s?[0-9A-Z]{4}){5}\s?[0-9A-Z]{3}\b", re.I)
LONG_NUM = re.compile(r"(?<!\d)\d{9,}(?!\d)")  # account / order / customer numbers


def load_config(path: Path = CONFIG) -> dict:
    return yaml.safe_load(path.read_text(encoding="utf-8"))


def slug(name: str) -> str:
    s = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def review_id(source: str, original_id: str) -> str:
    """Stable, non-reversible id: we never store the platform's own review/user ids."""
    return hashlib.sha256(f"{source}:{original_id}".encode()).hexdigest()[:20]


def scrub(text: str | None) -> str:
    """Remove personal data customers sometimes paste into reviews."""
    if not text:
        return ""
    text = EMAIL.sub("[email]", text)
    text = IBAN.sub("[iban]", text)
    text = PHONE.sub("[phone]", text)
    text = LONG_NUM.sub("[number]", text)
    return text.strip()


def utc(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt.astimezone(timezone.utc)


def now() -> datetime:
    return datetime.now(timezone.utc).replace(microsecond=0)
