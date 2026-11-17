"""Build the website's data bundle from the insights (one JSON file the static site loads)."""
from __future__ import annotations

import json
import random
import re
from pathlib import Path

import pandas as pd

from .common import now, slug
from .store import Store


# Reviews sometimes name the employee who helped ("merci à Julie", "le vendeur Karim"): that is a
# third person's data, so the public bundle masks it. Quotes are also kept short.
_ROLE = r"vendeu(?:r|se)|conseill(?:er|ère)|technicien(?:ne)?|livreur|chauffeur|caissi(?:er|ère)|hôtesse|docteur|dr\.?"
PERSON_RX = re.compile(r"((?i:(?:merci|bravo)\s+(?:à|a|au|aux)?\s*(?:la |le |l')?(?:" + _ROLE + r")?\s*|"
                       r"(?:" + _ROLE + r"|monsieur|madame|mme|m\.)\s+))"
                       r"([A-ZÀ-Ý][a-zà-ÿ]+(?:-[A-ZÀ-Ý][a-zà-ÿ]+)?(?: [A-ZÀ-Ý][a-zà-ÿ]+)?)")
QUOTE_MAX = 200
NOT_NAMES = frozenset("beaucoup bien bcp super encore vraiment infiniment pour à a tous toutes tout la le les "
                      "votre vos de du des pour l'appli application appli service équipe equipe".split())


def mask_people(text: str, keep: frozenset = frozenset()) -> str:
    """Replace a person's name after "merci à", "le vendeur", "Madame"... Brand names in `keep` stay."""
    def sub(m):
        name = m.group(2)
        first = name.split()[0].split("-")[0].lower()
        return m.group(0) if first in keep or first in NOT_NAMES else m.group(1) + "[name]"
    return PERSON_RX.sub(sub, text)


def public_quote(text: str, limit: int = QUOTE_MAX, keep: frozenset = frozenset()) -> str:
    text = mask_people(str(text or ""), keep).strip()
    if len(text) > limit:
        text = text[:limit].rsplit(" ", 1)[0].rstrip(" ,;:.—-") + "…"
    return text


def make_public(bundle: dict) -> dict:
    """What may leave the private store: short, anonymous quotes; no employee names."""
    keep = frozenset(w.lower() for b in bundle.get("brands", []) for w in re.split(r"[\s.]+", b.get("name", "")) if w)
    for b in bundle.get("brands", []):
        for q in b.get("quotes", []):
            q["text"] = public_quote(q["text"], keep=keep)
    for r in bundle.get("ticker", []):
        r["t"] = public_quote(r["t"], keep=keep)
    for run in bundle.get("agent", []):
        for e in run.get("evidence") or []:
            e["text"] = public_quote(e["text"], keep=keep)
        for st in run.get("steps") or []:
            if st.get("result_preview"):
                st["result_preview"] = mask_people(st["result_preview"], keep)
    return bundle


def publish(src: Path, out: Path) -> dict:
    """Copy a bundle built in the private store to the public website, applying make_public."""
    bundle = make_public(json.loads(Path(src).read_text()))
    Path(out).parent.mkdir(parents=True, exist_ok=True)
    Path(out).write_text(json.dumps(bundle, ensure_ascii=False, default=str))
    return {"out": str(out), "built_at": bundle.get("built_at"), "bytes": Path(out).stat().st_size}


def _load(d: Path, name: str, default):
    p = d / f"{name}.json"
    return json.loads(p.read_text()) if p.exists() else default


def ticker(store: Path, n: int = 80, seed: int = 11) -> list[dict]:
    """Short real reviews for the hero stream: recent, readable, a balanced mix of tones."""
    reviews = Store(store).read(["review_id", "brand", "rating", "text", "at", "source"])
    scored = pd.read_parquet(store / "scored.parquet", columns=["review_id", "sentiment", "aspects"])
    df = reviews.merge(scored, on="review_id")
    df = df[df.text.str.len().between(35, 120) & ~df.text.str.contains(r"\[(?:email|phone|number|iban)\]")]
    df = df.sort_values("at", ascending=False).groupby("brand").head(40)
    out, rng = [], random.Random(seed)
    for tone, share in (("negative", 0.55), ("positive", 0.35), ("mixed", 0.10)):
        part = df[df.sentiment == tone]
        k = min(len(part), int(n * share))
        for r in part.sample(k, random_state=seed).itertuples():
            asp = json.loads(r.aspects)
            out.append({"b": r.brand, "r": int(r.rating), "t": r.text, "s": tone,
                        "src": "Google Play" if r.source == "google_play" else "App Store",
                        "a": asp[0][0] if asp else None})
    rng.shuffle(out)
    return out


def build(store: Path, out: Path) -> dict:
    store, out = Path(store), Path(out)
    ins = store / "insights"
    overview = _load(ins, "overview", {})
    score = {r["brand"]: r for r in _load(ins, "scorecard", [])}
    drivers = _load(ins, "drivers", {})
    quotes = _load(ins, "quotes", {})
    weekly = pd.DataFrame(_load(ins, "weekly", []))
    releases = pd.DataFrame(_load(ins, "releases", []))
    switching = _load(ins, "switching", [])
    apps = Store(store).load_apps()

    brands = []
    for name, card in sorted(score.items()):
        w = weekly[weekly.brand == name].sort_values("week").tail(26) if len(weekly) else pd.DataFrame()
        rel = releases[releases.brand == name].tail(6) if len(releases) else pd.DataFrame()  # already in version order
        app = next((a for k, a in apps.items() if not k.startswith("_") and a.get("name") == name), {})
        brands.append({
            "id": slug(name), "name": name, **{k: v for k, v in card.items() if k != "brand"},
            "store_rating": (app.get("play") or {}).get("score"),
            "drivers": drivers.get(name, {}).get("drivers", []),
            "potential": drivers.get(name, {}).get("potential"),
            "quotes": quotes.get(name, []),
            "weekly": [{"w": str(r.week)[:10], "n": int(r.reviews), "r": r.avg_rating, "neg": r.negative_share}
                       for r in w.itertuples()],
            "releases": json.loads(rel.to_json(orient="records")) if len(rel) else [],
            "switching": [s for s in switching if s["from_brand"] == name][:6],
        })

    bundle = {
        "built_at": now().isoformat(),
        "overview": overview,
        "brands": brands,
        "heatmap": _load(ins, "heatmap", []),
        "spikes": _load(ins, "spikes", [])[:20],
        "switching": switching[:80],
        "recoveries": _load(ins, "recoveries", [])[:5],
        # finished investigations with verified evidence first: they open the agent console
        "agent": sorted(_load(store / "agent", "latest", []),
                        key=lambda c: (not c.get("brief"), -len(c.get("evidence") or []))),
        "ticker": ticker(store),
        "runs": [json.loads(x) for x in (store / "runs.jsonl").read_text().splitlines()[-30:]] if (store / "runs.jsonl").exists() else [],
    }
    bundle = make_public(bundle)
    out.mkdir(parents=True, exist_ok=True)
    (out / "bundle.json").write_text(json.dumps(bundle, ensure_ascii=False, default=str))
    return {"brands": len(brands), "ticker": len(bundle["ticker"]), "bytes": (out / "bundle.json").stat().st_size}
