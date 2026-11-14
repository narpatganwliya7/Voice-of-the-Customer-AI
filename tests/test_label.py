"""Offline tests for annotation: fake LLMs, no network."""
import json
from types import SimpleNamespace

import pandas as pd
import pytest

from ecoute import label, llm, taxonomy


def reviews(n_brands=4, per_brand=60):
    rows = []
    for b in range(n_brands):
        for i in range(per_brand):
            rows.append({"review_id": f"b{b}-{i}", "brand": f"Brand{b}", "sector": "banking",
                         "rating": [1, 1, 2, 3, 4, 5][i % 6], "title": "",
                         "text": f"L'application plante à chaque connexion depuis la mise à jour {i} " * 2})
    return pd.DataFrame(rows)


class FakeLLM:
    name, model = "fake", "fake-1"

    def __init__(self, quota=None, drop=0):
        self.calls, self.quota, self.drop = 0, quota, drop

    def generate(self, system, user, schema):
        assert "app_reliability" in system and schema["type"] == "ARRAY"
        self.calls += 1
        if self.quota is not None and self.calls > self.quota:
            raise llm.QuotaExhausted("fake")
        items = json.loads(user.split("\n", 1)[1])
        out = [{"id": it["id"], "aspects": [{"aspect": "app_reliability", "sentiment": "negative"},
                                            {"aspect": "not_a_real_aspect", "sentiment": "negative"}],
                "sentiment": "negative", "churn": "app", "competitors": [it["brand"], "Boursorama"],
                "after_update": True, "severity": 7, "gist": "App crashes at login since update"}
               for it in items]
        return out[self.drop:]


def test_samples_are_stratified_disjoint_and_stable():
    df = reviews()
    s1, s2 = label.make_samples(df, n_train=80, n_gold=20), label.make_samples(df, n_train=80, n_gold=20)
    assert s1["gold"] == s2["gold"] and s1["train"] == s2["train"]
    assert len(s1["gold"]) == 20 and len(s1["train"]) == 80
    assert not set(s1["gold"]) & set(s1["train"])
    picked = df[df.review_id.isin(s1["train"])]
    assert picked.brand.nunique() == 4
    assert (picked.rating <= 2).mean() > 0.4  # negatives over-sampled


def test_annotation_is_cleaned_against_taxonomy(tmp_path):
    df = reviews(1, 6)
    got = label.annotate(FakeLLM(), df)
    a = got[df.review_id[0]]
    assert a["aspects"] == [["app_reliability", "negative"]]
    assert a["competitors"] == ["Boursorama"]  # own brand removed
    assert a["severity"] == 3 and a["churn"] == "app" and a["after_update"] is True


def test_run_resumes_and_switches_provider_on_quota(tmp_path):
    df = reviews()
    df.to_parquet(tmp_path / "reviews.parquet")
    (tmp_path / "samples.json").write_text(json.dumps(label.make_samples(df, n_train=100, n_gold=20)))
    first = FakeLLM(quota=2)
    st = label.run(tmp_path, [first], batch_size=10)
    assert st["labelled"] == 20 and "quota" in st["stopped"] and st["remaining"] == 100
    labels = pd.read_parquet(tmp_path / "labels.parquet")
    assert set(labels["sample"]) == {"gold"}  # gold set is labelled first
    st = label.run(tmp_path, [FakeLLM(quota=0), FakeLLM()], batch_size=10)
    assert st["remaining"] == 0 and st["total_labelled"] == 120 and st["gold_labelled"] == 20


def test_unanswered_reviews_are_retried_once(tmp_path):
    df = reviews(1, 30)
    df.to_parquet(tmp_path / "reviews.parquet")
    (tmp_path / "samples.json").write_text(json.dumps({"gold": [], "train": list(df.review_id[:10])}))
    fake = FakeLLM(drop=2)  # every answer misses its first 2 reviews
    st = label.run(tmp_path, [fake], batch_size=10)
    assert fake.calls == 2 and st["labelled"] == 8 + 0 and st["failed"] == 2


def test_rank_gemini_prefers_stable_flash():
    names = ["gemini-2.5-flash-lite", "gemini-2.5-flash", "gemini-3-flash-preview", "gemini-2.5-pro",
             "gemini-2.5-flash-image", "gemini-2.0-flash", "text-embedding-004", "gemini-2.5-flash-preview-tts"]
    assert llm.rank_gemini(names) == ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-3-flash-preview",
                                      "gemini-2.5-flash-lite"]


def _resp(code, body):
    return SimpleNamespace(status_code=code, json=lambda: body, text=json.dumps(body))


def test_gemini_handles_rate_limit_then_daily_quota(monkeypatch):
    monkeypatch.setattr(llm.time, "sleep", lambda s: None)
    per_minute = _resp(429, {"error": {"details": [{"@type": "type.googleapis.com/google.rpc.RetryInfo", "retryDelay": "3s"}]}})
    per_day = _resp(429, {"error": {"details": [{"@type": "type.googleapis.com/google.rpc.QuotaFailure",
                                                 "violations": [{"quotaId": "GenerateRequestsPerDayPerProjectPerModel-FreeTier"}]}]}})
    ok = _resp(200, {"candidates": [{"content": {"parts": [{"text": "thinking", "thought": True},
                                                           {"text": '[{"id": "r1"}]'}]}}]})
    calls = []

    def post(url, **k):
        calls.append(url.split("/models/")[1].split(":")[0])
        return {1: per_minute, 2: per_day}.get(len(calls), ok)

    g = llm.Gemini("k", models=["gemini-2.5-flash", "gemini-2.5-flash-lite"], min_interval=0,
                   session=SimpleNamespace(post=post))
    assert g.generate("s", "u", {}) == [{"id": "r1"}]
    assert calls == ["gemini-2.5-flash", "gemini-2.5-flash", "gemini-2.5-flash-lite"]
    assert g.model == "gemini-2.5-flash-lite"


def test_schema_and_instructions_cover_taxonomy():
    sch = taxonomy.response_schema()
    enum = sch["items"]["properties"]["aspects"]["items"]["properties"]["aspect"]["enum"]
    assert enum == list(taxonomy.ASPECTS) and len(enum) == 15
    for k in taxonomy.ASPECTS:
        assert k in taxonomy.instructions()


def test_no_provider_configured(monkeypatch):
    for v in ("GEMINI_API_KEY", "LLM_API_KEY"):
        monkeypatch.delenv(v, raising=False)
    with pytest.raises(llm.LLMError):
        llm.providers_from_env()


def test_agent_sql_quotes_reserved_at_column():
    from ecoute.agent import quote_reserved
    q = quote_reserved("SELECT at, f.at FROM facts WHERE text LIKE '%at%' ORDER BY at")
    assert q == "SELECT \"at\", f.\"at\" FROM facts WHERE text LIKE '%at%' ORDER BY \"at\""
    assert quote_reserved('select "at" from facts') == 'select "at" from facts'
