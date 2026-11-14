# Écoute: Always-on Voice of the Customer

**Every review, captured within minutes. Every issue, explained. Every fix, prioritised.**

*Écoute : l'écoute client en continu. Chaque avis capté en quelques minutes. Chaque irritant expliqué. Chaque action priorisée.*

> 🚧 Work in progress. Full write-up, live dashboard and demo video coming soon.

Écoute listens to what customers of 41 major French brands say in public app reviews
(banking, telecom, retail, mobility, energy, health), turns each review into a structured
signal, and tells a team which pain points cost them the most stars and what to fix first.

## How it works (so far)

| Stage | What happens |
|---|---|
| **Find** | For every brand, the official app is located on Google Play and the App Store. An app is only accepted when its developer matches the brand, so look-alike apps are never tracked. |
| **Capture** | New reviews are pulled newest-first and stop as soon as they reach what is already stored, so each run only fetches what customers just wrote. |
| **Protect** | Usernames, avatars and platform ids are never stored. Emails, phone numbers, IBANs and account numbers that customers paste into reviews are masked. |
| **Measure** | Every run logs how many minutes passed between a customer posting and Écoute having the review. This capture lag is measured, never assumed. |

Data is kept on the `data` branch so `main` stays code only.

## Run it

```bash
pip install -r requirements.txt
python -m ecoute collect --mode backfill --brands "Orange, SNCF Connect" --max-per-app 500
python -m pytest -q
```

Or from GitHub: **Actions → Collect reviews → Run workflow**.
