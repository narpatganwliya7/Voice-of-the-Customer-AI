# écoute. — Always-on Voice of the Customer

**Every review, heard. Every issue, explained. Every fix, prioritised.**

*Écoute : chaque avis entendu, chaque irritant expliqué, chaque action priorisée.*

**[Live website](https://narpatganwliya7.github.io/Voice-of-the-Customer-AI/)** · **[Watch the 92-second film](assets/ecoute_film.mp4)**

[![Tests](https://github.com/narpatganwliya7/Voice-of-the-Customer-AI/actions/workflows/tests.yml/badge.svg)](https://github.com/narpatganwliya7/Voice-of-the-Customer-AI/actions/workflows/tests.yml)
![Python](https://img.shields.io/badge/Python-3.12-3776AB)
![DuckDB](https://img.shields.io/badge/SQL-DuckDB-FFF000)
![AI](https://img.shields.io/badge/AI-free%20tier%20only-3ddc97)
![Automation](https://img.shields.io/badge/runs%20on-GitHub%20Actions-2088FF)

<p align="center"><a href="assets/ecoute_film.mp4"><img src="assets/film_preview.gif" width="400" alt="The agent replaying its real investigation: SQL, a failed query it recovers from, the reviews it read, and the likely cause"></a><br><sub>The agent replaying its own logged investigation of a complaint spike. Click for the full film.</sub></p>

Écoute is an AI agent that reads what customers of **41 French brands** write on Google Play and
the App Store (banks, insurers, telecom operators, retailers, mobility, delivery, energy, health),
turns every review into a structured signal, measures **how many stars each pain point costs**,
and investigates sudden spikes on its own, ending with a brief for the team that can fix them.

Everything runs on GitHub Actions with **free** AI only, and every number on the site and in the
film comes from the pipeline's own outputs.

| | |
|---|---|
| **127,479** real customer reviews | **41** brands across 8 sectors |
| **15** customer-experience topics | **4,300** reviews annotated by a free AI model |
| **0.66** topic micro F1 on 300 held-out reviews | **0.61** tone macro F1 (91% accuracy) |

---

## What it finds (real outputs)

**Where the stars go.** At **Deliveroo**, delivery problems appear in 39% of recent reviews and
cost **0.43 stars** of an average rating of 2.49. Resolving half of them is worth about +0.21★.

**What broke, and when.** On **10 November 2026**, **E.Leclerc** received 48 negative reviews
against a usual 6.6 per day. The AI analyst queried the data, read the reviews and traced the spike
to **app version 11.0.1**: crashes at launch and failed logins. Its brief recommended a hotfix or
rollback (Mobile team) and regression tests on cold start and login. Every review it cited is one
it actually read.

**Who customers name instead.** Competitors mentioned in negative reviews form a switching map per
sector, built with exact name matching so every line traces back to real reviews.

<p align="center"><img src="assets/site_explorer.jpg" width="800" alt="Brand explorer: stars lost per topic, what-if simulator, real quotes and release radar"></p>

---

## How it works

```mermaid
flowchart LR
  subgraph Fast lane · every review · no API calls
    A[Collect<br/>Google Play + App Store] --> B[Protect<br/>PII masked]
    B --> C[Classify<br/>local model · 15 topics,<br/>tone, churn, severity]
    C --> D[Explain<br/>DuckDB SQL · key drivers,<br/>spikes, releases, switching]
  end
  subgraph Deep lane · only what the numbers flag
    D -- spike / bad release --> E[AI analyst<br/>SQL + review search]
    E --> F[Brief<br/>owner · action · evidence]
  end
  D --> G[Website + film]
  F --> G
```

| Stage | How |
|---|---|
| **Capture** | Official apps are located for every brand and accepted only when the developer matches, so look-alike apps are never tracked. New reviews are pulled newest-first until the collector reaches what it already has. Each run logs the **measured** delay between a customer posting and Écoute having the review. |
| **Protect** | Usernames, avatars and platform ids are never stored. Emails, phone numbers, IBANs and account numbers pasted into reviews are masked. |
| **Understand** | A free LLM (Gemini free tier, model discovered at run time) annotates a stratified sample of 4,300 reviews against a 15-topic taxonomy. A local classifier (multilingual sentence embeddings + word and character TF-IDF + logistic regression) learns from it and scores every review in minutes, with no API cost. |
| **Explain** | DuckDB SQL models: brand scorecards, a brand × topic pain map, weekly trends, a release radar (each app version against the previous one), daily spike detection, and a ridge regression of star ratings on topic mentions: *stars lost = impact × prevalence*. |
| **Investigate** | The analyst agent receives each spike or bad release, works with three tools (read-only SQL, review search, key drivers), must back every number with a tool result, and files a structured brief. Cited reviews are checked against what it actually read. |
| **Show** | A static website (brand explorer, what-if simulator, pain map, switching map, release radar, agent console, method) and a launch film rendered from the same data, in which the agent replays its own logged investigation. |

This repository holds the code, the website and the public data bundle (aggregates and short anonymous
quotes). The raw reviews, labels and trained model live in a separate **private** data repository;
see [Data and ethics](#data-and-ethics).

### Free AI only

| Job | Model | Cost |
|---|---|---|
| Annotating 4,300 reviews | Gemini Flash / Flash-Lite, free tier (falls through models when a daily quota is used up, resumes next run) | 0 |
| Scoring every review | Local scikit-learn model + `paraphrase-multilingual-MiniLM-L12-v2` on CPU | 0 |
| Investigations | Gemini free tier | 0 |
| Narration of the film | ElevenLabs free plan, "Cyril" voice, generated in the web app and credited in the film; aligned to the picture with faster-whisper on a GitHub runner | 0 |

---

## Model quality, honestly

| Check | Cross-validated | Held-out (300 reviews never used for training) |
|---|---:|---:|
| Topic detection, micro F1 | 0.65 | 0.66 |
| Topic detection, macro F1 | 0.63 | 0.61 |
| Overall tone, accuracy | 0.91 | 0.91 |
| Overall tone, macro F1 | 0.61 | – |
| Leaving the company, F1 | 0.50 | – |
| Topic polarity, accuracy | 0.94 | – |

These figures measure agreement with the AI annotator (Gemini), not with human labels: the 300
held-out reviews were labelled by the same model and never used for training. Accuracy flatters tone
because most reviews are clearly negative or positive; macro F1 counts the rare neutral and mixed ones
equally. The weakest topics are account management (F1 0.44), trust and security (0.51) and features
(0.52); the strongest are login and access (0.79) and customer service (0.75).

The snapshot's model fitted its TF-IDF vocabulary on all review texts, held-out ones included (no
labels). Training now fits it on non-held-out reviews only, so the next training run reports fully
separated figures; the change cannot leak labels and is expected to move them very little.

**Limits**
- App reviews over-represent strong opinions: a signal, not a survey.
- "Stars lost" comes from a regression: correlation, not proof of cause.
- Capture latency is reported only from live runs that measured it. The site says when live collection is paused.
- Complaint spikes compare a day with the 28 calendar days before it (quiet days count as zero) and need
  14 days of history; the release radar compares each version with the next lower version number.
- Brands with fewer than 150 reviews in the 60-day window get no topic estimates and are flagged as small samples.
- The agent has a budget of 6 investigation tool calls, enforced in code. Quoted reviews support its
  findings but do not prove a cause on their own; unfinished investigations are shown as unfinished.

---

## Run it

```bash
pip install -r requirements.txt                       # collection, SQL, insights, tests
pip install -r requirements-ml.txt --extra-index-url https://download.pytorch.org/whl/cpu   # training
python -m ecoute collect --mode backfill --brands "Orange, SNCF Connect"
GEMINI_API_KEY=... python -m ecoute label --limit 400
python -m ecoute score --retrain && python -m ecoute insights
python -m ecoute site --out store/site                # bundle inside the private store
python -m ecoute publish                              # anonymised copy for the website: site/data/bundle.json
python -m pytest -q
```

The website is a **snapshot**: `publish` copies a bundle into `site/data/` (masking employee names and
trimming quotes to 200 characters), and the page shows the date of the last review it contains.

Or from GitHub, in the **Actions** tab:

| Workflow | What it does |
|---|---|
| **Collect reviews** | New reviews for all brands or a chosen few (a schedule can be switched on for continuous collection). |
| **Annotate with free AI** | Labels the training sample; resumable when the free quota runs out. |
| **Analyse** | Trains the classifier, scores every review, builds insights, lets the AI analyst investigate, builds the website data. |
| **Render film** | Renders the film in 12 parallel chunks, joins them and adds the soundtrack. |
| **Video narration** | Aligns the recorded narration to the script with faster-whisper (word timings drive the cuts and the French subtitles). Kokoro and the ElevenLabs API remain as fallbacks. |

### The film

Every number, quote and agent step in the film is read from the pipeline's outputs; nothing is typed by hand.

```bash
python video/story.py --store store --out video                 # picks the stories, writes script.json + story.json
# record script.json in ElevenLabs
python video/prepare.py --voice store/video/voice --project video/film --story video/story.json
cd video/film && node render_scenes.mjs 2 out/chunks && node cues.mjs public/cues.json
python video/align_local.py narration.mp3 --out store/video/voice   # or the "Video narration" workflow
python video/capture_site.py                                        # real website captures for the website scene
python video/extend_music.py music.mp3 --seconds 91.8 --out music_long.wav
python video/mix_audio.py --voice video/film/public/narration.wav --cues video/film/public/cues.json \
  --music music_long.wav --sfx sfx/ --out soundtrack.wav
```

Scenes are rendered one file each at 2160×2700 (Remotion, React Three Fiber, software GL), joined
without re-encoding, then muxed with the mixed soundtrack: voice EQ and compression, the music ducked
under the voice, small effects on the cuts, two-pass loudness to −14 LUFS.

Workflows read and write the private data store through `scripts/databranch.sh`. To run them in a
fork, create your own private repository, set the `DATA_REPO` variable and a `DATA_TOKEN` secret
(fine-grained token, Contents read/write on that repository). Without them the workflows start from an
empty store and refuse to save, so raw reviews can never land in a public repository.

## Project layout

```
ecoute/        collector, resolver, taxonomy, free-LLM client, classifier, insights, agent, site builder
sql/           DuckDB models (facts, scorecard, heatmap, trends, releases, spikes, switching)
site/          static website (vanilla JS + D3)
video/         story builder, narration alignment, sound mix, Remotion + Three.js film
config/        brands and competitor dictionary
tests/         offline tests (no network)
```

## Why this transfers

The taxonomy (reliability, login, payments, service, delivery, trust…) is industry-neutral. Point
the collector at another set of apps (a car-maker's companion app, a SaaS product, a utility) and
the same pipeline answers the same questions: what hurts, how much, since when, and who should fix it.

## Data and ethics

- **Public reviews only**, from the official app of each brand. Usernames, avatars and platform ids are
  never stored; emails, phone numbers, IBANs and account numbers inside review text are masked.
- **What is public here:** code, aggregated figures and about 300 short, anonymous quotes used by the
  website and the film. **What is not:** the full review texts, labels and model, kept in a private repository.
- Google Play has no official API for other companies' reviews, so collection uses an open-source scraper
  at a polite rate. This is a non-commercial portfolio project; a product would use each company's own
  data through the official Play Console and App Store Connect APIs.
- Agent findings are worded as *likely* causes with the evidence they rest on, and "if fixed" ratings are
  upper-bound estimates from a regression, not forecasts.

## Third-party software and assets

| Item | Licence |
|---|---|
| D3 (vendored in `site/vendor/`) | ISC |
| d3-sankey (vendored) | BSD-3-Clause |
| Fonts: Bricolage Grotesque, Geist, Geist Mono | SIL Open Font License 1.1 |
| google-play-scraper, DuckDB, pandas, scikit-learn | MIT / MIT / BSD-3 / BSD-3 |
| paraphrase-multilingual-MiniLM-L12-v2 (sentence-transformers) | Apache-2.0 |
| Remotion (film rendering) | Remotion licence: free for individuals and companies of up to 3 people |
| three.js, React, React Three Fiber | MIT |
| Narration and music | Generated with ElevenLabs (voice "Cyril", Eleven Music) and credited in the film |

To have a quote removed (for example if you wrote it), open an issue with the brand and the text.

---

**Disclaimer.** Independent portfolio project, not affiliated with or endorsed by any brand named here.
Brand names only identify the apps whose public reviews were analysed; no logos are used. Quotes are
short, anonymous and stripped of personal data. Figures marked as estimates come from a statistical
model, not from the companies. A brand that wants its name removed can open an issue.

Built by **Narpat Ganwliya** · Python · SQL · machine learning · AI agents · GitHub Actions
