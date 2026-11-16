"""Placeholder narration timings, so the film can be laid out before the real voice is recorded.

Writes silent line_XX.wav files and a timings.json in the same shape align_voice.py produces,
with word times spread by word length at a narrator's pace. Replace with align_voice.py output
as soon as the recorded MP3 exists; nothing here ships in a final render.
"""
import argparse
import json
from pathlib import Path

import numpy as np
import soundfile as sf

SR = 24000


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--script", default="video/script.json")
    ap.add_argument("--out", required=True)
    ap.add_argument("--wps", type=float, default=2.3, help="words per second")
    args = ap.parse_args()
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    lines = []
    for i, line in enumerate(json.loads(Path(args.script).read_text())["lines"]):
        words = line["en"].split()
        dur = len(words) / args.wps + 0.25 * sum(w[-1] in ".:" for w in words[:-1])
        weights = np.array([len(w) + 3 + (6 if w[-1] in ".:," else 0) for w in words], float)
        edges = np.concatenate([[0], np.cumsum(weights)]) / weights.sum() * dur
        name = f"line_{i:02d}.wav"
        sf.write(out / name, np.zeros(int(dur * SR)), SR)
        lines.append({"file": name, "duration": round(dur, 3),
                      "words": [{"w": w, "s": round(float(edges[j]), 3), "e": round(float(edges[j + 1]), 3)} for j, w in enumerate(words)]})
    (out / "timings.json").write_text(json.dumps({"sample_rate": SR, "draft": True, "lines": lines}, indent=1))
    print(f"{len(lines)} lines, {sum(x['duration'] for x in lines):.1f}s (draft)")


if __name__ == "__main__":
    main()
