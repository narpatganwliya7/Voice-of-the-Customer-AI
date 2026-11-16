"""Mix the film's soundtrack: narration on top, music ducked under it, small sound effects on the cuts.

Inputs
  --voice   narration aligned to the film timeline (prepare.py writes public/narration.wav)
  --cues    cue sheet from film/cues.mjs (same timing code as the picture)
  --music   optional music bed (any format ffmpeg reads); looped or trimmed to length
  --sfx     optional folder with whoosh/tick/chime/error/paper audio files (e.g. from ElevenLabs
            Sound Effects); any kind missing is synthesised here
Output
  a 48 kHz stereo WAV mastered to about -14 LUFS integrated, true peak below -1.5 dBTP.

The voice is the priority: music sits roughly 20 dB under it and is pushed further down
whenever someone speaks (sidechain compression), then breathes back up in the gaps.
"""
import argparse
import json
import re
import subprocess
import tempfile
from pathlib import Path

import numpy as np
import soundfile as sf
from scipy import signal

SR = 48000
RNG = np.random.default_rng(7)


def band(x, lo, hi):
    sos = signal.butter(2, [lo, hi], btype="band", fs=SR, output="sos")
    return signal.sosfilt(sos, x)


def synth(kind):
    """Small, soft, synthetic effects. Used only when no recorded effect is supplied."""
    if kind == "whoosh":
        n = int(0.75 * SR)
        noise = RNG.standard_normal(n)
        out = np.zeros(n)
        blocks = 30
        for b in range(blocks):  # a band of noise sweeping upwards, crossfaded block by block
            c = 350 * (9 ** (b / (blocks - 1)))
            y = band(noise, c * 0.6, min(c * 1.7, SR / 2 - 100))
            w = np.exp(-0.5 * ((np.arange(n) / n - b / (blocks - 1)) / 0.07) ** 2)
            out += y * w
        e = np.concatenate([np.linspace(0, 1, int(n * 0.62)) ** 2, (1 - np.linspace(0, 1, n - int(n * 0.62))) ** 2.5])
        return out * e
    if kind == "tick":
        n = int(0.06 * SR)
        t = np.arange(n) / SR
        y = 0.7 * np.sin(2 * np.pi * 1900 * t) + 0.3 * np.sin(2 * np.pi * 3800 * t)
        return y * np.exp(-t * 90) + band(RNG.standard_normal(n), 2500, 9000) * np.exp(-t * 400) * 0.4
    if kind == "chime":
        n = int(1.6 * SR)
        t = np.arange(n) / SR
        out = np.zeros(n)
        for k, (f0, d) in enumerate([(1318.5, 0.0), (1975.5, 0.12)]):  # E6 then B6, a soft rising fifth
            tt = np.clip(t - d, 0, None)
            on = (t >= d).astype(float)
            out += on * (np.sin(2 * np.pi * f0 * tt) + 0.18 * np.sin(2 * np.pi * 2 * f0 * tt) + 0.06 * np.sin(2 * np.pi * 3 * f0 * tt)) \
                * np.exp(-tt * 3.2) * np.minimum(1, tt / 0.004)
        return out
    if kind == "error":
        n = int(0.26 * SR)
        t = np.arange(n) / SR
        out = np.zeros(n)
        for f0, d in [(392.0, 0.0), (293.7, 0.12)]:
            tt = np.clip(t - d, 0, None)
            on = ((t >= d) & (t < d + 0.1)).astype(float)
            out += on * (np.sin(2 * np.pi * f0 * tt) + 0.2 * np.sin(2 * np.pi * 3 * f0 * tt)) * np.exp(-tt * 18)
        return out
    if kind == "paper":
        n = int(0.32 * SR)
        t = np.arange(n) / SR
        return band(RNG.standard_normal(n), 1800, 7000) * np.exp(-t * 14) * np.minimum(1, t / 0.01)
    raise ValueError(kind)


GAIN_DB = {"whoosh": -26, "tick": -30, "chime": -22, "error": -27, "paper": -28}  # peak level of each effect


def load_sfx(folder):
    found = {}
    if folder:
        for p in Path(folder).glob("*"):
            m = re.match(r"(whoosh|tick|chime|error|paper)", p.stem.lower())
            if m and p.suffix.lower() in (".wav", ".mp3", ".flac", ".ogg", ".m4a"):
                found[m.group(1)] = decode(p)
    return found


def decode(path):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", str(path), "-ac", "1", "-ar", str(SR), "-f", "f32le", "-"], capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.float32).astype(float)


def sfx_track(cues, duration, recorded):
    track = np.zeros(int(duration * SR) + SR)
    used = {}
    for c in cues:
        k = c["kind"]
        y = recorded.get(k)
        if y is None:
            y = synth(k)
        used[k] = "recorded" if k in recorded else "synthesised"
        y = y / (np.max(np.abs(y)) + 1e-9) * 10 ** (GAIN_DB[k] / 20)
        i = max(0, int(c["t"] * SR))
        track[i:i + len(y)] += y[: len(track) - i]
    return track[: int(duration * SR)], used


def run(cmd):
    return subprocess.run(cmd, capture_output=True, text=True, check=True)


def lufs(path):
    out = run(["ffmpeg", "-v", "info", "-i", str(path), "-af", "loudnorm=print_format=json", "-f", "null", "-"]).stderr
    return float(json.loads(out[out.rindex("{"): out.rindex("}") + 1])["input_i"])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--voice", required=True)
    ap.add_argument("--cues", required=True)
    ap.add_argument("--music")
    ap.add_argument("--sfx")
    ap.add_argument("--music-under", type=float, default=14.0, help="music loudness below the voice, in LU, before ducking")
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    sheet = json.loads(Path(args.cues).read_text())
    dur = sheet["duration"]
    track, used = sfx_track(sheet["cues"], dur, load_sfx(args.sfx))
    tmp = Path(tempfile.mkdtemp())
    sf.write(tmp / "sfx.wav", np.stack([track, track], 1), SR)

    voice = ("[0:a]aresample=48000,aformat=channel_layouts=stereo,highpass=f=75,"
             "equalizer=f=280:t=q:w=1.1:g=-2,equalizer=f=3600:t=q:w=1.3:g=2.5,equalizer=f=11000:t=h:w=0.7:g=1.5,"
             "acompressor=threshold=-20dB:ratio=3:attack=6:release=140:makeup=2,apad,atrim=0:{d}[v];[v]asplit[vo][vk]")
    parts = [voice.format(d=dur)]
    inputs = ["-i", args.voice, "-i", str(tmp / "sfx.wav")]
    mix = "[vo][fx]"
    n = 2
    parts.append("[1:a]aresample=48000,apad,atrim=0:{d}[fx]".format(d=dur))
    if args.music:
        music_db = lufs(args.voice) - args.music_under - lufs(args.music)
        inputs += ["-stream_loop", "-1", "-i", args.music]
        parts.append(
            f"[2:a]aresample=48000,aformat=channel_layouts=stereo,atrim=0:{dur},highpass=f=40,"
            f"equalizer=f=2500:t=q:w=1.5:g=-3,volume={music_db:.2f}dB,"
            f"volume=eval=frame:volume='1+0.7*min(1,max(0,(t-{dur - 5.5:.2f})/1.5))',"  # lift the music for the end card
            f"afade=t=in:d=0.8,afade=t=out:st={dur - 1.2}:d=1.2[mu];"
            "[mu][vk]sidechaincompress=threshold=0.02:ratio=7:attack=25:release=450:makeup=1[md]")
        mix += "[md]"
        n = 3
    else:
        parts.append("[vk]anullsink")
    parts.append(f"{mix}amix=inputs={n}:normalize=0:duration=first,alimiter=limit=0.89:level=false[pre]")
    graph = ";".join(parts)

    pre = tmp / "pre.wav"
    run(["ffmpeg", "-y", "-v", "error", *inputs, "-filter_complex", graph, "-map", "[pre]", "-ar", str(SR), "-c:a", "pcm_s24le", str(pre)])
    # two-pass loudness normalisation to -14 LUFS (LinkedIn and most platforms normalise near this)
    meas = run(["ffmpeg", "-v", "info", "-i", str(pre), "-af", "loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json", "-f", "null", "-"]).stderr
    m = json.loads(meas[meas.rindex("{"): meas.rindex("}") + 1])
    ln = (f"loudnorm=I=-14:TP=-1.5:LRA=11:measured_I={m['input_i']}:measured_TP={m['input_tp']}:measured_LRA={m['input_lra']}"
          f":measured_thresh={m['input_thresh']}:offset={m['target_offset']}:linear=true")
    run(["ffmpeg", "-y", "-v", "error", "-i", str(pre), "-af", ln, "-ar", str(SR), "-c:a", "pcm_s24le", args.out])
    chk = run(["ffmpeg", "-v", "info", "-i", args.out, "-af", "loudnorm=I=-14:TP=-1.5:print_format=json", "-f", "null", "-"]).stderr
    c = json.loads(chk[chk.rindex("{"): chk.rindex("}") + 1])
    print(json.dumps({"out": args.out, "seconds": round(dur, 2), "lufs": c["input_i"], "true_peak": c["input_tp"],
                      "music": bool(args.music), "effects": used}))


if __name__ == "__main__":
    main()
