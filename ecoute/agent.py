"""Écoute Analyst: an AI agent that investigates what the numbers flag.

Deep lane. The fast lane (classifier + SQL) runs on every review and costs nothing;
this agent is called only when something needs a human-quality explanation:
a complaint spike, a release that landed badly, or a brand's biggest driver of lost stars.

The agent works with tools over the same DuckDB tables (read-only SQL, review search,
key drivers), must back every claim with a tool result, and files a structured brief.
Every step is logged so the website can replay the investigation.
"""
from __future__ import annotations

import json
import logging
import re
from datetime import timedelta
from pathlib import Path

import pandas as pd

from . import insights
from .common import now
from .llm import LLMError, QuotaExhausted
from .taxonomy import ASPECTS

log = logging.getLogger(__name__)
MAX_TURNS = 9         # model replies per investigation
MAX_TOOL_CALLS = 6    # investigation tool calls (run_sql, search_reviews, key_drivers); submit_brief is extra
SAFE_SQL = re.compile(r"^\s*(select|with)\b", re.I)
BLOCKED = re.compile(r"\b(insert|update|delete|drop|create|alter|attach|copy|export|install|load|pragma|set|call)\b|read_|glob\(|;", re.I)

TOOLS = [
    {"name": "run_sql",
     "description": ("Run a read-only DuckDB SELECT. Tables: facts(review_id, brand, sector, source, rating, \"at\" (review time; always double-quote it), "
                     "app_version, replied, title, text, sentiment, churn, severity, after_update, aspects, competitors, "
                     "label_source, in_window), mentions(review_id, brand, sector, rating, \"at\", in_window, aspect, polarity), "
                     "scorecard, heatmap, weekly, weekly_topics, releases, daily, spikes, switching. Max 30 rows returned."),
     "parameters": {"type": "OBJECT", "properties": {"query": {"type": "STRING"}}, "required": ["query"]}},
    {"name": "search_reviews",
     "description": "Read real customer reviews (French). Filter by brand, topic, polarity, star rating, date range or words.",
     "parameters": {"type": "OBJECT", "properties": {
         "brand": {"type": "STRING"},
         "aspect": {"type": "STRING", "enum": list(ASPECTS)},
         "polarity": {"type": "STRING", "enum": ["negative", "positive", "neutral"]},
         "max_rating": {"type": "INTEGER"},
         "since": {"type": "STRING", "description": "YYYY-MM-DD"},
         "until": {"type": "STRING", "description": "YYYY-MM-DD"},
         "contains": {"type": "STRING", "description": "word or phrase to look for"},
         "app_version": {"type": "STRING"},
         "limit": {"type": "INTEGER"}}, "required": ["brand"]}},
    {"name": "key_drivers",
     "description": "Stars lost per topic for a brand over the last 60 days (ridge regression of rating on topic complaints).",
     "parameters": {"type": "OBJECT", "properties": {"brand": {"type": "STRING"}}, "required": ["brand"]}},
    {"name": "submit_brief",
     "description": "File the final brief. Call exactly once, when the investigation is complete.",
     "parameters": {"type": "OBJECT", "properties": {
         "headline": {"type": "STRING", "description": "one sentence, max 18 words, with the key number"},
         "what_happened": {"type": "STRING"},
         "root_cause": {"type": "STRING", "description": "most likely cause, stated as a hypothesis when uncertain"},
         "impact": {"type": "STRING", "description": "quantified: reviews affected, stars lost, share of customers"},
         "evidence_review_ids": {"type": "ARRAY", "items": {"type": "STRING"}},
         "actions": {"type": "ARRAY", "items": {"type": "OBJECT", "properties": {
             "action": {"type": "STRING"}, "team": {"type": "STRING"}, "expected_effect": {"type": "STRING"}},
             "required": ["action", "team", "expected_effect"]}},
         "confidence": {"type": "STRING", "enum": ["high", "medium", "low"]}},
         "required": ["headline", "what_happened", "root_cause", "impact", "evidence_review_ids", "actions", "confidence"]}},
]

SYSTEM = """You are Écoute Analyst, a senior customer-experience analyst. You investigate one case
about a French company's app using the tools, then file a brief with submit_brief.

Rules:
- Every number you write must come from a tool result in this investigation. Never estimate or invent.
- Read real reviews before concluding; cite 2 to 4 review_ids as evidence.
- Separate what the data shows from what you infer. Say "likely" when inferring.
- Recommendations must be concrete and owned by a team (Mobile, Payments, IT security, Customer service, Product, Ops).
- Be efficient: at most 6 investigation tool calls, then submit_brief. Write in clear business English.
- Quoted reviews support a finding but do not prove its cause on their own: say what they show."""


class Toolbox:
    def __init__(self, con, store: Path):
        self.con, self.store = con, store
        self.seen_ids: dict[str, str] = {}

    def run_sql(self, query: str) -> dict:
        query = quote_reserved(query)
        if not SAFE_SQL.match(query) or BLOCKED.search(query.rstrip().rstrip(";")):
            return {"error": "Only a single read-only SELECT over the listed tables is allowed."}
        try:
            df = self.con.execute(f"select * from ({query.rstrip().rstrip(';')}) limit 30").df()
        except Exception as e:  # noqa: BLE001 - give the error back to the agent
            return {"error": str(e)[:300]}
        return {"rows": _clean(df)}

    def search_reviews(self, brand: str, aspect=None, polarity=None, max_rating=None, since=None, until=None,
                       contains=None, app_version=None, limit: int = 8) -> dict:
        where, args = ["f.brand = ?"], [brand]
        join = ""
        if aspect:
            join = "join mentions m using (review_id)"
            where.append("m.aspect = ?")
            args.append(aspect)
            if polarity:
                where.append("m.polarity = ?")
                args.append(polarity)
        for cond, val in (("f.rating <= ?", max_rating), ("f.\"at\" >= ?::date", since),
                          ("f.\"at\" < ?::date + 1", until), ("f.app_version = ?", app_version)):
            if val not in (None, ""):
                where.append(cond)
                args.append(val)
        if contains:
            where.append("lower(f.text) like ?")
            args.append(f"%{contains.lower()}%")
        q = (f"select f.review_id, f.\"at\"::date as day, f.rating, f.app_version, f.text from facts f {join} "
             f"where {' and '.join(where)} order by f.\"at\" desc limit {max(1, min(int(limit or 8), 12))}")
        df = self.con.execute(q, args).df()
        for r in df.itertuples():
            self.seen_ids[r.review_id] = r.text
        df["text"] = df.text.str.slice(0, 400)
        return {"reviews": _clean(df), "count_returned": len(df)}

    def key_drivers(self, brand: str) -> dict:
        d = insights.drivers(self.con).get(brand)
        return d or {"error": f"Not enough recent reviews for {brand}"}


_AT = re.compile(r'(?<![\w"])at(?![\w"])', re.I)


def quote_reserved(sql: str) -> str:
    """`at` (the review timestamp column) is a reserved word in DuckDB: quote it outside string literals."""
    parts = re.split(r"('(?:[^']|'')*')", sql)
    return "".join(p if i % 2 else _AT.sub('"at"', p) for i, p in enumerate(parts))


def _clean(df: pd.DataFrame) -> list[dict]:
    return json.loads(df.to_json(orient="records", date_format="iso", default_handler=str))


class Analyst:
    def __init__(self, llm, store: Path, con=None):
        self.llm, self.store = llm, Path(store)
        self.con = con or insights.connect(self.store)
        insights._STORES[id(self.con)] = self.store.resolve()

    def investigate(self, case: dict) -> dict:
        tools = Toolbox(self.con, self.store)
        contents = [{"role": "user", "parts": [{"text": "Case to investigate:\n" + json.dumps(case, ensure_ascii=False, default=str)}]}]
        steps, brief, started, used = [], None, now(), 0
        for _ in range(MAX_TURNS):
            content = self.llm.chat(SYSTEM, contents, TOOLS)
            contents.append(content)
            calls = [p["functionCall"] for p in content.get("parts", []) if "functionCall" in p]
            thought = " ".join(p.get("text", "") for p in content.get("parts", []) if p.get("text") and not p.get("thought")).strip()
            if not calls:
                contents.append({"role": "user", "parts": [{"text": "Continue the investigation with the tools, then call submit_brief."}]})
                steps.append({"type": "note", "text": thought[:500]})
                continue
            responses = []
            for call in calls:
                name, args = call.get("name"), call.get("args") or {}
                if name == "submit_brief":
                    brief = args
                    result = {"ok": True}
                elif name in ("run_sql", "search_reviews", "key_drivers"):
                    used += 1  # counted per call, so several calls in one reply all count
                    if used > MAX_TOOL_CALLS:
                        result = {"error": f"tool budget of {MAX_TOOL_CALLS} calls used: call submit_brief now with what you have"}
                    else:
                        try:
                            result = getattr(tools, name)(**args)
                        except TypeError as e:
                            result = {"error": f"bad arguments: {e}"}
                else:
                    result = {"error": f"unknown tool {name}"}
                steps.append({"type": "tool", "tool": name, "args": args, "thought": thought[:300],
                              "result_preview": _preview(result)})
                responses.append({"functionResponse": {"name": name, "response": result}})
            contents.append({"role": "user", "parts": responses})
            if brief:
                break
        verified = {rid: tools.seen_ids[rid] for rid in (brief or {}).get("evidence_review_ids", []) if rid in tools.seen_ids}
        return {"case": case, "brief": brief, "evidence": [{"review_id": k, "text": v} for k, v in verified.items()],
                "evidence_verified": bool(brief) and bool(verified) and len(verified) == len(brief.get("evidence_review_ids", [])),
                "steps": steps, "model": getattr(self.llm, "model", "?"), "started": started.isoformat(),
                "finished": now().isoformat(), "status": "filed" if brief else "incomplete",
                "tool_calls": min(used, MAX_TOOL_CALLS)}


def _preview(result: dict) -> str:
    if "rows" in result:
        return f"{len(result['rows'])} rows: " + json.dumps(result["rows"][:3], ensure_ascii=False, default=str)[:300]
    if isinstance(result.get("reviews"), list):
        return f"{len(result['reviews'])} reviews read"
    return json.dumps(result, ensure_ascii=False, default=str)[:300]


def cases(con, max_cases: int = 5, recent_days: int = 21) -> list[dict]:
    """What deserves the agent's attention, most important first."""
    last = con.execute('select max("at")::date from facts').fetchone()[0]
    since = last - timedelta(days=recent_days)
    out = []
    for r in con.execute("select * from spikes where day >= ? order by z desc limit 3", [since]).df().itertuples():
        out.append({"type": "complaint_spike", "brand": r.brand, "day": str(r.day), "negative_reviews": int(r.negative),
                    "usual_per_day": float(r.baseline), "z_score": float(r.z)})
    rel = con.execute("""select * from releases where first_seen >= ? and negative_change >= 0.08 and reviews >= 40
                         order by negative_change desc limit 3""", [since - timedelta(days=30)]).df()
    for r in rel.itertuples():
        out.append({"type": "bad_release", "brand": r.brand, "version": r.app_version, "previous_version": r.previous_version,
                    "negative_share": float(r.negative_share), "negative_change": float(r.negative_change),
                    "reviews": int(r.reviews)})
    drv = insights.drivers(con)
    for brand, d in sorted(drv.items(), key=lambda kv: -kv[1]["potential"])[:2]:
        if d["drivers"]:
            top = d["drivers"][0]
            out.append({"type": "top_driver", "brand": brand, "aspect": top["aspect"], "stars_lost": top["stars_lost"],
                        "share_of_reviews_complaining": top["prevalence"]})
    seen, uniq = set(), []
    for c in out:
        key = (c["type"], c["brand"])
        if key not in seen:
            seen.add(key)
            uniq.append(c)
    return uniq[:max_cases]


def run(store: Path, llm, max_cases: int = 5) -> dict:
    store = Path(store)
    analyst = Analyst(llm, store)
    todo = cases(analyst.con, max_cases)
    out_dir = store / "agent"
    out_dir.mkdir(exist_ok=True)
    done = []
    for case in todo:
        log.info("Investigating %s", case)
        try:
            res = analyst.investigate(case)
        except QuotaExhausted:
            log.warning("Free quota used up; remaining cases wait for the next run")
            break
        except LLMError as e:
            log.warning("Investigation failed: %s", e)
            continue
        done.append(res)
    stamp = now().strftime("%Y%m%dT%H%M")
    (out_dir / f"run-{stamp}.json").write_text(json.dumps(done, ensure_ascii=False, indent=1, default=str))
    (out_dir / "latest.json").write_text(json.dumps(done, ensure_ascii=False, indent=1, default=str))
    return {"cases": len(todo), "filed": sum(r["status"] == "filed" for r in done),
            "verified": sum(r["evidence_verified"] for r in done), "tool_calls": sum(len(r["steps"]) for r in done)}
