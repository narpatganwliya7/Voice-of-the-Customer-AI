"""Narration for the launch video.

Two engines:
  elevenlabs  ElevenLabs free tier (API key in the ELEVENLABS_API_KEY secret). Natural voices,
              incl. English with a French accent. Free plan: personal use, credit "Voice: ElevenLabs".
  kokoro      Kokoro (Apache-2.0, runs on CPU, no account). French names use its markup, e.g. [Écoute](/Akˈut/).

  python video/tts.py --engine elevenlabs --list                      # voices in the account
  python video/tts.py --engine elevenlabs --samples "<id>;<id>" --out store/video/samples
  python video/tts.py --engine elevenlabs --voice <id> --out store/video/voice
Writes one WAV per narration line plus word timings (used to time captions and on-screen cues).
"""
import argparse
import base64
import io
import json
import os
import re
import subprocess
from pathlib import Path

import numpy as np
import requests
import soundfile as sf

SR = 24000
SAMPLE_EN = ("So I designed an AI agent that reads all of it. I call it Écoute. "
             "At E.Leclerc, complaints jumped seven-fold in a single day. BNP Paribas, Orange, Decathlon and Deliveroo.")
SAMPLE_KOKORO = ("So I designed an AI agent that reads all of it. I call it [Écoute](/Akˈut/). "
                 "At [E.Leclerc](/ˌi ləklˈɛɹ/), complaints jumped seven-fold in a single day. "
                 "B N P [Paribas](/pˌɛɹibˈɑ/), Orange, Decathlon and Deliveroo.")
EL = "https://api.elevenlabs.io/v1"


# ---------------- ElevenLabs ----------------
def el_headers() -> dict:
    key = os.environ.get("ELEVENLABS_API_KEY")
    if not key:
        raise SystemExit("ELEVENLABS_API_KEY is not set: add it as a repository secret")
    return {"xi-api-key": key, "Content-Type": "application/json"}


def el_list() -> list[dict]:
    r = requests.get(f"{EL}/voices", headers=el_headers(), timeout=30)
    if r.status_code != 200:
        raise SystemExit(f"Could not list voices (HTTP {r.status_code}): give the key the 'Voices: Read' permission. {r.text[:200]}")
    out = []
    for v in r.json().get("voices", []):
        lab = v.get("labels") or {}
        out.append({"id": v["voice_id"], "name": v["name"], "category": v.get("category"),
                    "accent": lab.get("accent"), "gender": lab.get("gender"), "age": lab.get("age"), "use": lab.get("use_case") or lab.get("use case")})
    return out


def to_wav(mp3: bytes) -> np.ndarray:
    p = subprocess.run(["ffmpeg", "-v", "error", "-i", "pipe:0", "-ac", "1", "-ar", str(SR), "-f", "wav", "pipe:1"],
                       input=mp3, capture_output=True, check=True)
    data, _ = sf.read(io.BytesIO(p.stdout), dtype="float32")
    return data


def el_speak(text: str, voice: str, speed: float, prev: str = "", nxt: str = "", model: str = "eleven_multilingual_v2"):
    body = {"text": text, "model_id": model,
            "voice_settings": {"stability": 0.55, "similarity_boost": 0.8, "style": 0.15, "use_speaker_boost": True, "speed": speed}}
    if prev:
        body["previous_text"] = prev
    if nxt:
        body["next_text"] = nxt
    r = requests.post(f"{EL}/text-to-speech/{voice}/with-timestamps", params={"output_format": "mp3_44100_128"},
                      headers=el_headers(), json=body, timeout=180)
    if r.status_code != 200:
        raise SystemExit(f"ElevenLabs HTTP {r.status_code}: {r.text[:300]}")
    js = r.json()
    wav = to_wav(base64.b64decode(js["audio_base64"]))
    al = js.get("normalized_alignment") or js.get("alignment") or {}
    words, cur, start, end = [], "", None, None
    for ch, s, e in zip(al.get("characters", []), al.get("character_start_times_seconds", []), al.get("character_end_times_seconds", [])):
        if ch.isspace():
            if cur.strip():
                words.append({"w": cur.strip(), "s": round(start, 3), "e": round(end, 3)})
            cur, start = "", None
            continue
        if start is None:
            start = s
        cur, end = cur + ch, e
    if cur.strip():
        words.append({"w": cur.strip(), "s": round(start, 3), "e": round(end, 3)})
    return wav, words


# ---------------- Kokoro ----------------
_PIPES = {}


def kokoro_speak(text: str, voice: str, speed: float):
    from kokoro import KPipeline
    lang = "b" if voice.split(",")[0].strip().startswith("b") else "a"
    if lang not in _PIPES:
        _PIPES[lang] = KPipeline(lang_code=lang)
    audio, words, t0 = [], [], 0.0
    for res in _PIPES[lang](text, voice=voice, speed=speed):
        a = res.audio.numpy() if hasattr(res.audio, "numpy") else np.asarray(res.audio)
        for tok in getattr(res, "tokens", None) or []:
            if getattr(tok, "start_ts", None) is not None and tok.text.strip():
                words.append({"w": tok.text, "s": round(t0 + tok.start_ts, 3), "e": round(t0 + (tok.end_ts or tok.start_ts), 3)})
        audio.append(a)
        t0 += len(a) / SR
    return (np.concatenate(audio) if audio else np.zeros(1)), words


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--engine", choices=["elevenlabs", "kokoro"], default="elevenlabs")
    ap.add_argument("--script", default="video/script.json")
    ap.add_argument("--out", default="store/video/voice")
    ap.add_argument("--voice", default=None)
    ap.add_argument("--speed", type=float, default=None)
    ap.add_argument("--samples", default="", help='voices separated by ";": one short sample each ("all" = every voice in the account)')
    ap.add_argument("--list", action="store_true")
    args = ap.parse_args()
    out = Path(args.out)

    if args.engine == "elevenlabs" and (args.list or args.samples == "all"):
        voices = el_list()
        for v in voices:
            print(f"{v['id']}  {v['name']:<34} {v['category'] or '':<10} {v['gender'] or '':<7} {v['accent'] or '':<14} {v['use'] or ''}")
        if args.list:
            return
        args.samples = ";".join(v["id"] for v in voices if v["category"] != "premade") or ";".join(v["id"] for v in voices[:4])

    if args.samples:
        out.mkdir(parents=True, exist_ok=True)
        try:
            names = {v["id"]: v["name"] for v in el_list()} if args.engine == "elevenlabs" else {}
        except SystemExit:
            names = {}
        for v in [x.strip() for x in args.samples.split(";") if x.strip()]:
            if args.engine == "elevenlabs":
                wav, _ = el_speak(SAMPLE_EN, v, args.speed or 0.95)
            else:
                wav, _ = kokoro_speak(SAMPLE_KOKORO, v, args.speed or 0.95)
            label = re.sub(r"[^A-Za-z0-9_+-]+", "_", names.get(v, v))[:40]
            sf.write(out / f"{label}__{v}.wav", wav, SR)
            print(f"{label}: {len(wav) / SR:.2f}s")
        return

    out.mkdir(parents=True, exist_ok=True)
    script = json.loads(Path(args.script).read_text())
    voice = args.voice or script.get("voice")
    speed = args.speed or script.get("speed", 0.95)
    lines = script["lines"]
    meta = {"engine": args.engine, "voice": voice, "speed": speed, "sample_rate": SR, "lines": []}
    for i, line in enumerate(lines):
        if args.engine == "elevenlabs":
            prev = " ".join(l["en"] for l in lines[max(0, i - 2):i])
            nxt = lines[i + 1]["en"] if i + 1 < len(lines) else ""
            wav, words = el_speak(line["en"], voice, speed, prev, nxt)
        else:
            wav, words = kokoro_speak(line.get("tts", line["en"]), voice, speed)
        name = f"line_{i:02d}.wav"
        sf.write(out / name, wav, SR)
        meta["lines"].append({"id": line["id"], "file": name, "duration": round(len(wav) / SR, 3), "words": words})
        print(f"{line['id']}: {len(wav) / SR:.2f}s, {len(words)} words")
    (out / "timings.json").write_text(json.dumps(meta, indent=1))


if __name__ == "__main__":
    main()
