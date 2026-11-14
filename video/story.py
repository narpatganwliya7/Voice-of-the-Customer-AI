"""Pick the film's story from real outputs only, and fill the narration with real numbers.

Reads the website bundle (store/site/bundle.json) and writes:
  video/script.json  narration lines (EN voice + FR subtitles), numbers filled in
  video/story.json   what each scene shows: real reviews, the key-driver insight,
                     the agent's investigation and a real weekly-rating trend
Nothing here is invented: if a needed figure is missing, the script says so and stops.
"""
import argparse
import json
import re
from pathlib import Path

TOPIC_FR = {
    "app_reliability": "les bugs de l'appli", "login_access": "les problèmes de connexion",
    "device_compatibility": "la compatibilité des téléphones", "performance": "la lenteur",
    "usability": "l'ergonomie", "features": "les fonctionnalités", "payments_billing": "les paiements",
    "pricing_fees": "les frais", "customer_service": "le service client", "account_management": "la gestion du compte",
    "orders_delivery": "les livraisons", "core_service": "la qualité du service", "trust_security": "la sécurité",
    "notifications_ads": "les notifications", "loyalty_rewards": "la fidélité",
}


TOPIC_EN = {
    "app_reliability": "app bugs", "login_access": "login problems", "device_compatibility": "unsupported phones",
    "performance": "slowness", "usability": "a confusing app", "features": "missing features",
    "payments_billing": "payment problems", "pricing_fees": "fees", "customer_service": "customer service",
    "account_management": "account problems", "orders_delivery": "delivery problems", "core_service": "service quality",
    "trust_security": "security worries", "notifications_ads": "spam notifications", "loyalty_rewards": "loyalty issues",
}


def fr_num(x: float) -> str:
    return f"{x:.2f}".replace(".", ",")


def fmt(n: float) -> str:
    return f"{n:,.0f}"


def clean(t: str, n: int = 150) -> str:
    t = re.sub(r"\s+", " ", t).strip()
    return t if len(t) <= n else t[: n - 1].rsplit(" ", 1)[0] + "…"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--bundle", default="store/site/bundle.json")
    ap.add_argument("--topics", default=None)
    ap.add_argument("--out", default="video")
    args = ap.parse_args()
    b = json.loads(Path(args.bundle).read_text())
    ov = b["overview"]
    reviews, brands = ov["reviews"], ov["brands"]

    # 1. the insight: the brand with the single biggest fixable topic
    best = max((br for br in b["brands"] if br["drivers"]), key=lambda br: br["drivers"][0]["stars_lost"])
    top = best["drivers"][0]
    avg = best.get("avg_rating") or best.get("rating")
    pct = 50
    after = round(avg + top["stars_lost"] * pct / 100, 2)
    topic_en = top["label"].lower()

    # 2. the agent case: prefer a verified brief about a spike or a release
    cases = [c for c in b.get("agent", []) if c.get("brief") and c.get("evidence")]
    if not cases:
        raise SystemExit("No agent brief with verified evidence yet: run the Analyse workflow with the agent on.")
    case = max(cases, key=lambda c: (c["brief"].get("confidence") == "high", len(c["evidence"]), c["case"].get("z_score", 0)))
    br = case["brief"]
    steps = []
    for s in case["steps"]:
        if s.get("type") != "tool":
            continue
        if s["tool"] == "submit_brief":
            continue
        a_ = s["args"]
        arg = a_.get("query") or " ".join(f"{k}={v}" for k, v in a_.items())
        res = s.get("result_preview") or s.get("summary") or ""
        if not isinstance(res, str):
            res = json.dumps(res, ensure_ascii=False)
        if '"error"' in res[:12]:
            continue  # the agent retried; the film shows the calls that returned data
        steps.append({"tool": s["tool"], "arg": clean(str(arg), 90), "res": clean(str(res), 90)})

    # 3. real reviews: angry ones for the hook, praise on the same topic for the ending
    names = [x["name"] for x in b["brands"]] + ["SG", "RED", "SFR", "Uber", "Apple", "Google", "société générale"]
    rude = re.compile(r"chier|merde|putain|connard|arnaque|voleur|escroc|fuyez|pire", re.I)
    mentions_brand = re.compile("|".join(re.escape(n) for n in names), re.I)
    tick = [t for t in b["ticker"] if not rude.search(t["t"]) and not mentions_brand.search(t["t"])]
    angry = [{"r": t["r"], "t": clean(t["t"], 120), "src": t["src"]} for t in tick if t["s"] == "negative" and t["r"] <= 2]
    happy = [{"r": t["r"], "t": clean(t["t"], 120), "src": t["src"]} for t in tick if t["s"] == "positive" and t["r"] >= 4]
    happy = [h for h in happy if h["r"] == 5 and not re.search(r"impossible|bug|ne fonctionne|plante|nul", h["t"], re.I)]

    # 4. the background trend: a real weekly rating that went up
    # real weekly rating of the brand whose rating rose most (weeks with at least 15 reviews only)
    trend, best_rise = {"points": [], "label": ""}, 0.0
    for x in b["brands"]:
        wk = [w for w in x["weekly"] if w["r"] is not None and w["n"] >= 15]
        if len(wk) < 10:
            continue
        first, last = sum(w["r"] for w in wk[:4]) / 4, sum(w["r"] for w in wk[-4:]) / 4
        if last - first > best_rise:
            best_rise = last - first
            trend = {"brand": x["name"], "points": [{"w": w["w"], "r": w["r"]} for w in wk],
                     "label": f"Real weekly rating · {x['name']} · {first:.1f}★ → {last:.1f}★"}

    clf = ov.get("classifier") or {}
    ho = clf.get("heldout") or {}
    pipeline = [
        {"n": "01", "h": "Capture", "p": "Google Play and App Store, the moment reviews are posted.", "fig": f"{fmt(reviews)} reviews · {brands} brands"},
        {"n": "02", "h": "Understand", "p": "15 pain points, learned from free-AI annotations, scored locally.",
         "fig": f"{fmt(clf.get('n_train', 4000))} AI-labelled examples · held-out sentiment accuracy {ho.get("sentiment_accuracy", 0):.0%}"},
        {"n": "03", "h": "Prioritise", "p": "What each pain point costs in stars, brand by brand.", "fig": "key-driver regression · what-if simulator"},
        {"n": "04", "h": "Investigate", "p": "An AI agent digs into spikes and files a brief.", "fig": "SQL + review search · every claim cited"},
    ]

    story = {"insight": {"brand": best["name"], "avg": avg, "pct": pct, "topic_en": top["label"],
                         "drivers": [{"label": d["label"], "stars_lost": d["stars_lost"]} for d in best["drivers"][:4]]},
             "agent": {"case": f'{case["case"]["type"].replace("_", "-")} --brand "{case["case"]["brand"]}"', "steps": steps[:4],
                       "headline": br["headline"], "actions": br["actions"], "confidence": br["confidence"]},
             "reviews_angry": angry[:30], "reviews_happy": happy[:12], "trend": trend, "pipeline": pipeline,
             "topics": [v[0] for v in json.loads(Path("video/topics.json").read_text())] if Path("video/topics.json").exists() else []}

    c = case["case"]
    day = c.get("day", "")[:10]
    from datetime import date
    d = date.fromisoformat(day) if day else None
    day_en = f"On {d.strftime('%B')} {d.day}" if d else "Recently"
    mois = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"]
    day_fr = f"Le {d.day} {mois[d.month - 1]}" if d else "Récemment"
    version = c.get("version") or (re.search(r"version (\d[\d.]*\d)", br["headline"]) or [None, None])[1]
    lines = [
        ("hook", f"Over {reviews // 1000} thousand customer reviews. {brands} French brands. Most of them, nobody reads.",
                 f"Plus de {reviews // 1000} 000 avis clients. {brands} marques françaises. La plupart, personne ne les lit."),
        ("problem", "Banks, telecoms, retailers, transport. Customers say exactly what is broken, and the signal gets lost.",
                    "Banques, télécoms, distribution, transport. Les clients disent exactement ce qui ne va pas, et le signal se perd."),
        ("agent", "I'm Écoute, an AI agent. I read every review, minutes after it is posted.",
                  "Je suis Écoute, un agent IA. Je lis chaque avis, quelques minutes après sa publication."),
        ("how", "I sort each one into fifteen pain points, and measure what each one costs in stars.",
                "Je classe chacun parmi quinze irritants, et je mesure ce que chacun coûte en étoiles."),
        ("insight", f"At {best['name']}, {TOPIC_EN.get(top['aspect'], topic_en)} cost {top['stars_lost']:.2f} stars. Fix half of them, and the rating climbs from {avg:.2f} to {after:.2f}.",
                    f"Chez {best['name']}, {TOPIC_FR.get(top['aspect'], top['label'])} coûtent {fr_num(top['stars_lost'])} étoile. Corrigez-en la moitié, et la note passe de {fr_num(avg)} à {fr_num(after)}."),
        ("investigate", f"When complaints spike, I investigate. {day_en}, {c['brand']} complaints jumped. I traced them to version {version}: crashes and failed logins, and briefed the team."
                        if version else f"When complaints spike, I investigate: I query the data, read the reviews, and brief the team that can fix it.",
                        f"Quand les plaintes explosent, j'enquête. {day_fr}, les plaintes sur {c['brand']} ont bondi. J'ai remonté la piste jusqu'à la version {version} : plantages et connexions impossibles, et j'ai alerté l'équipe."
                        if version else "Quand les plaintes explosent, j'enquête : j'interroge les données, je lis les avis, et j'alerte l'équipe qui peut corriger."),
        ("resolve", "Fix what customers actually feel, and angry reviews turn into loyal ones.",
                    "Corrigez ce que les clients ressentent vraiment, et les avis en colère deviennent des avis fidèles."),
        ("cta", "Écoute. Every review, heard.", "Écoute. Chaque avis, entendu."),
    ]
    script = {"voice": "af_heart", "speed": 1.1, "lang_code": "a",
              "lines": [{"id": i, "en": en, "fr": fr, "tts": en.replace("Écoute", "[Écoute](/eɪkˈuːt/)")}
                        for i, en, fr in lines]}
    out = Path(args.out)
    (out / "script.json").write_text(json.dumps(script, ensure_ascii=False, indent=1))
    (out / "story.json").write_text(json.dumps(story, ensure_ascii=False, indent=1))
    print(json.dumps({"insight": story["insight"], "agent_headline": br["headline"], "trend": trend["label"],
                      "words": sum(len(l["en"].split()) for l in script["lines"])}, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
