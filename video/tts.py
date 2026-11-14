"""Narration for the launch video with Kokoro (Apache-2.0, runs on CPU, free).

Full narration:  python video/tts.py --out store/video/voice [--voice am_michael]
  Reads video/script.json, writes one WAV per line plus word timings for captions.
Voice samples:   python video/tts.py --samples "am_michael;bm_george" --out store/video/samples
  The same short text in every voice, so a person can pick the one they prefer.
  Voices starting with "b" are British English, the others American English.
  A voice can be a blend: "am_michael,am_fenrir".
French names use Kokoro's pronunciation markup, e.g. [Écoute](/Akˈut/).
"""
import argparse
import json
from pathlib import Path

import numpy as np
import soundfile as sf
from kokoro import KPipeline

SR = 24000
SAMPLE_TEXT = ("So I designed an AI agent that reads all of it. I call it [Écoute](/Akˈut/). "
               "At [E.Leclerc](/ˌi ləklˈɛɹ/), complaints jumped seven-fold in a single day. "
               "B N P [Paribas](/pˌɛɹibˈɑ/), Orange, Decathlon and Deliveroo.")
_PIPES: dict[str, KPipeline] = {}


def pipe_for(voice: str) -> KPipeline:
    lang = "b" if voice.split(",")[0].strip().startswith("b") else "a"
    if lang not in _PIPES:
        _PIPES[lang] = KPipeline(lang_code=lang)
    return _PIPES[lang]


def speak(text: str, voice: str, speed: float, show_phonemes: bool = False):
    audio, words, t0 = [], [], 0.0
    for res in pipe_for(voice)(text, voice=voice, speed=speed):
        if show_phonemes:
            print("   ", getattr(res, "phonemes", ""))
        a = res.audio.numpy() if hasattr(res.audio, "numpy") else np.asarray(res.audio)
        for tok in getattr(res, "tokens", None) or []:
            if getattr(tok, "start_ts", None) is not None and tok.text.strip():
                words.append({"w": tok.text, "s": round(t0 + tok.start_ts, 3), "e": round(t0 + (tok.end_ts or tok.start_ts), 3)})
        audio.append(a)
        t0 += len(a) / SR
    return (np.concatenate(audio) if audio else np.zeros(1)), words


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--script", default="video/script.json")
    ap.add_argument("--out", default="store/video/voice")
    ap.add_argument("--voice", default=None)
    ap.add_argument("--speed", type=float, default=None)
    ap.add_argument("--samples", default="", help='voices separated by ";" (a blend uses ","): one sample each')
    args = ap.parse_args()
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)

    if args.samples:
        for v in [x.strip() for x in args.samples.split(";") if x.strip()]:
            print(v)
            wav, _ = speak(SAMPLE_TEXT, v, args.speed or 0.95, show_phonemes=True)
            name = v.replace(",", "+") + ".wav"
            sf.write(out / name, wav, SR)
            print(f"{name}: {len(wav) / SR:.2f}s")
        return

    script = json.loads(Path(args.script).read_text())
    voice = args.voice or script.get("voice", "am_michael")
    speed = args.speed or script.get("speed", 1.0)
    meta = {"voice": voice, "speed": speed, "sample_rate": SR, "lines": []}
    for i, line in enumerate(script["lines"]):
        wav, words = speak(line.get("tts", line["en"]), voice, speed, show_phonemes=True)
        name = f"line_{i:02d}.wav"
        sf.write(out / name, wav, SR)
        meta["lines"].append({"id": line["id"], "file": name, "duration": round(len(wav) / SR, 3), "words": words})
        print(f"{line['id']}: {len(wav) / SR:.2f}s, {len(words)} words")
    (out / "timings.json").write_text(json.dumps(meta, indent=1))


if __name__ == "__main__":
    main()
