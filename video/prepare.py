"""Assemble everything the launch video needs into one data file, from real outputs only.

Inputs : site bundle (real reviews, insights, agent run), video/script.json, narration timings + WAVs.
Outputs: <video project>/src/data.json and <video project>/public/narration.wav
"""
import argparse
import json
import re
from pathlib import Path

import numpy as np
import soundfile as sf

FPS = 30
LEAD = 0.3    # seconds of picture before the voice starts in each scene
TAIL = 0.4    # seconds after the voice ends


def chunks(text: str, max_len: int = 46) -> list[str]:
    parts = re.split(r"(?<=[.!?:;,])\s+", text.strip())
    out, cur = [], ""
    for p in parts:
        if cur and len(cur) + 1 + len(p) > max_len:
            out.append(cur)
            cur = p
        else:
            cur = (cur + " " + p).strip()
    if cur:
        out.append(cur)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--bundle", default=None, help="unused, kept for compatibility")
    ap.add_argument("--script", default="video/script.json")
    ap.add_argument("--voice", required=True, help="folder with timings.json and line_XX.wav")
    ap.add_argument("--project", required=True)
    ap.add_argument("--story", required=True, help="story.json: chosen insight brand, agent case, quotes")
    ap.add_argument("--credits", default="Voice: ElevenLabs.", help="audio credits shown on the end card")
    args = ap.parse_args()

    script = json.loads(Path(args.script).read_text())
    story = json.loads(Path(args.story).read_text())
    voice_dir = Path(args.voice)
    timings = json.loads((voice_dir / "timings.json").read_text())
    sr = timings["sample_rate"]

    scenes, captions, t = [], [], 0.0
    audio = []
    for line, tm in zip(script["lines"], timings["lines"]):
        dur = tm["duration"]
        start = t
        tail = 2.6 if line is script["lines"][-1] else TAIL  # let the end card breathe
        frames = int(round((LEAD + dur + tail) * FPS))
        words = [{"w": w["w"], "f": int(round((LEAD + w["s"]) * FPS))} for w in tm.get("words", [])]
        scenes.append({"id": line["id"], "start": int(round(start * FPS)), "frames": frames, "words": words})
        v0 = start + LEAD
        cs = chunks(line["fr"])
        total = sum(len(c) for c in cs)
        acc = 0
        for c in cs:
            s = v0 + dur * acc / total
            acc += len(c)
            e = v0 + dur * acc / total
            captions.append({"s": round(s, 3), "e": round(e + 0.12, 3), "fr": c})
        wav, _ = sf.read(voice_dir / tm["file"])
        if wav.ndim > 1:
            wav = wav.mean(1)
        audio.append((v0, wav))
        t = start + frames / FPS

    total_s = t
    track = np.zeros(int(total_s * sr) + sr)
    for v0, wav in audio:
        i = int(v0 * sr)
        track[i:i + len(wav)] += wav
    track = np.clip(track, -1, 1)
    out_pub = Path(args.project) / "public"
    out_pub.mkdir(parents=True, exist_ok=True)
    sf.write(out_pub / "narration.wav", track[: int(total_s * sr)], sr)

    # per-frame voice level for the orb
    hop = sr // FPS
    rms = np.array([np.sqrt(np.mean(track[i * hop:(i + 1) * hop] ** 2)) for i in range(int(total_s * FPS))])
    rms = np.convolve(rms, np.ones(3) / 3, mode="same")
    levels = np.clip(rms / (np.percentile(rms[rms > 0], 95) if (rms > 0).any() else 1), 0, 1)

    data = {
        "fps": FPS, "frames": int(round(total_s * FPS)),
        "scenes": scenes, "captions": captions, "levels": [round(float(x), 3) for x in levels], "credits": args.credits,
        "draft": bool(timings.get("draft")),
        **story,
    }
    Path(args.project, "src", "data.json").write_text(json.dumps(data, ensure_ascii=False))
    print(f"{len(scenes)} scenes, {total_s:.1f}s, {len(captions)} captions")


if __name__ == "__main__":
    main()
