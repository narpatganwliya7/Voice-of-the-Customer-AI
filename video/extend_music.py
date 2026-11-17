"""Lengthen a music bed to the film's length without touching its intro or its ending.

Finds the beat grid, then jumps back a whole number of bars (8 at most per jump, repeated if
needed) at the point where the music before and after the jump is most alike (chroma + MFCC),
refines the jump to the sample by waveform correlation, and crossfades over one beat.
The original intro and ending stay where they are.
"""
import argparse

import librosa
import numpy as np
import soundfile as sf


def extend_once(y, sr, need, max_bars=8):
    """One jump back of whole bars (at most max_bars), at the most self-similar point."""
    mono = y.mean(0)
    hop = 256
    _, beats = librosa.beat.beat_track(y=mono, sr=sr, hop_length=hop)
    bt = librosa.frames_to_time(beats, sr=sr, hop_length=hop)
    period = float(np.median(np.diff(bt)))
    nb = min(int(np.ceil(need / period / 4)) * 4, max_bars * 4)
    chroma = librosa.feature.chroma_cqt(y=mono, sr=sr, hop_length=hop)
    mfcc = librosa.feature.mfcc(y=mono, sr=sr, hop_length=hop, n_mfcc=20)
    feat = np.vstack([chroma / (np.linalg.norm(chroma, axis=0) + 1e-9), mfcc / (np.linalg.norm(mfcc, axis=0) + 1e-9)])
    fr = lambda t: int(t * sr / hop)
    win = lambda t: feat[:, fr(t - 4 * period / 2): fr(t + 4 * period / 2)]
    dur = len(mono) / sr
    cands = []
    for i in range(nb, len(bt)):
        a, b = bt[i], bt[i - nb]
        if not (0.35 * dur < a < 0.85 * dur) or b < 4 * period:  # keep the intro and the ending intact
            continue
        wa, wb = win(a), win(b)
        n = min(wa.shape[1], wb.shape[1])
        cands.append((float(np.mean(np.sum(wa[:, :n] * wb[:, :n], 0)) / 2), a, b))
    sim, a, b = max(cands)
    d0 = a - b
    seg = mono[int((a - 0.5) * sr): int((a + 0.5) * sr)]
    lags = np.arange(int((d0 - 0.03) * sr), int((d0 + 0.03) * sr), 4)
    cc = [np.dot(seg, mono[int((a - 0.5) * sr) - l: int((a + 0.5) * sr) - l]) for l in lags]
    d = int(lags[int(np.argmax(cc))])
    ai, ln = int(a * sr), int(period * sr)
    t = np.linspace(0, np.pi / 2, ln)
    out = np.concatenate([y[:, :ai], y[:, ai:ai + ln] * np.cos(t) + y[:, ai - d:ai - d + ln] * np.sin(t), y[:, ai - d + ln:]], axis=1)
    print(f"tempo {60 / period:.1f} bpm, jump {nb} beats back at {a:.2f}s (similarity {sim:.3f}), now {out.shape[1] / sr:.2f}s")
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("music")
    ap.add_argument("--seconds", type=float, required=True, help="length needed (the film's duration)")
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    y, sr = librosa.load(args.music, sr=44100, mono=False)
    y = np.atleast_2d(y)
    while (need := args.seconds + 0.4 - y.shape[1] / sr) > 0:
        y = extend_once(y, sr, need)
    sf.write(args.out, y.T, sr, subtype="PCM_24")


if __name__ == "__main__":
    main()
