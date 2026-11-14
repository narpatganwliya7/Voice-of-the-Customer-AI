"""The Écoute customer-experience taxonomy.

Written to work across industries (banking, telecom, retail, mobility, energy, health)
and to transfer unchanged to any product with an app and customers: the same 15 aspects
apply to a car-maker's app, a SaaS product or a utility.
"""
from __future__ import annotations

PROMPT_VERSION = "v1"

# key: (English label, French label, definition used by the annotator)
ASPECTS: dict[str, tuple[str, str, str]] = {
    "app_reliability": ("App reliability", "Fiabilité de l'appli",
        "Crashes, bugs, freezes, error messages, app will not open, features that fail to work."),
    "login_access": ("Login & access", "Connexion & accès",
        "Logging in, passwords, SMS/2FA codes, security keys, identity checks, being logged out, re-enrolment of a device."),
    "device_compatibility": ("Device compatibility", "Compatibilité appareil",
        "Phone or OS version not supported, rooted/jailbroken device refused, tablet, NFC, Huawei/no Google services."),
    "performance": ("Speed & performance", "Rapidité & performance",
        "Slowness, long loading, lag, heavy battery or data use."),
    "usability": ("Ease of use & design", "Simplicité & ergonomie",
        "Navigation, clarity, interface design, layout changes, accessibility, number of steps needed."),
    "features": ("Features", "Fonctionnalités",
        "Presence, absence or quality of a specific feature; feature requests; removed features."),
    "payments_billing": ("Payments & billing", "Paiements & facturation",
        "Card payments, transfers, failed or double charges, refunds, invoices, direct debits, bills."),
    "pricing_fees": ("Price & fees", "Prix & frais",
        "Prices, fees, commissions, subscription cost, value for money, promotions."),
    "customer_service": ("Customer service", "Service client",
        "Reaching support, response time, chatbot, advisor competence and attitude, complaint handling."),
    "account_management": ("Account management", "Gestion du compte",
        "Opening/closing an account, blocked or suspended account, documents/KYC, changing personal details, cancelling a contract or subscription."),
    "orders_delivery": ("Orders & delivery", "Commandes & livraison",
        "Orders, stock, delivery delays, missing or damaged items, returns, click & collect, couriers."),
    "core_service": ("Core service quality", "Qualité du service",
        "The underlying service itself rather than the app: network coverage, rides and drivers, trains, energy supply, product quality, appointments, food quality."),
    "trust_security": ("Trust & security", "Confiance & sécurité",
        "Fraud, scams, hacked accounts, unauthorised transactions, privacy and personal-data concerns, feeling misled."),
    "notifications_ads": ("Notifications & ads", "Notifications & publicité",
        "Too many notifications, spam, ads or marketing pushed in the app, unwanted emails or SMS."),
    "loyalty_rewards": ("Loyalty & rewards", "Fidélité & avantages",
        "Loyalty programmes, points, cashback, coupons, member offers."),
}

SENTIMENTS = ["positive", "negative", "neutral"]
OVERALL = ["positive", "negative", "mixed", "neutral"]
CHURN = ["none", "app", "company"]  # app = stops using the app; company = leaves the brand
SEVERITY_HELP = (
    "0 = no problem (praise or neutral); 1 = minor annoyance; "
    "2 = blocks a task (cannot pay, order, log in, book); "
    "3 = critical: money lost or stuck, locked out of the account or service, safety or fraud."
)


def instructions() -> str:
    lines = "\n".join(f"- {k}: {v[2]}" for k, v in ASPECTS.items())
    return f"""You are a senior customer-experience analyst annotating French app-store reviews.
Each review comes from a customer of a French company (bank, insurer, telecom operator,
retailer, mobility or delivery service, energy supplier or health platform).

For EVERY review return one object with:
- id: copy the input id exactly.
- aspects: the aspects the customer actually talks about (0 to 4), each with its sentiment
  (positive / negative / neutral). Use only these aspect keys:
{lines}
  Generic praise or anger with no specific topic ("super appli", "nul") gets no aspects.
- sentiment: overall tone of the review: positive, negative, mixed or neutral.
  Judge the text, not only the star rating (5 stars with a complaint is mixed).
- churn: "company" if the customer says they are leaving / switching provider / closing the
  account / cancelling; "app" if they only stop using or uninstall the app; otherwise "none".
- competitors: names of other companies the customer mentions as alternatives or comparisons
  (e.g. "Boursorama", "Free", "Amazon"); empty list if none. Never include the reviewed brand.
- after_update: true only if the customer says the problem started after an app update / new version.
- severity: {SEVERITY_HELP}
- gist: the review's main point in plain English, max 15 words.

Be precise and conservative: tag an aspect only when the text gives evidence for it."""


def response_schema() -> dict:
    """Gemini responseSchema (OpenAPI subset) for a batch of annotations."""
    item = {
        "type": "OBJECT",
        "properties": {
            "id": {"type": "STRING"},
            "aspects": {
                "type": "ARRAY",
                "items": {
                    "type": "OBJECT",
                    "properties": {
                        "aspect": {"type": "STRING", "enum": list(ASPECTS)},
                        "sentiment": {"type": "STRING", "enum": SENTIMENTS},
                    },
                    "required": ["aspect", "sentiment"],
                },
            },
            "sentiment": {"type": "STRING", "enum": OVERALL},
            "churn": {"type": "STRING", "enum": CHURN},
            "competitors": {"type": "ARRAY", "items": {"type": "STRING"}},
            "after_update": {"type": "BOOLEAN"},
            "severity": {"type": "INTEGER"},
            "gist": {"type": "STRING"},
        },
        "required": ["id", "aspects", "sentiment", "churn", "competitors", "after_update", "severity", "gist"],
        "propertyOrdering": ["id", "aspects", "sentiment", "churn", "competitors", "after_update", "severity", "gist"],
    }
    return {"type": "ARRAY", "items": item}


def clean(item: dict, brand: str = "") -> dict | None:
    """Validate one annotation; drop anything outside the taxonomy. None if unusable."""
    try:
        seen, aspects = set(), []
        for a in item.get("aspects") or []:
            k, s = a.get("aspect"), a.get("sentiment")
            if k in ASPECTS and s in SENTIMENTS and k not in seen:
                seen.add(k)
                aspects.append([k, s])
        sev = int(item.get("severity", 0))
        comps = []
        for c in item.get("competitors") or []:
            c = str(c).strip()
            if c and c.lower() not in brand.lower() and brand.lower() not in c.lower() and c not in comps:
                comps.append(c[:40])
        out = {
            "aspects": aspects[:4],
            "sentiment": item["sentiment"] if item.get("sentiment") in OVERALL else None,
            "churn": item["churn"] if item.get("churn") in CHURN else "none",
            "competitors": comps[:5],
            "after_update": bool(item.get("after_update")),
            "severity": min(max(sev, 0), 3),
            "gist": str(item.get("gist") or "")[:160],
        }
        return out if out["sentiment"] else None
    except (TypeError, ValueError, KeyError):
        return None
