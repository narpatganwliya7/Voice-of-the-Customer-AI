/* Shared timing, so the picture and the sound-effect track agree on every beat.
   Pure functions of data.json; no React. Frames are local to their scene. */

export const wordAt = (s, rx, fallback) => {
  const w = (s.words || []).find((x) => rx.test(x.w));
  return w ? w.f : fallback;
};

/** The agent scene: when each logged tool call starts, and when the reviews are read. */
export function agentTimes(s) {
  const inv = wordAt(s, /investigat/i, Math.round(s.frames * 0.38)) - 10;
  const t1 = inv + 16;
  const t2 = t1 + 38;
  const t3 = Math.max(t2 + 34, wordAt(s, /^reads/i, t2 + 34) - 8);
  const evOut = t3 + 20;            // the reviews come out of the "reviews read" line
  const evIn = Math.max(evOut + 64, wordAt(s, /^finds/i, 0) + 10); // held long enough to read
  const t4 = evIn - 6;
  const t5 = t4 + 24;
  const t6 = Math.max(t5 + 24, wordAt(s, /^app$/i, 0) - 4);
  return { inv, steps: [t1, t2, t3, t4, t5, t6], evOut, evIn };
}

/** The brief scene: brief header, typed headline, then four tickets keyed to the narration. */
export function briefTimes(s) {
  const lc = wordAt(s, /E\.Leclerc/i, Math.round(s.frames * 0.23));
  const dv = wordAt(s, /Deliveroo/i, Math.round(s.frames * 0.7));
  const test = wordAt(s, /^test$/i, lc + 70);
  return { doc: 4, type: 14, tickets: [lc - 4, test - 6, dv - 6, dv + 16] };
}

/** Sound cues in seconds on the film's timeline: scene changes, agent steps, the finding, assigned tickets. */
export function cues(data) {
  const fps = data.fps;
  const out = [];
  data.scenes.forEach((s, i) => {
    const at = (f) => (s.start + f) / fps;
    if (i > 0) out.push({ t: at(0) - 0.12, kind: "whoosh" });
    if (s.id === "agent") {
      const T = agentTimes(s);
      T.steps.slice(0, 5).forEach((f, k) => out.push({ t: at(f), kind: k === 1 ? "tick" : "tick" }));
      out.push({ t: at(T.steps[1] + 22), kind: "error" });
      out.push({ t: at(T.evOut), kind: "paper" });
      out.push({ t: at(T.steps[5]), kind: "chime" });
    }
    if (s.id === "brief") briefTimes(s).tickets.forEach((f) => out.push({ t: at(f + 20), kind: "tick" }));
    if (s.id === "cta") out.push({ t: at(4), kind: "chime" });
  });
  return out;
}
