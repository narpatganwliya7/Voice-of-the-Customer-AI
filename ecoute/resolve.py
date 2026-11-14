"""Find each brand's official app on Google Play and the App Store.

An app is accepted only when its developer matches the brand's `dev` pattern
(and title matches `title` if set), so a look-alike or third-party app is never tracked.
"""
from __future__ import annotations

import logging
import re

import requests
from google_play_scraper import app as play_app
from google_play_scraper import search as play_search

from .common import slug

log = logging.getLogger(__name__)
ITUNES_SEARCH = "https://itunes.apple.com/search"
ITUNES_LOOKUP = "https://itunes.apple.com/lookup"


def _ok(brand: dict, developer: str | None, title: str | None) -> bool:
    if not developer or not re.search(brand["dev"], developer, re.I):
        return False
    if brand.get("title") and not re.search(brand["title"], title or "", re.I):
        return False
    return True


def resolve_play(brand: dict, country: str, lang: str) -> dict | None:
    hint = brand.get("play")
    if hint:
        try:
            d = play_app(hint, lang=lang, country=country)
            if _ok(brand, d.get("developer"), d.get("title")):
                return _play_info(d)
            log.warning("%s: play hint %s has developer %r, searching instead", brand["name"], hint, d.get("developer"))
        except Exception as e:  # noqa: BLE001 - app removed / renamed
            log.warning("%s: play hint %s failed (%s), searching instead", brand["name"], hint, e)
    try:
        hits = play_search(brand["query"], n_hits=10, lang=lang, country=country)
    except Exception as e:  # noqa: BLE001
        log.error("%s: play search failed: %s", brand["name"], e)
        return None
    for h in hits:
        if h.get("appId") and _ok(brand, h.get("developer"), h.get("title")):
            try:
                return _play_info(play_app(h["appId"], lang=lang, country=country))
            except Exception:  # noqa: BLE001
                return {"id": h["appId"], "title": h.get("title"), "developer": h.get("developer")}
    return None


def _play_info(d: dict) -> dict:
    return {
        "id": d.get("appId"),
        "title": d.get("title"),
        "developer": d.get("developer"),
        "score": d.get("score"),
        "ratings": d.get("ratings"),
        "installs": d.get("installs"),
        "version": d.get("version"),
    }


def resolve_ios(brand: dict, country: str, session: requests.Session | None = None) -> dict | None:
    s = session or requests.Session()
    try:
        if brand.get("ios"):
            r = s.get(ITUNES_LOOKUP, params={"id": brand["ios"], "country": country}, timeout=20)
            results = r.json().get("results", [])
        else:
            results = []
        if not results or not _ios_ok(brand, results[0]):
            r = s.get(ITUNES_SEARCH, params={"term": brand["query"], "country": country,
                                             "entity": "software", "limit": 10}, timeout=20)
            results = r.json().get("results", [])
    except Exception as e:  # noqa: BLE001
        log.error("%s: app store lookup failed: %s", brand["name"], e)
        return None
    for d in results:
        if _ios_ok(brand, d):
            return {
                "id": str(d["trackId"]),
                "title": d.get("trackName"),
                "developer": d.get("artistName") or d.get("sellerName"),
                "score": d.get("averageUserRating"),
                "ratings": d.get("userRatingCount"),
                "version": d.get("version"),
            }
    return None


def _ios_ok(brand: dict, d: dict) -> bool:
    return _ok(brand, d.get("artistName") or d.get("sellerName"), d.get("trackName"))


def resolve_all(cfg: dict, only: set[str] | None = None) -> dict:
    country, lang = cfg["market"]["country"], cfg["market"]["lang"]
    session = requests.Session()
    out = {}
    for b in cfg["brands"]:
        key = slug(b["name"])
        if only and key not in only:
            continue
        play = resolve_play(b, country, lang)
        ios = resolve_ios(b, country, session)
        out[key] = {"name": b["name"], "sector": b["sector"], "play": play, "ios": ios}
        log.info("%-18s play=%-40s ios=%s", b["name"], (play or {}).get("id"), (ios or {}).get("id"))
    return out
