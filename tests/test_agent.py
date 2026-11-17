"""The analyst agent with a scripted fake LLM: tool plumbing, safety and evidence checks."""
import json

from ecoute import agent, insights
from tests.test_insights import build_store


class ScriptedLLM:
    """Plays back a fixed investigation, the way Gemini would answer with function calls."""
    model = "scripted"

    def __init__(self):
        self.turn, self.seen = 0, []

    def chat(self, system, contents, tools):
        assert "submit_brief" in [t["name"] for t in tools]
        self.seen.append(contents[-1])
        self.turn += 1
        if self.turn == 1:
            return {"role": "model", "parts": [{"text": "Check drivers first."},
                                               {"functionCall": {"name": "key_drivers", "args": {"brand": "SFR"}}}]}
        if self.turn == 2:
            return {"role": "model", "parts": [{"functionCall": {"name": "run_sql", "args": {
                "query": "select app_version, count(*) n from facts where brand = 'SFR' and after_update group by 1"}}}]}
        if self.turn == 3:
            return {"role": "model", "parts": [{"functionCall": {"name": "run_sql", "args": {"query": "drop table facts"}}}]}
        if self.turn == 4:
            return {"role": "model", "parts": [{"functionCall": {"name": "search_reviews", "args": {
                "brand": "SFR", "aspect": "login_access", "polarity": "negative", "limit": 3}}}]}
        reviews = [p["functionResponse"]["response"] for p in contents[-1]["parts"] if "functionResponse" in p]
        ids = [r["review_id"] for r in reviews[0]["reviews"][:2]] if reviews and "reviews" in reviews[0] else []
        return {"role": "model", "parts": [{"functionCall": {"name": "submit_brief", "args": {
            "headline": "Login failures cost SFR stars", "what_happened": "x", "root_cause": "likely SMS codes",
            "impact": "y", "evidence_review_ids": ids + ["made-up-id"] * (self.turn > 99),
            "actions": [{"action": "Fix SMS delivery", "team": "IT security", "expected_effect": "+0.5 stars"}],
            "confidence": "medium"}}}]}


def test_agent_investigation_is_logged_safe_and_verified(tmp_path):
    store = build_store(tmp_path)
    insights.build(store)
    llm = ScriptedLLM()
    res = agent.Analyst(llm, store).investigate({"type": "top_driver", "brand": "SFR"})
    assert res["status"] == "filed" and res["brief"]["headline"].startswith("Login")
    assert [s["tool"] for s in res["steps"]] == ["key_drivers", "run_sql", "run_sql", "search_reviews", "submit_brief"]
    blocked = res["steps"][2]["result_preview"]
    assert "read-only" in blocked  # the drop was refused
    assert res["evidence_verified"] and len(res["evidence"]) == 2
    assert res["steps"][0]["thought"] == "Check drivers first."


def test_unverifiable_evidence_is_flagged(tmp_path):
    store = build_store(tmp_path)
    insights.build(store)
    llm = ScriptedLLM()
    llm.turn = 4  # skip straight to filing without reading reviews
    res = agent.Analyst(llm, store).investigate({"type": "top_driver", "brand": "SFR"})
    assert res["status"] == "filed"
    assert res["evidence"] == [] and res["evidence_verified"] is False


def test_cases_are_prioritised(tmp_path):
    store = build_store(tmp_path)
    con = insights.connect(store)
    found = agent.cases(con)
    assert any(c["type"] == "top_driver" and c["brand"] == "SFR" for c in found)
    assert len({(c["type"], c["brand"]) for c in found}) == len(found)
    json.dumps(found)


class GreedyLLM:
    """Asks for many tools in one reply, then more: the budget must hold across and within replies."""
    model = "greedy"

    def __init__(self):
        self.turn = 0

    def chat(self, system, contents, tools):
        self.turn += 1
        if self.turn <= 2:
            call = {"functionCall": {"name": "key_drivers", "args": {"brand": "SFR"}}}
            return {"role": "model", "parts": [call] * 5}
        return {"role": "model", "parts": [{"functionCall": {"name": "submit_brief", "args": {
            "headline": "h", "what_happened": "w", "root_cause": "r", "impact": "i", "evidence_review_ids": [],
            "actions": [], "confidence": "low"}}}]}


def test_tool_budget_counts_every_call(tmp_path):
    store = build_store(tmp_path)
    insights.build(store)
    res = agent.Analyst(GreedyLLM(), store).investigate({"type": "top_driver", "brand": "SFR"})
    tool_steps = [s for s in res["steps"] if s["tool"] == "key_drivers"]
    assert len(tool_steps) == 10  # all ten requests are logged...
    refused = [s for s in tool_steps if "tool budget" in s["result_preview"]]
    assert len(refused) == 10 - agent.MAX_TOOL_CALLS  # ...but only the first six ran
    assert res["tool_calls"] == agent.MAX_TOOL_CALLS and res["status"] == "filed"
