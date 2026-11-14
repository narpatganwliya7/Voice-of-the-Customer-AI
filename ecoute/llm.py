"""Free LLM providers for annotation.

Primary: Google Gemini API free tier (key in the GEMINI_API_KEY secret).
Optional backup: any OpenAI-compatible endpoint with a free tier
(LLM_BASE_URL + LLM_API_KEY + LLM_MODEL secrets).

The best available model is discovered at run time, so the project keeps working when
Google renames or retires models. Daily free quotas are respected: when one model's quota
is used up the next one is tried, and when all are used up the run stops cleanly and
resumes next time.
"""
from __future__ import annotations

import json
import logging
import os
import re
import time

import requests

log = logging.getLogger(__name__)
GEMINI = "https://generativelanguage.googleapis.com/v1beta"
SKIP = re.compile(r"image|tts|audio|live|embed|vision|thinking|exp|learnlm|robotics|computer|native|gemma", re.I)


class QuotaExhausted(Exception):
    """The daily free quota of a model is used up."""


class LLMError(Exception):
    pass


def rank_gemini(names: list[str]) -> list[str]:
    """Flash models first (best quality per free request), then Flash-Lite; newest and stable first."""
    def key(n: str):
        m = re.search(r"gemini-(\d+(?:\.\d+)?)-flash(-lite)?", n)
        version = float(m.group(1)) if m else 0
        return (bool(m.group(2)) if m else True, "preview" in n, -version, "latest" in n, n)
    flash = [n for n in names if "flash" in n and n.startswith("gemini-") and not SKIP.search(n)]
    return sorted(flash, key=key)


class Gemini:
    name = "gemini"

    def __init__(self, api_key: str, models: list[str] | None = None, min_interval: float = 6.5,
                 session: requests.Session | None = None):
        self.key, self.s = api_key, session or requests.Session()
        self.min_interval, self._last = min_interval, 0.0
        self.models = models or self.discover()
        if not self.models:
            raise LLMError("No Gemini Flash model is available for this API key")
        log.info("Gemini models in order of preference: %s", ", ".join(self.models[:4]))

    @property
    def model(self) -> str:
        return self.models[0]

    def discover(self) -> list[str]:
        r = self.s.get(f"{GEMINI}/models", params={"pageSize": 1000}, headers={"x-goog-api-key": self.key}, timeout=30)
        if r.status_code != 200:
            raise LLMError(f"Gemini model list failed: HTTP {r.status_code} {r.text[:200]}")
        names = [m["name"].removeprefix("models/") for m in r.json().get("models", [])
                 if "generateContent" in m.get("supportedGenerationMethods", [])]
        pinned = os.environ.get("GEMINI_MODEL")
        ranked = rank_gemini(names)
        return ([pinned] + [n for n in ranked if n != pinned]) if pinned else ranked

    def generate(self, system: str, user: str, schema: dict) -> list | dict:
        """Returns parsed JSON. Falls through models when a daily quota is exhausted."""
        while self.models:
            try:
                return self._call(self.model, system, user, schema)
            except QuotaExhausted:
                log.warning("Daily free quota used up for %s", self.model)
                self.models.pop(0)
        raise QuotaExhausted("all Gemini models")

    def _call(self, model: str, system: str, user: str, schema: dict, attempts: int = 6):
        body = {
            "systemInstruction": {"parts": [{"text": system}]},
            "contents": [{"role": "user", "parts": [{"text": user}]}],
            "generationConfig": {"temperature": 0, "responseMimeType": "application/json", "responseSchema": schema},
        }
        for attempt in range(attempts):
            wait = self.min_interval - (time.monotonic() - self._last)
            if wait > 0:
                time.sleep(wait)
            self._last = time.monotonic()
            try:
                r = self.s.post(f"{GEMINI}/models/{model}:generateContent", json=body,
                                headers={"x-goog-api-key": self.key}, timeout=180)
            except requests.RequestException as e:
                log.warning("%s network error: %s", model, e)
                time.sleep(10 * (attempt + 1))
                continue
            if r.status_code == 200:
                data = r.json()
                parts = (data.get("candidates") or [{}])[0].get("content", {}).get("parts", [])
                text = "".join(p.get("text", "") for p in parts if not p.get("thought"))
                try:
                    return json.loads(text)
                except json.JSONDecodeError:
                    log.warning("%s returned invalid JSON (finish=%s)", model,
                                (data.get("candidates") or [{}])[0].get("finishReason"))
                    raise LLMError("invalid JSON")
            if r.status_code == 429:
                delay, daily = _quota_info(r)
                if daily:
                    raise QuotaExhausted(model)
                log.info("%s rate limited, waiting %ss", model, delay)
                time.sleep(delay)
                continue
            if r.status_code in (500, 502, 503, 504):
                time.sleep(15 * (attempt + 1))
                continue
            if r.status_code == 404:  # model retired since discovery
                raise QuotaExhausted(model)
            raise LLMError(f"{model}: HTTP {r.status_code} {r.text[:300]}")
        raise LLMError(f"{model}: gave up after {attempts} attempts")


def _quota_info(r: requests.Response) -> tuple[float, bool]:
    delay, daily = 60.0, False
    try:
        for d in r.json().get("error", {}).get("details", []):
            if d.get("@type", "").endswith("RetryInfo"):
                delay = float(str(d.get("retryDelay", "60s")).rstrip("s") or 60) + 2
            for v in d.get("violations", []):
                if "PerDay" in v.get("quotaId", "") or "per_day" in v.get("quotaMetric", ""):
                    daily = True
    except (ValueError, AttributeError):
        pass
    return min(delay, 300), daily


class OpenAICompatible:
    """Backup provider: any OpenAI-compatible chat endpoint with a free tier."""
    name = "openai-compatible"

    def __init__(self, base_url: str, api_key: str, model: str, min_interval: float = 3.0):
        self.base, self.key, self.model = base_url.rstrip("/"), api_key, model
        self.min_interval, self._last, self.s = min_interval, 0.0, requests.Session()

    def generate(self, system: str, user: str, schema: dict):
        user += '\n\nReturn a JSON object {"items": [...]} with one item per review.'
        for attempt in range(5):
            wait = self.min_interval - (time.monotonic() - self._last)
            if wait > 0:
                time.sleep(wait)
            self._last = time.monotonic()
            r = self.s.post(f"{self.base}/chat/completions", timeout=180,
                            headers={"Authorization": f"Bearer {self.key}"},
                            json={"model": self.model, "temperature": 0,
                                  "response_format": {"type": "json_object"},
                                  "messages": [{"role": "system", "content": system},
                                               {"role": "user", "content": user}]})
            if r.status_code == 200:
                return json.loads(r.json()["choices"][0]["message"]["content"])
            if r.status_code == 429:
                if "day" in r.text.lower():
                    raise QuotaExhausted(self.model)
                time.sleep(float(r.headers.get("retry-after", 30)) + 1)
                continue
            if r.status_code >= 500:
                time.sleep(15 * (attempt + 1))
                continue
            raise LLMError(f"{self.model}: HTTP {r.status_code} {r.text[:300]}")
        raise LLMError(f"{self.model}: gave up")


def providers_from_env() -> list:
    out = []
    if os.environ.get("GEMINI_API_KEY"):
        out.append(Gemini(os.environ["GEMINI_API_KEY"]))
    if os.environ.get("LLM_API_KEY") and os.environ.get("LLM_BASE_URL") and os.environ.get("LLM_MODEL"):
        out.append(OpenAICompatible(os.environ["LLM_BASE_URL"], os.environ["LLM_API_KEY"], os.environ["LLM_MODEL"]))
    if not out:
        raise LLMError("No free LLM configured: add the GEMINI_API_KEY repository secret")
    return out
