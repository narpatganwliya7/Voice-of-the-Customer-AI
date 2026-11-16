"""Cut a narration recording into script lines using speech recognition word timings.

  python video/align_voice.py store/video/narration_source.mp3 --out store/video/voice

faster-whisper transcribes the recording with a time for every word; the transcript is aligned to
the script's words, so each line is cut exactly where it starts and ends (no reliance on pauses),
and on-screen cues get real word times. Writes line_XX.wav files and timings.json, like video/tts.py.
"""
import argparse
import difflib
import json
import re
import subprocess
import unicodedata
from pathlib import Path

import numpy as np
import soundfile as sf
from faster_whisper import WhisperModel

SR = 24000
NUM = {"39": "thirtynine", "44": "fourpointfour", "25": "twopointfive", "34": "threepointfour", "42": "fourpointtwo"}


def norm(w: str) -> str:
    w = unicodedata.normalize("NFKD", w).encode("ascii", "ignore").decode().lower()
    w = re.sub(r"[^a-z0-9]", "", w)
    return NUM.get(w, w)


def load(path: str, sr: int = SR) -> np.ndarray:
    p = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-ac", "1", "-ar", str(sr), "-f", "f32le", "pipe:1"], capture_output=True, check=True)
    return np.frombuffer(p.stdout, dtype=np.float32).copy()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("audio")
    ap.add_argument("--script", default="video/script.json")
    ap.add_argument("--out", default="store/video/voice")
    ap.add_argument("--model", default="small.en")
    args = ap.parse_args()
    lines = json.loads(Path(args.script).read_text())["lines"]
    audio = load(args.audio)
    total = len(audio) / SR

    model = WhisperModel(args.model, device="cpu", compute_type="int8")
    prompt = " ".join(l["en"] for l in lines)
    segs, _ = model.transcribe(load(args.audio, 16000), language="en", word_timestamps=True, initial_prompt=prompt, vad_filter=False, beam_size=5)
    heard = [(w.word.strip(), w.start, w.end) for s in segs for w in (s.words or []) if w.word.strip()]
    print("Heard:", " ".join(w for w, _, _ in heard))

    script = [(i, w) for i, l in enumerate(lines) for w in l["en"].split()]
    a, b = [norm(w) for _, w in script], [norm(w) for w, _, _ in heard]
    match = {}
    for blk in difflib.SequenceMatcher(None, a, b, autojunk=False).get_matching_blocks():
        for k in range(blk.size):
            match[blk.a + k] = blk.b + k
    print(f"Matched {len(match)} of {len(script)} script words")

    # time of every script word: matched words take the recognised time, the rest are interpolated
    times = [None] * len(script)
    for si, hi in match.items():
        times[si] = (heard[hi][1], heard[hi][2])
    known = [i for i, t in enumerate(times) if t]
    for i in range(len(times)):
        if times[i] is None:
            prev = max([k for k in known if k < i], default=None)
            nxt = min([k for k in known if k > i], default=None)
            t0 = times[prev][1] if prev is not None else 0.0
            t1 = times[nxt][0] if nxt is not None else total
            span = (nxt if nxt is not None else len(times)) - (prev if prev is not None else -1)
            pos = i - (prev if prev is not None else -1)
            t = t0 + (t1 - t0) * pos / span
            times[i] = (t, t)

    first = {i: min(k for k, (li, _) in enumerate(script) if li == i) for i in range(len(lines))}
    last = {i: max(k for k, (li, _) in enumerate(script) if li == i) for i in range(len(lines))}
    starts = [times[first[i]][0] for i in range(len(lines))]
    ends = [times[last[i]][1] for i in range(len(lines))]
    cuts = [0.0] + [(ends[i] + starts[i + 1]) / 2 for i in range(len(lines) - 1)] + [total]

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    meta = {"engine": "elevenlabs-web", "source": Path(args.audio).name, "aligned_with": args.model, "sample_rate": SR, "lines": []}
    for i, line in enumerate(lines):
        s0 = max(cuts[i], starts[i] - 0.08)
        s1 = min(cuts[i + 1], ends[i] + 0.15)
        seg = audio[int(s0 * SR): int(s1 * SR)]
        words = [{"w": w, "s": round(times[k][0] - s0, 3), "e": round(times[k][1] - s0, 3)}
                 for k, (li, w) in enumerate(script) if li == i]
        name = f"line_{i:02d}.wav"
        sf.write(out / name, seg, SR)
        meta["lines"].append({"id": line["id"], "file": name, "duration": round(len(seg) / SR, 3), "words": words})
        said = " ".join(w for w, s, e in heard if s >= s0 - 0.05 and e <= s1 + 0.05)
        print(f"{line['id']:<11} {s0:6.2f}-{s1:6.2f}s  heard: {said}")
    (out / "timings.json").write_text(json.dumps(meta, indent=1))


if __name__ == "__main__":
    main()
