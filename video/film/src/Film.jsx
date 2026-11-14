import React from "react";
import { AbsoluteFill, Audio, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig, Easing } from "remotion";
import { C, F, loadFonts } from "./theme.js";
import { Heads, Orb } from "./Three.jsx";
import data from "./data.json";

loadFonts();
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" };
const ease = Easing.bezier(0.2, 0.8, 0.2, 1);
const Stars = ({ n }) => <span style={{ letterSpacing: 2 }}><span style={{ color: C.amber }}>{"★".repeat(n)}</span><span style={{ color: "#3a4468" }}>{"★".repeat(5 - n)}</span></span>;
const sceneOf = (id) => data.scenes.find((s) => s.id === id);

/* ---------- shared layers ---------- */
function TrendLayer() {
  // real weekly rating of the recovery brand, drawn progressively over the whole film
  const frame = useCurrentFrame();
  const { width, height, durationInFrames } = useVideoConfig();
  const raw = data.trend.points || [];
  const pts = raw.map((p, i) => { const w = raw.slice(Math.max(0, i - 2), i + 1); return { r: w.reduce((a, b) => a + b.r, 0) / w.length }; });
  if (!pts || pts.length < 3) return null;
  const resolve = sceneOf("resolve");
  const cta = sceneOf("cta");
  const layerOp = interpolate(frame, [cta.start, cta.start + 15], [1, 0.45], clamp);
  const labelOp = interpolate(frame, [resolve.start + 10, resolve.start + 30, cta.start, cta.start + 10], [0, 0.9, 0.9, 0], clamp);
  const reveal = interpolate(frame, [0, resolve.start, resolve.start + resolve.frames * 0.8], [0.35, 0.62, 1], clamp);
  const lo = Math.min(...pts.map((p) => p.r)) - 0.15, hi = Math.max(...pts.map((p) => p.r)) + 0.1;
  const x = (i) => (i / (pts.length - 1)) * width;
  const y = (r) => height * 0.88 - ((r - lo) / (hi - lo)) * height * 0.42;
  const n = Math.max(2, Math.round(pts.length * reveal));
  const d = pts.slice(0, n).map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.r).toFixed(1)}`).join(" ");
  const area = d + ` L${x(n - 1)},${height} L0,${height} Z`;
  const glow = frame > resolve.start ? interpolate(frame, [resolve.start, resolve.start + 30], [0.08, 0.2], clamp) : 0.08;
  return (
    <svg width={width} height={height} style={{ position: "absolute", inset: 0, opacity: layerOp }}>
      <defs><linearGradient id="tg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor={C.green} stopOpacity={glow} /><stop offset="1" stopColor={C.green} stopOpacity="0" /></linearGradient></defs>
      <path d={area} fill="url(#tg)" />
      <path d={d} fill="none" stroke={C.green} strokeOpacity={glow * 2.2} strokeWidth={4} strokeLinejoin="round" />
      {frame > resolve.start + 10 && (
        <text x={width - 40} y={height * 0.045} textAnchor="end" fill={C.green} fillOpacity={labelOp}
          style={{ font: `500 ${width * 0.022}px ${F.mono}` }}>{data.trend.label}</text>
      )}
    </svg>
  );
}

function Captions() {
  // French subtitles, phrase by phrase, timed on the English narration
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const t = frame / fps;
  const cue = data.captions.find((c) => t >= c.s && t < c.e);
  if (!cue) return null;
  const local = frame - cue.s * fps;
  const op = interpolate(local, [0, 5], [0, 1], clamp);
  return (
    <div style={{ position: "absolute", left: "6%", right: "6%", bottom: height * 0.045, display: "flex", justifyContent: "center", opacity: op }}>
      <div lang="fr" style={{ background: "rgba(6,9,18,.78)", border: `1px solid ${C.line}`, borderRadius: 18, padding: `${width * 0.012}px ${width * 0.024}px`,
        color: C.text, font: `600 ${Math.round(width * 0.034)}px/1.28 ${F.body}`, textAlign: "center", maxWidth: width * 0.86, textWrap: "balance" }}>
        {cue.fr}
      </div>
    </div>
  );
}

function Kicker({ children, color = C.amber, style }) {
  const { width } = useVideoConfig();
  return <div style={{ font: `500 ${width * 0.022}px ${F.mono}`, letterSpacing: "0.14em", textTransform: "uppercase", color, ...style }}>{children}</div>;
}

function ReviewCard({ r, style, w }) {
  const col = r.r <= 2 ? C.red : r.r >= 4 ? C.green : C.violet;
  return (
    <div style={{ width: w, background: "rgba(17,23,41,.94)", border: `1px solid ${C.line}`, borderLeft: `5px solid ${col}`, borderRadius: 16,
      padding: `${w * 0.045}px ${w * 0.055}px`, color: C.text, boxShadow: "0 20px 60px rgba(0,0,0,.45)", ...style }}>
      <div style={{ display: "flex", justifyContent: "space-between", font: `500 ${w * 0.042}px ${F.mono}`, color: C.muted, marginBottom: w * 0.02 }}>
        <Stars n={r.r} /><span>{r.src}</span>
      </div>
      <div lang="fr" style={{ font: `500 ${w * 0.058}px/1.32 ${F.body}` }}>{r.t}</div>
    </div>
  );
}

/* ---------- scenes ---------- */
function Hook({ s }) {
  const frame = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();
  const pool = data.reviews_angry.concat(data.reviews_happy);
  const cards = Array.from({ length: Math.ceil((s.frames + 62) / 4.2) }, (_, i) => pool[i % pool.length]);
  const total = data.stats.reviews;
  const count = Math.round(interpolate(frame, [0, s.frames * 0.75], [total * 0.42, total], { ...clamp, easing: Easing.out(Easing.cubic) }));
  const badge = (label, side) => (
    <div style={{ position: "absolute", top: height * 0.47, [side]: width * 0.03, transform: "translateY(-50%)", padding: `${width * 0.012}px ${width * 0.022}px`, borderRadius: 999,
      border: `2px solid ${C.amber}`, color: C.amber, font: `600 ${width * 0.026}px ${F.mono}`, background: "rgba(10,14,26,.85)",
      boxShadow: `0 0 ${30 + 20 * Math.sin(frame / 6)}px rgba(255,181,71,.35)` }}>{label}</div>
  );
  return (
    <AbsoluteFill style={{ perspective: 1100, overflow: "hidden" }}>
      {cards.map((r, i) => {
        const t = (frame + 62 - i * 4.2) / (fps * 2.6);
        if (t < 0 || t > 1) return null;
        const fromLeft = i % 2 === 0;
        const lane = ((i * 37) % 9) / 8 - 0.5;
        const x = interpolate(t, [0, 1], [fromLeft ? -width * 0.42 : width * 0.42, (fromLeft ? -1 : 1) * width * 0.12 + lane * width * 0.5]);
        const y = interpolate(t, [0, 1], [0, lane * height * 0.55]);
        const z = interpolate(t, [0, 1], [-1400, 650], { easing: Easing.in(Easing.quad) });
        const op = interpolate(t, [0, 0.12, 0.82, 1], [0, 1, 1, 0]);
        return (
          <div key={i} style={{ position: "absolute", left: "50%", top: "47%", transform: `translate(-50%,-50%) translate3d(${x}px,${y}px,${z}px) rotateY(${fromLeft ? 14 : -14}deg)`, opacity: op }}>
            <ReviewCard r={r} w={width * 0.46} />
          </div>
        );
      })}
      {badge("Google Play", "left")}
      {badge("App Store", "right")}
      <div style={{ position: "absolute", top: height * 0.075, width: "100%", textAlign: "center" }}>
        <div style={{ font: `850 ${width * 0.165}px/0.9 ${F.display}`, fontStretch: "112%", letterSpacing: "-0.03em", color: C.text, fontVariantNumeric: "tabular-nums",
          textShadow: "0 10px 50px rgba(0,0,0,.7)" }}>{count.toLocaleString("en-GB")}</div>
        <Kicker style={{ marginTop: width * 0.015 }}>real customer reviews · {data.stats.brands} French brands</Kicker>
      </div>
    </AbsoluteFill>
  );
}

function Problem({ s }) {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const bubbles = data.reviews_angry.slice(0, 4);
  const sectors = ["Banks", "Telecom", "Retail", "Transport", "Energy", "Delivery"];
  return (
    <AbsoluteFill>
      <div style={{ position: "absolute", inset: 0, top: height * 0.12 }}>
        <Heads mood={0} width={width} height={height * 0.62} />
      </div>
      <div style={{ position: "absolute", top: height * 0.07, width: "100%", display: "flex", justifyContent: "center", gap: width * 0.015, flexWrap: "wrap", padding: "0 6%" }}>
        {sectors.map((x, i) => {
          const a = spring({ frame: frame - i * 4, fps: 30, config: { damping: 14 } });
          return <span key={x} style={{ opacity: a, transform: `translateY(${(1 - a) * 30}px)`, border: `2px solid ${C.line}`, borderRadius: 999, padding: `${width * 0.008}px ${width * 0.022}px`,
            color: C.text, font: `500 ${width * 0.03}px ${F.body}`, background: C.panel }}>{x}</span>;
        })}
      </div>
      {bubbles.map((r, i) => {
        const a = spring({ frame: frame - 12 - i * 9, fps: 30, config: { damping: 15 } });
        const pos = [[0.04, 0.58], [0.52, 0.62], [0.08, 0.27], [0.5, 0.25]][i];
        return <div key={i} style={{ position: "absolute", left: width * pos[0], top: height * pos[1], opacity: a, transform: `scale(${0.8 + 0.2 * a}) translateY(${Math.sin(frame / 18 + i) * 8}px)` }}>
          <ReviewCard r={r} w={width * 0.44} />
        </div>;
      })}
    </AbsoluteFill>
  );
}

function Agent({ s }) {
  const frame = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();
  const level = data.levels[s.start + frame] || 0;
  const appear = spring({ frame, fps, config: { damping: 18 } });
  const cards = data.reviews_angry.slice(0, 10);
  return (
    <AbsoluteFill>
      {cards.map((r, i) => {
        const t = interpolate(frame, [i * 3, i * 3 + 30], [0, 1], { ...clamp, easing: Easing.in(Easing.cubic) });
        const ang = i * 0.9 + t * 2.2;
        const rad = (1 - t) * width * 0.48;
        return <div key={i} style={{ position: "absolute", left: "50%", top: "44%", opacity: 1 - t, transform: `translate(-50%,-50%) translate(${Math.cos(ang) * rad}px,${Math.sin(ang) * rad * 1.2}px) scale(${1 - t * 0.85})` }}>
          <ReviewCard r={r} w={width * 0.34} />
        </div>;
      })}
      <div style={{ position: "absolute", left: 0, right: 0, top: height * 0.1, height: height * 0.68, transform: `scale(${appear})` }}>
        <Orb level={level} width={width} height={height * 0.68} />
      </div>
      <div style={{ position: "absolute", top: height * 0.73, width: "100%", textAlign: "center", opacity: interpolate(frame, [52, 70], [0, 1], clamp) }}>
        <div style={{ font: `850 ${width * 0.15}px/1 ${F.display}`, fontStretch: "125%", color: C.text, letterSpacing: "-0.03em" }}>écoute<span style={{ color: C.amber }}>.</span></div>
        <Kicker style={{ marginTop: 10 }}>AI agent · Voice of the Customer</Kicker>
      </div>
    </AbsoluteFill>
  );
}

function Pipeline({ s }) {
  const frame = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();
  const steps = data.pipeline;
  const per = s.frames / (steps.length + 0.6);
  const topics = data.topics;
  return (
    <AbsoluteFill style={{ padding: `${height * 0.08}px ${width * 0.07}px` }}>
      <Kicker>How Écoute listens</Kicker>
      <div style={{ display: "grid", gap: height * 0.018, marginTop: height * 0.025 }}>
        {steps.map((st, i) => {
          const a = spring({ frame: frame - i * per, fps, config: { damping: 16 } });
          const active = frame >= i * per && frame < (i + 1) * per + 10;
          return (
            <div key={st.h} style={{ opacity: a, transform: `translateX(${(1 - a) * -80}px)`, display: "grid", gridTemplateColumns: `${width * 0.09}px 1fr`, gap: width * 0.025,
              background: active ? C.panel2 : C.panel, border: `2px solid ${active ? C.amber : C.line}`, borderRadius: 22, padding: `${height * 0.018}px ${width * 0.03}px` }}>
              <div style={{ font: `500 ${width * 0.032}px ${F.mono}`, color: C.amber, paddingTop: 8 }}>{st.n}</div>
              <div>
                <div style={{ font: `750 ${width * 0.054}px/1.05 ${F.display}`, fontStretch: "112%", color: C.text }}>{st.h}</div>
                <div style={{ font: `400 ${width * 0.028}px/1.3 ${F.body}`, color: C.muted, marginTop: 4 }}>{st.p}</div>
                <div style={{ font: `500 ${width * 0.029}px ${F.mono}`, color: C.text, marginTop: 8 }}>{st.fig}</div>
                {st.n === "02" && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
                    {topics.map((t, j) => {
                      const on = frame > per * 1 + 6 + j * 2.5;
                      return <span key={t} style={{ border: `1.5px solid ${on ? C.red : C.line}`, color: on ? C.text : C.muted, background: on ? "rgba(255,97,102,.14)" : "transparent",
                        borderRadius: 999, padding: `2px ${width * 0.011}px`, font: `500 ${width * 0.019}px ${F.body}` }}>{t}</span>;
                    })}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
}

function Insight({ s }) {
  const frame = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();
  const I = data.insight;
  const max = Math.max(...I.drivers.map((d) => d.stars_lost));
  const sliderT = interpolate(frame, [s.frames * 0.45, s.frames * 0.85], [0, 1], { ...clamp, easing: ease });
  const pct = Math.round(sliderT * I.pct);
  const rating = I.avg + I.drivers[0].stars_lost * pct / 100;
  return (
    <AbsoluteFill style={{ padding: `${height * 0.08}px ${width * 0.07}px` }}>
      <Kicker>{I.brand} · stars lost per topic · last 60 days</Kicker>
      <div style={{ display: "grid", gap: height * 0.02, marginTop: height * 0.035 }}>
        {I.drivers.map((d, i) => {
          const g = interpolate(frame, [8 + i * 7, 30 + i * 7], [0, 1], { ...clamp, easing: ease });
          const top = i === 0;
          return (
            <div key={d.label}>
              <div style={{ display: "flex", justifyContent: "space-between", font: `${top ? 600 : 500} ${width * 0.036}px ${F.body}`, color: top ? C.text : C.muted }}>
                <span>{d.label}</span><span style={{ fontFamily: F.mono, color: C.red }}>−{(d.stars_lost * g).toFixed(2)}★</span>
              </div>
              <div style={{ height: height * 0.022, background: C.panel2, borderRadius: 6, marginTop: 8, overflow: "hidden" }}>
                <div style={{ width: `${(100 * d.stars_lost * g) / max}%`, height: "100%", background: top ? C.red : "rgba(255,97,102,.55)", borderRadius: 6 }} />
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ marginTop: height * 0.05, background: C.panel, border: `2px solid ${C.line}`, borderRadius: 24, padding: `${height * 0.025}px ${width * 0.045}px`,
        opacity: interpolate(frame, [s.frames * 0.35, s.frames * 0.45], [0, 1], clamp) }}>
        <div style={{ font: `500 ${width * 0.03}px ${F.body}`, color: C.muted }}>If the team fixes <b style={{ color: C.text }}>{pct}%</b> of {I.topic_en.toLowerCase()} complaints</div>
        <div style={{ height: 10, background: C.panel2, borderRadius: 5, margin: `${height * 0.02}px 0`, position: "relative" }}>
          <div style={{ width: `${pct}%`, height: "100%", background: C.amber, borderRadius: 5 }} />
          <div style={{ position: "absolute", left: `${pct}%`, top: "50%", width: 34, height: 34, borderRadius: "50%", background: C.amber, transform: "translate(-50%,-50%)", boxShadow: "0 0 20px rgba(255,181,71,.6)" }} />
        </div>
        <div style={{ font: `850 ${width * 0.088}px/1 ${F.display}`, fontStretch: "105%", color: C.text, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
          {I.avg.toFixed(2)}★ <span style={{ color: C.muted }}>→</span> <span style={{ color: C.green }}>{rating.toFixed(2)}★</span>
        </div>
      </div>
    </AbsoluteFill>
  );
}

function Investigate({ s }) {
  const frame = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();
  const A = data.agent;
  const steps = A.steps.slice(0, 3);
  const per = (s.frames * 0.5) / steps.length;
  const briefIn = spring({ frame: frame - s.frames * 0.5, fps, config: { damping: 16 } });
  return (
    <AbsoluteFill style={{ padding: `${height * 0.07}px ${width * 0.06}px` }}>
      <Kicker>Écoute Analyst · investigation log</Kicker>
      <div style={{ marginTop: height * 0.02, background: "#06090f", border: `2px solid ${C.line}`, borderRadius: 22, padding: `${height * 0.02}px ${width * 0.035}px`,
        font: `400 ${width * 0.025}px/1.45 ${F.mono}`, color: C.muted, minHeight: height * 0.3 }}>
        <div style={{ color: C.text }}>$ ecoute agent --case {A.case}</div>
        {steps.map((st, i) => {
          const local = frame - i * per;
          if (local < 0) return null;
          const chars = Math.floor(local * 2.2);
          return <div key={i} style={{ marginTop: 12 }}>
            <span style={{ color: C.amber }}>→ {st.tool}</span>{" "}
            <span style={{ color: "#a9b8ff" }}>{st.arg.slice(0, Math.min(chars, 74))}{st.arg.length > 74 && chars > 74 ? "…" : ""}</span>
            {local > 18 && <div style={{ color: C.green, opacity: 0.85 }}>✓ {st.res.length > 64 ? st.res.slice(0, 63) + "…" : st.res}</div>}
          </div>;
        })}
      </div>
      <div style={{ marginTop: height * 0.022, opacity: briefIn, transform: `translateY(${(1 - briefIn) * 60}px)`, background: C.panel, border: `2px solid ${C.amber}`, borderRadius: 24,
        padding: `${height * 0.022}px ${width * 0.04}px` }}>
        <Kicker color={C.muted}>Brief filed · confidence {A.confidence}</Kicker>
        <div style={{ font: `700 ${width * 0.036}px/1.2 ${F.display}`, fontStretch: "104%", color: C.text, margin: "10px 0 12px", textWrap: "balance" }}>{A.headline}</div>
        {A.actions.slice(0, 1).map((a, i) => (
          <div key={i} style={{ display: "flex", gap: 14, font: `500 ${width * 0.029}px/1.35 ${F.body}`, color: C.text, marginTop: 8 }}>
            <span style={{ color: C.amber, fontFamily: F.mono, whiteSpace: "nowrap" }}>→ {a.team}</span><span>{a.action.length > 90 ? a.action.slice(0, 89).replace(/\s\S*$/, "") + "…" : a.action}</span>
          </div>
        ))}
        <div style={{ font: `500 ${width * 0.024}px ${F.mono}`, color: C.green, marginTop: 14 }}>✓ every cited review was read by the agent</div>
      </div>
    </AbsoluteFill>
  );
}

function Resolve({ s }) {
  const frame = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();
  const mood = interpolate(frame, [0, s.frames * 0.55], [0, 1], { ...clamp, easing: ease });
  return (
    <AbsoluteFill>
      <div style={{ position: "absolute", inset: 0, top: height * 0.06 }}>
        <Heads mood={mood} width={width} height={height * 0.55} />
      </div>
      {data.reviews_happy.slice(0, 3).map((r, i) => {
        const a = spring({ frame: frame - s.frames * 0.3 - i * 8, fps, config: { damping: 15 } });
        return <div key={i} style={{ position: "absolute", left: width * (0.07 + (i % 2) * 0.43), top: height * (0.5 + i * 0.1), opacity: a, transform: `translateY(${(1 - a) * 80}px)` }}>
          <ReviewCard r={r} w={width * 0.46} />
        </div>;
      })}
    </AbsoluteFill>
  );
}

function CTA({ s }) {
  const frame = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();
  const letters = "écoute".split("");
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", textAlign: "center" }}>
      <div style={{ display: "flex", font: `880 ${width * 0.17}px/0.9 ${F.display}`, letterSpacing: "-0.035em", color: C.text }}>
        {letters.map((l, i) => {
          const w = interpolate(spring({ frame: frame - i * 3, fps, config: { damping: 11 } }), [0, 1], [50, 125]);
          return <span key={i} style={{ fontVariationSettings: `"wdth" ${w}` }}>{l}</span>;
        })}
        <span style={{ color: C.amber }}>.</span>
      </div>
      <div style={{ font: `500 ${width * 0.05}px/1.2 ${F.display}`, fontStretch: "112%", color: C.text, marginTop: height * 0.02, opacity: interpolate(frame, [12, 28], [0, 1], clamp) }}>
        Every review, heard.
      </div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center", marginTop: height * 0.04, opacity: interpolate(frame, [22, 40], [0, 1], clamp), maxWidth: width * 0.86 }}>
        {["Python", "SQL · DuckDB", "Machine learning", "AI agents", "GitHub Actions"].map((t) => (
          <span key={t} style={{ border: `2px solid ${C.line}`, borderRadius: 999, padding: `6px ${width * 0.02}px`, font: `500 ${width * 0.026}px ${F.mono}`, color: C.muted }}>{t}</span>
        ))}
      </div>
      <div style={{ font: `500 ${width * 0.032}px ${F.body}`, color: C.text, marginTop: height * 0.045, opacity: interpolate(frame, [30, 48], [0, 1], clamp) }}>
        Built by <b>Narpat Ganwliya</b>
      </div>
      <div style={{ font: `400 ${width * 0.024}px ${F.mono}`, color: C.amber, marginTop: 10, opacity: interpolate(frame, [36, 54], [0, 1], clamp) }}>
        github.com/narpatganwliya7/Voice-of-the-Customer-AI
      </div>
    </AbsoluteFill>
  );
}

const SCENES = { hook: Hook, problem: Problem, agent: Agent, how: Pipeline, insight: Insight, investigate: Investigate, resolve: Resolve, cta: CTA };

export function Film({ captions = true }) {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: `radial-gradient(ellipse at 50% 35%, #131a33 0%, ${C.ink} 65%)`, fontFamily: F.body }}>
      <TrendLayer />
      {data.scenes.map((s) => {
        const Comp = SCENES[s.id];
        const fade = 8;
        return (
          <Sequence key={s.id} from={s.start} durationInFrames={s.frames} name={s.id}>
            <AbsoluteFill style={{ opacity: interpolate(frame - s.start, [0, fade, s.frames - fade, s.frames], [s.start === 0 ? 1 : 0, 1, 1, s.id === "cta" ? 1 : 0], clamp) }}>
              <Comp s={s} />
            </AbsoluteFill>
          </Sequence>
        );
      })}
      {captions && <Captions />}
    </AbsoluteFill>
  );
}
