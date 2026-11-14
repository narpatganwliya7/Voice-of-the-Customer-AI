"""CLI: python -m ecoute <command>"""
from __future__ import annotations

import argparse
import json
import logging
from pathlib import Path

from . import collect
from .common import load_config, now
from .resolve import resolve_all
from .store import Store


def main() -> None:
    p = argparse.ArgumentParser(prog="ecoute")
    sub = p.add_subparsers(dest="cmd", required=True)

    c = sub.add_parser("collect", help="pull new reviews into the store")
    c.add_argument("--store", type=Path, default=Path("store"))
    c.add_argument("--mode", choices=["incremental", "backfill"], default="incremental")
    c.add_argument("--brands", default="all", help="comma-separated brand names, or 'all'")
    c.add_argument("--max-per-app", type=int, default=2000)
    c.add_argument("--since-days", type=int, default=180, help="how far back to go")
    c.add_argument("--refresh-apps", action="store_true")

    r = sub.add_parser("resolve", help="find official app ids (no review download)")
    r.add_argument("--store", type=Path, default=Path("store"))
    r.add_argument("--brands", default="all")

    lb = sub.add_parser("label", help="annotate the training + gold samples with a free LLM")
    lb.add_argument("--store", type=Path, default=Path("store"))
    lb.add_argument("--limit", type=int, default=5000)
    lb.add_argument("--batch", type=int, default=30)
    lb.add_argument("--max-calls", type=int, default=None)

    sc = sub.add_parser("score", help="train the local classifier and score every review")
    sc.add_argument("--store", type=Path, default=Path("store"))
    sc.add_argument("--cache", type=Path, default=Path("cache"))
    sc.add_argument("--retrain", action="store_true")

    ins = sub.add_parser("insights", help="build the SQL models and key-driver analysis")
    ins.add_argument("--store", type=Path, default=Path("store"))
    ins.add_argument("--window", type=int, default=60, help="days used for cross-brand comparison")

    ag = sub.add_parser("agent", help="let the analyst agent investigate what the numbers flag")
    ag.add_argument("--store", type=Path, default=Path("store"))
    ag.add_argument("--max-cases", type=int, default=5)

    st = sub.add_parser("site", help="build the website data bundle")
    st.add_argument("--store", type=Path, default=Path("store"))
    st.add_argument("--out", type=Path, default=Path("store/site"))

    args = p.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

    if args.cmd == "collect":
        rep = collect.run(args.store, mode=args.mode, brands=collect.parse_brands(args.brands),
                          max_per_app=args.max_per_app, since_days=args.since_days, refresh_apps=args.refresh_apps)
        print(json.dumps({k: v for k, v in rep.items() if k != "per_brand"}, indent=2))
    elif args.cmd == "label":
        from . import label
        from .llm import providers_from_env
        stats = label.run(args.store, providers_from_env(), limit=args.limit,
                          batch_size=args.batch, max_calls=args.max_calls)
        print(json.dumps(stats, indent=2))
        _summary_label(stats)
    elif args.cmd == "score":
        from . import score
        summary = score.run(args.store, args.cache, retrain=args.retrain)
        print(json.dumps(summary, indent=2, default=str))
        _summary_score(args.store, summary)
    elif args.cmd == "insights":
        from . import insights
        print(json.dumps(insights.build(args.store, args.window), indent=2, default=str))
    elif args.cmd == "agent":
        from . import agent
        from .llm import providers_from_env
        llm = next(p for p in providers_from_env() if hasattr(p, "chat"))
        res = agent.run(args.store, llm, args.max_cases)
        print(json.dumps(res, indent=2))
        _summary_agent(args.store, res)
    elif args.cmd == "site":
        from . import site
        print(json.dumps(site.build(args.store, args.out), indent=2))
    elif args.cmd == "resolve":
        apps = resolve_all(load_config(), collect.parse_brands(args.brands))
        apps["_resolved_at"] = now().isoformat()
        Store(args.store).save_apps(apps)
        print(json.dumps(apps, ensure_ascii=False, indent=2))


def _summary_agent(store: Path, res: dict) -> None:
    import os
    path = os.environ.get("GITHUB_STEP_SUMMARY")
    latest = json.loads((store / "agent" / "latest.json").read_text())
    lines = ["## Écoute Analyst (AI agent)",
             f"{res['filed']} of {res['cases']} cases investigated and filed · {res['tool_calls']} tool calls · "
             f"evidence verified on {res['verified']}", ""]
    for r in latest:
        b = r.get("brief") or {}
        lines.append(f"### {r['case']['brand']} · {r['case']['type'].replace('_', ' ')}")
        lines.append(f"**{b.get('headline', 'not filed')}**  ")
        lines.append(f"Steps: " + " → ".join(s.get('tool', 'note') for s in r["steps"]))
        for a in b.get("actions", []):
            lines.append(f"- {a['action']} ({a['team']}): {a['expected_effect']}")
        lines.append("")
    if path:
        with open(path, "a", encoding="utf-8") as f:
            f.write("\n".join(lines) + "\n")


def _summary_score(store: Path, s: dict) -> None:
    import os
    path = os.environ.get("GITHUB_STEP_SUMMARY")
    lines = [f"## Écoute scoring", f"**{s['scored']:,} reviews scored** · {s['with_aspect']:,} with at least one topic "
             f"· {s['mentions_competitor']:,} name a competitor", ""]
    rep_path = store / "model" / "report.json"
    if "model" in s and rep_path.exists():
        rep = json.loads(rep_path.read_text())
        lines += [f"Classifier trained on {rep['n_train']:,} AI-annotated reviews, checked on {rep['n_heldout']} held-out ones.",
                  "", "| Check | Cross-validated | Held-out |", "|---|---:|---:|"]
        h = rep.get("heldout", {})
        lines.append(f"| Topic detection (micro F1) | {rep.get('aspect_micro_f1', '—')} | {h.get('aspect_micro_f1', '—')} |")
        lines.append(f"| Topic detection (macro F1) | {rep.get('aspect_macro_f1', '—')} | {h.get('aspect_macro_f1', '—')} |")
        lines.append(f"| Overall tone (accuracy) | {rep.get('sentiment', {}).get('accuracy', '—')} | {h.get('sentiment_accuracy', '—')} |")
        lines.append(f"| Leaving the company (F1) | {rep.get('churn', {}).get('leaving_company_f1', '—')} | |")
        lines += ["", "| Topic | Examples | Precision | Recall | F1 |", "|---|---:|---:|---:|---:|"]
        for k, v in rep["aspects"].items():
            lines.append(f"| {k} | {v['support']} | {v.get('precision', '—')} | {v.get('recall', '—')} | {v.get('f1', v.get('skipped', ''))} |")
    if path:
        with open(path, "a", encoding="utf-8") as f:
            f.write("\n".join(lines) + "\n")


def _summary_label(st: dict) -> None:
    import os
    path = os.environ.get("GITHUB_STEP_SUMMARY")
    text = (f"## Écoute annotation\n**{st['labelled']:,} reviews annotated** in {st['calls']} free LLM calls "
            f"· {st['total_labelled']:,} labelled in total ({st['gold_labelled']} in the gold set) "
            f"· {st['remaining']:,} remaining\n")
    if st.get("stopped"):
        text += f"\nStopped: {st['stopped']}\n"
    if path:
        with open(path, "a", encoding="utf-8") as f:
            f.write(text)


if __name__ == "__main__":
    main()
