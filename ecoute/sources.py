"""Review sources. Each fetcher returns normalised, PII-free rows.

Row schema (one dict per review):
  review_id, brand, sector, source, app_id, rating, title, text, at,
  app_version, thumbs_up, replied, reply_at, collected_at
Usernames, avatars and platform ids are never stored.
"""
from __future__ import annotations

import logging
import time
from datetime import datetime, timedelta

import requests
from google_play_scraper import Sort
from google_play_scraper import reviews as play_reviews

from .common import now, review_id, scrub, utc

log = logging.getLogger(__name__)
RSS = "https://itunes.apple.com/{country}/rss/customerreviews/page={page}/id={app}/sortby=mostrecent/json"


def _row(brand, sector, source, app_id, oid, rating, title, text, at, version, thumbs, reply_at, collected):
    return {
        "review_id": review_id(source, oid),
        "brand": brand,
        "sector": sector,
        "source": source,
        "app_id": app_id,
        "rating": int(rating) if rating is not None else None,
        "title": scrub(title),
        "text": scrub(text),
        "at": utc(at),
        "app_version": version,
        "thumbs_up": int(thumbs or 0),
        "replied": reply_at is not None,
        "reply_at": utc(reply_at),
        "collected_at": collected,
    }


def fetch_play(brand: str, sector: str, app_id: str, *, country: str, lang: str,
               since: datetime | None, max_reviews: int, batch: int = 200,
               fetch=play_reviews, pause: float = 0.5) -> list[dict]:
    """Newest-first. Stops at `since` (minus 1h overlap for late-indexed reviews) or `max_reviews`."""
    stop = utc(since) - timedelta(hours=1) if since else None
    rows, token, collected = [], None, now()
    while len(rows) < max_reviews:
        try:
            got, token = fetch(app_id, lang=lang, country=country, sort=Sort.NEWEST,
                               count=min(batch, max_reviews - len(rows)), continuation_token=token)
        except Exception as e:  # noqa: BLE001 - network hiccup: keep what we have
            log.warning("play %s: %s", app_id, e)
            break
        if not got:
            break
        reached = False
        for r in got:
            at = utc(r.get("at"))
            if stop and at and at < stop:
                reached = True
                break
            rows.append(_row(brand, sector, "google_play", app_id, r.get("reviewId"), r.get("score"),
                             None, r.get("content"), at, r.get("reviewCreatedVersion") or r.get("appVersion"),
                             r.get("thumbsUpCount"), r.get("repliedAt"), collected))
        if reached or token is None or getattr(token, "token", "x") is None:
            break
        time.sleep(pause)
    return rows[:max_reviews]


def fetch_appstore(brand: str, sector: str, app_id: str, *, country: str,
                   since: datetime | None, max_pages: int = 10,
                   session: requests.Session | None = None, pause: float = 0.5) -> list[dict]:
    """Apple's public RSS feed: up to 10 pages x 50 most recent reviews."""
    s = session or requests.Session()
    since = utc(since) - timedelta(hours=1) if since else None
    rows, collected = [], now()
    for page in range(1, max_pages + 1):
        try:
            r = s.get(RSS.format(country=country, page=page, app=app_id), timeout=20)
            if r.status_code != 200:
                break
            entries = r.json().get("feed", {}).get("entry", [])
        except Exception as e:  # noqa: BLE001
            log.warning("appstore %s p%d: %s", app_id, page, e)
            break
        if isinstance(entries, dict):
            entries = [entries]
        if not entries:
            break
        reached = False
        for e in entries:
            if "im:rating" not in e:  # app metadata entry, not a review
                continue
            at = _parse_dt(e.get("updated", {}).get("label"))
            if since and at and at < since:
                reached = True
                break
            rows.append(_row(brand, sector, "app_store", app_id, e.get("id", {}).get("label"),
                             e["im:rating"].get("label"), e.get("title", {}).get("label"),
                             e.get("content", {}).get("label"), at,
                             e.get("im:version", {}).get("label"), e.get("im:voteSum", {}).get("label"),
                             None, collected))
        if reached:
            break
        time.sleep(pause)
    return rows


def _parse_dt(s: str | None) -> datetime | None:
    if not s:
        return None
    try:
        return utc(datetime.fromisoformat(s))
    except ValueError:
        return None
