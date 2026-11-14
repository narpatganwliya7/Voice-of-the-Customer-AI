"""Find each brand's official app on Google Play and the App Store.

An app is accepted only when its developer matches the brand's `dev` pattern
(and title matches `title` if set), so a look-alike or third-party app is never tracked.
"""
from __future__ import annotations

import logging
import re

import requests
from google_play_scraper import app as play_app

from .common import slug

log = logging.getLogger(__name__)
PLAY_SEARCH = "https://play.google.com/store/search"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"
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
    for app_id in search_play_ids(brand["query"], country, lang):
        try:
            d = play_app(app_id, lang=lang, country=country)
        except Exception:  # noqa: BLE001
            continue
        if _ok(brand, d.get("developer"), d.get("title")):
            return _play_info(d)
    log.error("%s: no official Google Play app found", brand["name"])
    return None


def search_play_ids(query: str, country: str, lang: str, limit: int = 8,
                    session: requests.Session | None = None) -> list[str]:
    """App ids from the Play Store search page, in ranking order.

    Reads the public search page directly (the scraper library's search parser
    breaks whenever Google changes its page layout); each id is then verified
    through the app details page, so only the id list is taken from here.
    """
    s = session or requests.Session()
    try:
        r = s.get(PLAY_SEARCH, params={"q": query, "c": "apps", "hl": lang, "gl": country.upper()},
                  headers={"User-Agent": UA, "Accept-Language": lang}, timeout=20)
        r.raise_for_status()
    except Exception as e:  # noqa: BLE001
        log.error("play search %r failed: %s", query, e)
        return []
    ids = []
    for m in re.finditer(r"/store/apps/details\?id=([A-Za-z0-9_.]+)", r.text):
        if m.group(1) not in ids:
            ids.append(m.group(1))
    return ids[:limit]


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
