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
    c.add_argument("--refresh-apps", action="store_true")

    r = sub.add_parser("resolve", help="find official app ids (no review download)")
    r.add_argument("--store", type=Path, default=Path("store"))
    r.add_argument("--brands", default="all")

    args = p.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

    if args.cmd == "collect":
        rep = collect.run(args.store, mode=args.mode, brands=collect.parse_brands(args.brands),
                          max_per_app=args.max_per_app, refresh_apps=args.refresh_apps)
        print(json.dumps({k: v for k, v in rep.items() if k != "per_brand"}, indent=2))
    elif args.cmd == "resolve":
        apps = resolve_all(load_config(), collect.parse_brands(args.brands))
        apps["_resolved_at"] = now().isoformat()
        Store(args.store).save_apps(apps)
        print(json.dumps(apps, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
