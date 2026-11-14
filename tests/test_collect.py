"""Offline tests: no network. Platform responses are faked."""
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pandas as pd

from ecoute import resolve, sources
from ecoute.common import load_config, scrub, slug
from ecoute.store import Store

T0 = datetime(2026, 11, 10, 12, 0, tzinfo=timezone.utc)


def play_review(i, minutes_ago, score=1, text="Appli plante"):
    return {"reviewId": f"gp:{i}", "userName": "Jean Dupont", "userImage": "http://x/img.png",
            "content": text, "score": score, "thumbsUpCount": 3,
            "reviewCreatedVersion": "5.1.0", "at": (T0 - timedelta(minutes=minutes_ago)).replace(tzinfo=None),
            "replyContent": None, "repliedAt": None}


class FakePlay:
    """Newest-first pages of 3, like google_play_scraper.reviews."""
    def __init__(self, items):
        self.items, self.calls = items, 0

    def __call__(self, app_id, lang, country, sort, count, continuation_token):
        self.calls += 1
        start = continuation_token.pos if continuation_token else 0
        page = self.items[start:start + min(count, 3)]
        nxt = start + len(page)
        return page, SimpleNamespace(pos=nxt, token=("t" if nxt < len(self.items) else None))


def test_scrub_removes_personal_data():
    t = scrub("Appelez moi au 06 12 34 56 78 ou jean.d@gmail.com, client 123456789012, IBAN FR76 3000 6000 0112 3456 7890 189")
    assert "06 12" not in t and "gmail" not in t and "123456789012" not in t and "FR76" not in t
    assert "[phone]" in t and "[email]" in t and "[number]" in t and "[iban]" in t
    assert scrub("Version 5.2, 3 étoiles") == "Version 5.2, 3 étoiles"


def test_play_rows_have_no_user_data_and_stop_at_since():
    fake = FakePlay([play_review(i, i * 60) for i in range(10)])  # one review per hour
    rows = sources.fetch_play("Revolut", "banking", "com.revolut.revolut", country="fr", lang="fr",
                              since=T0 - timedelta(hours=4), max_reviews=100, fetch=fake, pause=0)
    # keeps reviews newer than since - 1h overlap: 0..5h ago
    assert len(rows) == 6
    assert fake.calls == 3  # stops on the page that crosses `since`
    r = rows[0]
    assert "userName" not in r and "Jean" not in str(r) and r["review_id"] != "gp:0"
    assert r["at"].tzinfo is not None and r["source"] == "google_play" and r["rating"] == 1


def test_play_backfill_respects_max():
    fake = FakePlay([play_review(i, i) for i in range(50)])
    rows = sources.fetch_play("X", "s", "a", country="fr", lang="fr", since=None, max_reviews=7, fetch=fake, pause=0)
    assert len(rows) == 7


def test_appstore_rss_parsing(monkeypatch):
    def entry(i, hours_ago):
        return {"author": {"name": {"label": "Marie"}}, "im:rating": {"label": "2"},
                "im:version": {"label": "8.0"}, "id": {"label": str(1000 + i)},
                "title": {"label": "Bof"}, "content": {"label": "Trop de bugs, mail marie@x.fr"},
                "im:voteSum": {"label": "4"},
                "updated": {"label": (T0 - timedelta(hours=hours_ago)).isoformat()}}

    pages = {1: [{"im:name": {"label": "App"}}] + [entry(i, i) for i in range(3)], 2: [entry(i, i) for i in range(3, 6)]}

    class Sess:
        def get(self, url, timeout):
            page = int(url.split("page=")[1].split("/")[0])
            return SimpleNamespace(status_code=200, json=lambda: {"feed": {"entry": pages.get(page, [])}})

    rows = sources.fetch_appstore("Orange", "telecom", "123", country="fr", since=None, session=Sess(), pause=0)
    assert len(rows) == 6
    assert rows[0]["rating"] == 2 and "[email]" in rows[0]["text"] and "Marie" not in str(rows)
    rows = sources.fetch_appstore("Orange", "telecom", "123", country="fr", since=T0 - timedelta(hours=1),
                                  session=Sess(), pause=0)
    assert len(rows) == 3  # 0h,1h,2h ago (1h overlap)


def test_store_dedupes_and_tracks_last_seen(tmp_path):
    fake = FakePlay([play_review(i, i * 10) for i in range(5)])
    rows = sources.fetch_play("N26", "banking", "de.number26.android", country="fr", lang="fr",
                              since=None, max_reviews=5, fetch=fake, pause=0)
    s = Store(tmp_path)
    assert len(s.add(rows)) == 5
    assert len(s.add(rows)) == 0
    assert s.count() == 5
    last = s.last_seen()[("N26", "google_play")]
    assert pd.Timestamp(last).tz_convert("UTC") == pd.Timestamp(T0)


def test_resolver_rejects_lookalike_apps(monkeypatch):
    brand = {"name": "Uber Eats", "query": "Uber Eats", "dev": "^Uber", "title": "Eats"}
    details = {
        "com.fake.eats": {"title": "Uber Eats Guide", "developer": "Some Dev"},
        "com.ubercab": {"title": "Uber - Commandez une course", "developer": "Uber Technologies, Inc."},
        "com.ubercab.eats": {"title": "Uber Eats : livraison", "developer": "Uber Technologies, Inc."},
    }
    html = "".join(f'<a href="/store/apps/details?id={i}">x</a>' for i in details)
    monkeypatch.setattr(resolve.requests, "Session", lambda: SimpleNamespace(
        get=lambda *a, **k: SimpleNamespace(text=html, raise_for_status=lambda: None)))
    monkeypatch.setattr(resolve, "play_app", lambda app_id, **k: {"appId": app_id, **details[app_id]})
    assert resolve.resolve_play(brand, "fr", "fr")["id"] == "com.ubercab.eats"


def test_config_is_valid():
    cfg = load_config()
    names = [b["name"] for b in cfg["brands"]]
    assert len(names) == len(set(names)) >= 40
    assert len({slug(n) for n in names}) == len(names)
    for b in cfg["brands"]:
        assert {"name", "sector", "query", "dev"} <= b.keys()


def test_full_run_offline(tmp_path, monkeypatch):
    from ecoute import collect
    apps = {"orange": {"name": "Orange", "sector": "telecom", "play": {"id": "com.orange"}, "ios": {"id": "1"}},
            "free": {"name": "Free", "sector": "telecom", "play": None, "ios": None}}
    monkeypatch.setattr(collect, "resolve_all", lambda cfg, only=None: apps)
    fake = FakePlay([play_review(i, i * 5) for i in range(8)])
    monkeypatch.setattr(collect, "fetch_play", lambda *a, **k: sources.fetch_play(*a, **k, fetch=fake, pause=0))
    monkeypatch.setattr(collect, "fetch_appstore", lambda *a, **k: [])
    monkeypatch.delenv("GITHUB_STEP_SUMMARY", raising=False)
    rep = collect.run(tmp_path, mode="incremental", max_per_app=100)
    assert rep["new_reviews"] == 8 and rep["unresolved"] == ["Free"]
    assert rep["capture_lag_min"]["median"] > 0
    assert len(Store(tmp_path).runs.read_text().splitlines()) == 1
    rep2 = collect.run(tmp_path, mode="incremental", max_per_app=100)  # nothing new second time
    assert rep2["new_reviews"] == 0
