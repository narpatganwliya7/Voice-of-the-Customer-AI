"""Narration for the launch video with Kokoro (Apache-2.0, runs on CPU, free).

Reads video/script.json, writes one WAV per line plus word timings for captions.
Run in GitHub Actions: `python video/tts.py --out store/video/voice`.
"""
import argparse
import json
from pathlib import Path

import numpy as np
import soundfile as sf
from kokoro import KPipeline

SR = 24000


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--script", default="video/script.json")
    ap.add_argument("--out", default="store/video/voice")
    ap.add_argument("--voice", default=None)
    args = ap.parse_args()
    script = json.loads(Path(args.script).read_text())
    voice = args.voice or script.get("voice", "af_heart")
    speed = script.get("speed", 1.0)
    pipe = KPipeline(lang_code=script.get("lang_code", "a"))
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    meta = {"voice": voice, "sample_rate": SR, "lines": []}
    for i, line in enumerate(script["lines"]):
        audio, words, t0 = [], [], 0.0
        for res in pipe(line.get("tts", line["en"]), voice=voice, speed=speed):
            a = res.audio.numpy() if hasattr(res.audio, "numpy") else np.asarray(res.audio)
            for tok in getattr(res, "tokens", None) or []:
                if getattr(tok, "start_ts", None) is not None and tok.text.strip():
                    words.append({"w": tok.text, "s": round(t0 + tok.start_ts, 3), "e": round(t0 + (tok.end_ts or tok.start_ts), 3)})
            audio.append(a)
            t0 += len(a) / SR
        wav = np.concatenate(audio) if audio else np.zeros(1)
        name = f"line_{i:02d}.wav"
        sf.write(out / name, wav, SR)
        meta["lines"].append({"id": line["id"], "file": name, "duration": round(len(wav) / SR, 3), "words": words})
        print(f"{line['id']}: {len(wav) / SR:.2f}s, {len(words)} words")
    (out / "timings.json").write_text(json.dumps(meta, indent=1))


if __name__ == "__main__":
    main()
