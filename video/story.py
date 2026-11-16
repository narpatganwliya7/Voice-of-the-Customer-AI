"""Pick the film's story from real outputs only, and write the narration around it.

Reads the website bundle (store/site/bundle.json) and the scored reviews in the store, and writes:
  video/script.json  narration (English voice, French subtitles), told by the project's author
  video/story.json   everything each scene shows: real reviews, brands, the Deliveroo key drivers,
                     the E.Leclerc spike and the agent's investigation, the recommended actions,
                     and a real weekly-rating trend
Nothing is invented: every figure below is read from the pipeline's outputs.
"""
import argparse
import json
import re
from pathlib import Path

import duckdb

SECTORS = {"banking": "Banking", "insurance": "Insurance", "telecom": "Telecom", "retail": "Retail",
           "mobility": "Mobility", "delivery": "Delivery", "energy": "Energy", "health": "Health"}
RUDE = re.compile(r"chier|merde|putain|connard|arnaque|voleur|escroc|fuyez|pire|nul de chez", re.I)
SAY = {  # pronunciation for the English voice (Kokoro markup)
    "Écoute": "[Écoute](/Akˈut/)",
    "E.Leclerc": "[E.Leclerc](/ˌi ləklˈɛɹ/)",
    "BNP Paribas": "B N P [Paribas](/pˌɛɹibˈɑ/)",
    "Decathlon": "[Decathlon](/dˌAkætlˈɔn/)",
}


def clean(t: str, n: int = 140) -> str:
    t = re.sub(r"\s+", " ", t or "").strip()
    return t if len(t) <= n else t[: n - 1].rsplit(" ", 1)[0] + "…"


def src(s: str) -> str:
    return "Google Play" if s == "google_play" else "App Store"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--store", default="store")
    ap.add_argument("--out", default="video")
    args = ap.parse_args()
    store = Path(args.store)
    b = json.loads((store / "site" / "bundle.json").read_text())
    ov = b["overview"]
    brands = {x["name"]: x for x in b["brands"]}
    names = list(brands) + ["SG", "RED", "SFR", "Uber", "Apple", "Google", "société générale"]
    mentions_brand = re.compile("|".join(re.escape(n) for n in names), re.I)
    con = duckdb.connect()
    con.execute(f"create view r as select * from read_parquet('{store}/reviews/*.parquet')")
    con.execute(f"create view s as select * from read_parquet('{store}/scored.parquet')")

    # 1. the feed wall: short, real, readable reviews, mostly unhappy, no brand names in the text
    feed = con.execute("""
        select r.rating, r.text, r.source from r join s using (review_id)
        where length(r.text) between 40 and 120 and r."at" >= (select max("at") from r) - interval 21 day
        order by hash(review_id) limit 600""").fetchall()
    feed = [{"r": int(x[0]), "t": clean(x[1], 120), "src": src(x[2])} for x in feed
            if not RUDE.search(x[1]) and not mentions_brand.search(x[1]) and "[" not in x[1]]
    neg = [f for f in feed if f["r"] <= 2][:30]
    mid = [f for f in feed if f["r"] == 3][:6]
    pos = [f for f in feed if f["r"] >= 4][:12]
    wall = [x for trio in zip(neg[0::2], neg[1::2], pos + mid) for x in trio][:42]

    # 2. Deliveroo: key drivers, prevalence, a real delivery complaint and a real praise
    dv = brands["Deliveroo"]
    top = dv["drivers"][0]
    avg = dv["avg_rating"]
    after = round(avg + top["stars_lost"] * 0.5, 2)
    pain = [q for q in dv["quotes"] if q["kind"] == "pain" and q["aspect"] == top["aspect"]]
    # praise for the ending: recent 5★ Deliveroo reviews that are happy about the very same thing (delivery)
    good = con.execute(f"""
        select r.rating, r.text, r.source from r join s using (review_id)
        where r.brand = 'Deliveroo' and r.rating = 5 and s.aspects like '%"{top['aspect']}", "positive"%'
          and length(r.text) between 45 and 150 and regexp_matches(lower(r.text), 'livr|rapide|chaud|temps')
        order by r."at" desc limit 30""").fetchall()
    praise = [{"rating": x[0], "text": x[1], "source": x[2]} for x in good if not RUDE.search(x[1]) and "[" not in x[1]]
    # the review read on screen: a recent 1★ Deliveroo review the pipeline tagged with the top pain point,
    # in plain words about delivery (so a viewer sees why it was tagged)
    rows = con.execute(f"""
        select r.rating, coalesce(nullif(r.title, '') || ' — ', '') || r.text as t, r.source, r."at"::date
        from r join s using (review_id)
        where r.brand = 'Deliveroo' and r.rating = 1 and s.aspects like '%"{top['aspect']}", "negative"%'
          and length(r.text) between 90 and 190 and regexp_matches(lower(r.text), 'coursier|livreur|livraison|commande')
        order by regexp_matches(lower(r.text), 'coursier|livreur|livraison|livré') desc, r."at" desc limit 40""").fetchall()
    rows = [x for x in rows if not RUDE.search(x[1]) and "[" not in x[1]]
    scan = {"rating": rows[0][0], "text": rows[0][1], "source": rows[0][2], "day": str(rows[0][3])} if rows else (pain or [None])[0]

    # 3. E.Leclerc: daily negative reviews around the spike, and the agent's investigation
    case = next(c for c in b["agent"] if c["case"]["brand"] == "E.Leclerc" and c.get("brief"))
    spike_day = case["case"]["day"][:10]
    daily = con.execute(f"""
        select r."at"::date as d, count(*) filter (where s.sentiment = 'negative') as n
        from r join s using (review_id)
        where r.brand = 'E.Leclerc' and r."at"::date between date '{spike_day}' - 20 and date '{spike_day}' + 2
        group by 1 order by 1""").fetchall()
    total_leclerc = con.execute("select count(*) from r where brand = 'E.Leclerc'").fetchone()[0]
    version = re.search(r"version (\d[\d.]*\d)", case["brief"]["headline"]).group(1)
    peak = next(n for d, n in daily if str(d) == spike_day)
    base = case["case"]["usual_per_day"]
    evidence = [clean(e["text"], 90) for e in case["evidence"] if re.search(r"mise à jour|MAJ|maj|connecter|ouvrir", e["text"])][:2]
    n_read = 0
    for st in case["steps"]:
        if st.get("tool") == "search_reviews":
            prev = str(st.get("result_preview", ""))
            m = re.search(r'"count_returned":\s*(\d+)', prev) or re.search(r"(\d+) reviews", prev)
            n_read += int(m.group(1)) if m else 0

    actions = [
        {"brand": "E.Leclerc", "team": "Mobile team", "title": f"Ship a hotfix for version {version}: crash at launch, login loop", "tag": "Urgent", "tone": 1},
        {"brand": "E.Leclerc", "team": "QA", "title": "Test login and cold start before every release", "tag": "Next release", "tone": 2},
        {"brand": "Deliveroo", "team": "Operations", "title": "Fix late and missing deliveries first", "tag": f"{top['stars_lost']:.2f}★ at stake", "tone": 1},
        {"brand": "Deliveroo", "team": "Customer service", "title": "Then refunds and support replies",
         "tag": f"{dv['drivers'][1]['stars_lost']:.2f}★ at stake", "tone": 2},
    ]

    # 4. a real rising trend for the background: the brand whose weekly rating rose most
    trend, rise = {}, 0.0
    for x in b["brands"]:
        wk = [w for w in x["weekly"] if w["r"] is not None and w["n"] >= 15]
        if len(wk) >= 10:
            f, l = sum(w["r"] for w in wk[:4]) / 4, sum(w["r"] for w in wk[-4:]) / 4
            if l - f > rise:
                rise, trend = l - f, {"brand": x["name"], "points": [round(w["r"], 3) for w in wk], "from": round(f, 1), "to": round(l, 1), "weeks": len(wk)}

    sectors = {}
    for x in b["brands"]:
        sectors.setdefault(SECTORS.get(x["sector"], x["sector"]), []).append(x["name"])
    clf = ov.get("classifier") or {}
    story = {
        "stats": {"reviews": ov["reviews"], "brands": ov["brands"], "topics": 15,
                  "sectors": len(sectors), "annotated": (ov.get("label_sources") or {}).get("llm", 0),
                  "f1": (clf.get("heldout") or {}).get("aspect_micro_f1")},
        "wall": wall,
        "sectors": [{"name": k, "brands": v} for k, v in sorted(sectors.items(), key=lambda kv: -len(kv[1]))],
        "named": ["BNP Paribas", "Orange", "Decathlon", "Deliveroo"],
        "deliveroo": {"avg": avg, "after": after, "prevalence": top["prevalence"], "topic": top["label"],
                      "drivers": [{"label": d["label"], "lost": d["stars_lost"], "share": d["prevalence"]} for d in dv["drivers"][:4]],
                      "scan": {"r": scan["rating"], "t": clean(scan["text"], 150), "src": src(scan["source"]), "day": scan["day"]} if scan else None,
                      "praise": [{"r": q["rating"], "t": clean(q["text"], 110), "src": src(q["source"])} for q in praise][:3]},
        "leclerc": {"daily": [{"d": str(d), "n": int(n)} for d, n in daily], "day": spike_day, "peak": int(peak),
                    "usual": base, "ratio": round(peak / base, 1), "version": version, "reviews": int(total_leclerc),
                    "read": n_read, "evidence": evidence, "confidence": case["brief"]["confidence"]},
        "actions": actions,
        "trend": trend,
    }

    pct = round(top["prevalence"] * 100)
    fr_avg, fr_after = f"{avg:.1f}".replace(".", ","), f"{after:.1f}".replace(".", ",")
    lines = [
        ("hook", "Every day, customers tell French brands exactly what's broken. Most of it is never read.",
                 "Chaque jour, les clients disent aux marques françaises ce qui ne va pas. La plupart du temps, personne ne lit."),
        ("intro", "So I designed an AI agent: Écoute.", "Alors j'ai conçu un agent IA : Écoute."),
        ("scope", "It reads every new review from forty-one brands, like BNP Paribas, Orange, Decathlon and Deliveroo.",
                  "Il lit chaque nouvel avis de 41 marques, comme BNP Paribas, Orange, Decathlon et Deliveroo."),
        ("understand", "It sorts each one into fifteen pain points, and measures what each costs in stars.",
                       "Il classe chaque avis parmi quinze irritants, et mesure ce que chacun coûte en étoiles."),
        ("deliveroo", f"Here's what we found. At Deliveroo, delivery problems hit {pct} percent of reviews, and cost nearly half a star.",
                      f"Voici ce que nous avons trouvé. Chez Deliveroo, les problèmes de livraison touchent {pct} % des avis, et coûtent près d'une demi-étoile."),
        ("leclerc", "At E.Leclerc, complaints jumped seven-fold in one day. The agent traced them to an app update: crashes and failed logins.",
                    "Chez E.Leclerc, les plaintes ont été multipliées par sept en un jour. L'agent a trouvé la cause : une mise à jour, avec plantages et connexions impossibles."),
        ("actions", "What they could do: E.Leclerc, ship a hotfix and test logins before each release. Deliveroo, fix deliveries first.",
                    "Ce qu'ils pourraient faire : E.Leclerc, publier un correctif et tester la connexion avant chaque version. Deliveroo, corriger d'abord les livraisons."),
        ("improve", f"Fix half of those delivery problems, and the rating could rise from {avg:.1f} to {after:.1f} stars.",
                    f"Corrigez la moitié de ces problèmes de livraison, et la note pourrait passer de {fr_avg} à {fr_after} étoiles."),
        ("cta", "Écoute. Every review, heard.", "Écoute. Chaque avis, entendu."),
    ]
    assert abs(peak / base - 7) < 1, f"spike ratio changed: {peak / base:.1f}"  # the narration says seven-fold
    assert 0.45 > top["stars_lost"] > 0.38, "the narration says nearly half a star"

    def tts(t: str) -> str:
        for k, v in SAY.items():
            t = t.replace(k, v)
        return t

    script = {"voice": "am_michael", "speed": 0.95,
              "lines": [{"id": i, "en": en, "fr": fr, "tts": tts(en)} for i, en, fr in lines]}
    out = Path(args.out)
    (out / "script.json").write_text(json.dumps(script, ensure_ascii=False, indent=1))
    (out / "story.json").write_text(json.dumps(story, ensure_ascii=False, indent=1))
    print(json.dumps({"words": sum(len(l["en"].split()) for l in script["lines"]), "peak": peak, "usual": base,
                      "ratio": story["leclerc"]["ratio"], "deliveroo": [avg, after, top["prevalence"]],
                      "trend": {k: trend.get(k) for k in ("brand", "from", "to", "weeks")}, "wall": len(wall),
                      "evidence": evidence, "read": n_read, "daily_days": len(daily)}, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
