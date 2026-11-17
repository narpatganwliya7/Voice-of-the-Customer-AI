"""Align a recorded narration to script.json on this machine, with no model download.

Forced alignment with PocketSphinx (its English acoustic model ships inside the pip wheel): the
decoder is told the exact script and only has to find where each word sits. Brand names and other
words missing from its dictionary get hand-written pronunciations. Writes the same files as
align_voice.py (faster-whisper on a GitHub runner): one WAV per line plus timings.json.

  python video/align_local.py narration.mp3 --script video/script.json --out store/video/voice
"""
import argparse
import json
import re
import subprocess
from pathlib import Path

import numpy as np
import soundfile as sf
from pocketsphinx import Decoder

SR = 16000
PAD = 0.12  # seconds of air kept around each line

# Pronunciations for words the CMU dictionary does not know (ARPAbet, no stress marks).
EXTRA = {
    "ecoute": "EY K UW T", "deliveroo": "D EH L IH V ER UW", "paribas": "P AE R IH B AA",
    "bnp": "B IY EH N P IY", "leclerc": "L AH K L EH R", "leclercs": "L AH K L EH R Z",
    "sql": "EH S K Y UW EH L", "logins": "L AO G IH N Z", "hotfix": "HH AA T F IH K S", "decathlon": "D EY K AE T L AA N",
}
NUM = {"0": "zero", "1": "one", "2": "two", "3": "three", "4": "four", "5": "five", "6": "six", "7": "seven",
       "8": "eight", "9": "nine"}


def tokens(word: str) -> list[str]:
    """How the decoder should hear one script word (lowercase dictionary words)."""
    w = word.lower().replace("’", "'")
    w = re.sub(r"^[^\w']+|[^\w']+$", "", w)
    if re.fullmatch(r"\d+\.\d+", w):
        a, b = w.split(".")
        return [NUM[c] for c in a] + ["point"] + [NUM[c] for c in b]
    w = w.replace("é", "e").replace("è", "e")
    if w.startswith("e.leclerc"):
        return ["e", "leclercs" if w.endswith("'s") else "leclerc"]
    return [t for t in re.split(r"[-.]", w) if t]


def decode(path: str) -> np.ndarray:
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-ac", "1", "-ar", str(SR), "-f", "s16le", "-"],
                         capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.int16)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("audio")
    ap.add_argument("--script", default="video/script.json")
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    lines = json.loads(Path(args.script).read_text())["lines"]
    words, toks, owner = [], [], []  # owner[i] = index of the script word that token i belongs to
    for li, line in enumerate(lines):
        for w in line["en"].split():
            words.append((li, w))
            for t in tokens(w):
                toks.append(t)
                owner.append(len(words) - 1)

    dec = Decoder(samprate=SR, bestpath=False, loglevel="ERROR")
    new = [(w, ph) for w, ph in EXTRA.items() if dec.lookup_word(w) is None]
    for i, (w, ph) in enumerate(new):
        dec.add_word(w, ph, i == len(new) - 1)
    missing = sorted({t for t in toks if dec.lookup_word(t) is None})
    if missing:
        raise SystemExit(f"no pronunciation for: {missing}")
    pcm = decode(args.audio)
    dec.set_align_text(" ".join(toks))
    dec.start_utt()
    dec.process_raw(pcm.tobytes(), full_utt=True)
    dec.end_utt()
    segs = [(s.word, s.start_frame / 100, (s.end_frame + 1) / 100) for s in dec.seg()]
    hits = [s for s in segs if not s[0].startswith("<") and not s[0].startswith("[") and s[0] != "<sil>"]
    if len(hits) != len(toks):
        raise SystemExit(f"aligned {len(hits)} of {len(toks)} tokens; check the recording matches the script")

    times = {}
    for (name, s, e), oi in zip(hits, owner):
        a, b = times.get(oi, (s, e))
        times[oi] = (min(a, s), max(b, e))

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    audio = pcm.astype(np.float32) / 32768
    result = []
    for li, line in enumerate(lines):
        idx = [i for i, (l, _) in enumerate(words) if l == li]
        t0, t1 = times[idx[0]][0] - PAD, times[idx[-1]][1] + PAD
        t0 = max(0.0, t0)
        name = f"line_{li:02d}.wav"
        sf.write(out / name, audio[int(t0 * SR): int(t1 * SR)], SR)
        result.append({"file": name, "duration": round(t1 - t0, 3), "words": [
            {"w": words[i][1], "s": round(times[i][0] - t0, 3), "e": round(times[i][1] - t0, 3)} for i in idx]})
        print(f"{line['id']:<11} {t0:6.2f}-{t1:6.2f}s  {len(idx)} words")
    (out / "timings.json").write_text(json.dumps({"sample_rate": SR, "aligner": "pocketsphinx", "lines": result}, indent=1))


if __name__ == "__main__":
    main()
