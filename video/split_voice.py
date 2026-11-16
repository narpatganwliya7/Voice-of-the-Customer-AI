"""Split one narration recording (made in a TTS web app, with ~1.5 s pauses between lines)
into one WAV per script line, plus timings.json in the same format as video/tts.py.

  python video/split_voice.py narration.mp3 --out store/video/voice

The pauses are found with ffmpeg's silencedetect; the N-1 longest pauses separate the N lines.
Word times inside a line are estimated from character positions (used for on-screen cues only).
"""
import argparse
import json
import re
import subprocess
from pathlib import Path

import numpy as np
import soundfile as sf

SR = 24000


def load(path: str) -> np.ndarray:
    p = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-ac", "1", "-ar", str(SR), "-f", "f32le", "pipe:1"], capture_output=True, check=True)
    return np.frombuffer(p.stdout, dtype=np.float32)


def silences(path: str, noise_db: int = -38, min_d: float = 0.55) -> list[tuple[float, float]]:
    p = subprocess.run(["ffmpeg", "-i", path, "-af", f"silencedetect=noise={noise_db}dB:d={min_d}", "-f", "null", "-"], capture_output=True, text=True)
    starts = [float(x) for x in re.findall(r"silence_start: ([\d.]+)", p.stderr)]
    ends = [float(x) for x in re.findall(r"silence_end: ([\d.]+)", p.stderr)]
    return list(zip(starts, ends))


def choose_cuts(gaps, chars, total):
    """Pick the N-1 pauses that best split the audio in proportion to each line's length,
    preferring longer pauses (dynamic programming over the candidate pauses)."""
    n = len(chars) - 1
    speech = total - sum(b - a for a, b in gaps) * 0.5
    cum = [sum(chars[: k + 1]) / sum(chars) for k in range(n)]
    target = [c * total for c in cum]
    G = len(gaps)
    INF = float("inf")
    cost = [[INF] * G for _ in range(n)]
    back = [[-1] * G for _ in range(n)]
    for j, (a, b) in enumerate(gaps):
        cost[0][j] = abs((a + b) / 2 - target[0]) / total - 0.6 * (b - a) / max(1e-6, speech) * 10
    for k in range(1, n):
        for j, (a, b) in enumerate(gaps):
            here = abs((a + b) / 2 - target[k]) / total - 0.6 * (b - a) / max(1e-6, speech) * 10
            best = min(((cost[k - 1][i], i) for i in range(j)), default=(INF, -1))
            if best[0] < INF:
                cost[k][j], back[k][j] = best[0] + here, best[1]
    j = min(range(G), key=lambda x: cost[n - 1][x])
    picked = []
    for k in range(n - 1, -1, -1):
        picked.append(gaps[j])
        j = back[k][j]
    return picked[::-1]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("audio")
    ap.add_argument("--script", default="video/script.json")
    ap.add_argument("--out", default="store/video/voice")
    args = ap.parse_args()
    lines = json.loads(Path(args.script).read_text())["lines"]
    audio = load(args.audio)
    total = len(audio) / SR
    gaps = [g for g in silences(args.audio, min_d=0.25) if g[0] > 0.2 and g[1] < total - 0.2]
    if len(gaps) < len(lines) - 1:
        raise SystemExit(f"Found {len(gaps)} pauses, need {len(lines) - 1}: leave a pause between the lines")
    cuts = choose_cuts(gaps, [len(l["en"]) for l in lines], total)
    bounds = [0.0] + [(a + b) / 2 for a, b in cuts] + [total]
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    meta = {"engine": "elevenlabs-web", "source": Path(args.audio).name, "sample_rate": SR, "lines": []}
    for i, line in enumerate(lines):
        seg = audio[int(bounds[i] * SR): int(bounds[i + 1] * SR)]
        loud = np.where(np.abs(seg) > 0.01)[0]  # trim the pause around the voice
        a, b = (max(0, loud[0] - int(0.04 * SR)), min(len(seg), loud[-1] + int(0.08 * SR))) if len(loud) else (0, len(seg))
        seg = seg[a:b]
        dur = len(seg) / SR
        words, text, pos = [], line["en"], 0
        for w in text.split():
            k = text.index(w, pos)
            words.append({"w": w, "s": round(dur * k / len(text), 3), "e": round(dur * (k + len(w)) / len(text), 3)})
            pos = k + len(w)
        name = f"line_{i:02d}.wav"
        sf.write(out / name, seg, SR)
        meta["lines"].append({"id": line["id"], "file": name, "duration": round(dur, 3), "words": words})
        print(f"{line['id']:<11} {dur:5.2f}s  {text[:60]}")
    (out / "timings.json").write_text(json.dumps(meta, indent=1))


if __name__ == "__main__":
    main()
