import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig, random, Img, staticFile } from "remotion";
import { C, F, RATING } from "./theme.js";

export const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" };

/* White paper with a faint dot grid, soft colour light from the subject, and film grain. */
export function Paper({ glow = [], children }) {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  return (
    <AbsoluteFill style={{ background: `radial-gradient(1300px 1000px at 50% 30%, #FFFFFF 0%, ${C.paper} 62%, #ECEEF2 100%)` }}>
      <AbsoluteFill style={{
        backgroundImage: "radial-gradient(circle, #D5DAE3 1.3px, transparent 1.7px)", backgroundSize: "30px 30px",
        backgroundPosition: `0px ${(-frame * 0.25) % 30}px`,
        WebkitMaskImage: "radial-gradient(ellipse 75% 65% at 50% 45%, black 20%, transparent 100%)", opacity: 0.85,
      }} />
      {glow.map((g, i) => (
        <div key={i} style={{ position: "absolute", left: g.x * width - g.r, top: g.y * height - g.r, width: g.r * 2, height: g.r * 2,
          borderRadius: "50%", background: g.c, opacity: g.o ?? 0.16, filter: "blur(90px)" }} />
      ))}
      {children}
    </AbsoluteFill>
  );
}

export function Grain() {
  const frame = useCurrentFrame();
  const seed = Math.floor(frame / 2) % 24;
  return (
    <AbsoluteFill style={{ pointerEvents: "none", mixBlendMode: "multiply", opacity: 0.07 }}>
      <svg width="100%" height="100%">
        <filter id={`g${seed}`}><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed={seed} stitchTiles="stitch" /><feColorMatrix type="saturate" values="0" /></filter>
        <rect width="100%" height="100%" filter={`url(#g${seed})`} />
      </svg>
    </AbsoluteFill>
  );
}

export function StarsInline({ n, size = 26, color }) {
  const col = color || RATING[n];
  return (
    <span style={{ fontSize: size, letterSpacing: size * 0.06, lineHeight: 1, whiteSpace: "nowrap" }}>
      <span style={{ color: col }}>{"★".repeat(n)}</span><span style={{ color: "#DADDE4" }}>{"★".repeat(5 - n)}</span>
    </span>
  );
}

export function ReviewCard({ r, w = 420, style, dim = 0, big = false }) {
  const fs = big ? w * 0.05 : w * 0.056;
  return (
    <div style={{
      width: w, background: C.card, borderRadius: w * 0.05, padding: `${w * 0.045}px ${w * 0.055}px ${w * 0.05}px`,
      boxShadow: "0 1px 0 rgba(20,22,28,.05), 0 18px 40px -14px rgba(28,34,52,.28)", border: `1px solid ${C.line}`,
      filter: dim ? `grayscale(${dim}) blur(${dim * 1.2}px)` : undefined, opacity: 1 - dim * 0.5, ...style,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: w * 0.025 }}>
        <StarsInline n={r.r} size={w * 0.058} />
        <span style={{ font: `500 ${w * 0.036}px ${F.body}`, color: C.ink3 }}>{r.src}</span>
      </div>
      <div lang="fr" style={{ font: `500 ${fs}px/1.34 ${F.body}`, color: C.ink, textWrap: "pretty" }}>{r.t}</div>
    </div>
  );
}

export function Headline({ children, sub, size = 92, top = 92, left = 72, appear = 1, color = C.ink, maxWidth = 900 }) {
  const y = (1 - appear) * 40;
  return (
    <div style={{ position: "absolute", left, top, maxWidth, opacity: appear, transform: `translateY(${y}px)` }}>
      <div style={{ font: `800 ${size}px/0.98 ${F.display}`, letterSpacing: "-0.035em", color, textWrap: "balance", fontStretch: "92%" }}>{children}</div>
      {sub && <div style={{ font: `500 ${Math.round(size * 0.36)}px/1.3 ${F.body}`, color: C.ink2, marginTop: size * 0.22 }}>{sub}</div>}
    </div>
  );
}

export function Pill({ children, bg = C.card, color = C.ink, border = C.line, size = 24, style }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 10, background: bg, color, border: `1.5px solid ${border}`,
      borderRadius: 999, padding: `${size * 0.36}px ${size * 0.78}px`, font: `600 ${size}px ${F.body}`, whiteSpace: "nowrap",
      boxShadow: "0 6px 18px -10px rgba(28,34,52,.35)", ...style }}>{children}</span>
  );
}

export function Captions({ captions }) {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const t = frame / fps;
  const cue = captions.find((c) => t >= c.s && t < c.e);
  if (!cue) return null;
  const op = interpolate(frame - cue.s * fps, [0, 4], [0, 1], clamp);
  return (
    <div style={{ position: "absolute", left: 56, right: 56, bottom: height * 0.04, display: "flex", justifyContent: "center", opacity: op }}>
      <div lang="fr" style={{ background: "rgba(20,22,28,.92)", borderRadius: 22, padding: `${width * 0.013}px ${width * 0.028}px`,
        color: "#fff", font: `600 ${Math.round(width * 0.032)}px/1.3 ${F.body}`, textAlign: "center", maxWidth: width * 0.88, textWrap: "balance",
        boxShadow: "0 18px 40px -16px rgba(20,22,28,.55)" }}>{cue.fr}</div>
    </div>
  );
}

export function Avatar({ name, size = 64 }) {
  return <Img src={staticFile(`avatars/${name}.png`)} style={{ width: size, height: size, objectFit: "contain" }} />;
}

/** A soft-shadowed speech bubble pointing down. */
export function Bubble({ children, x, y, appear = 1, w, color = C.card, tail = "center", style }) {
  return (
    <div style={{ position: "absolute", left: x, top: y, transform: `translate(-50%, -100%) scale(${0.6 + 0.4 * appear})`, transformOrigin: "50% 100%",
      opacity: appear, ...style }}>
      <div style={{ background: color, borderRadius: 22, padding: "12px 20px", width: w, boxShadow: "0 16px 36px -14px rgba(28,34,52,.4)",
        border: `1px solid ${C.line}`, position: "relative" }}>
        {children}
        <div style={{ position: "absolute", bottom: -9, left: tail === "center" ? "50%" : tail, width: 18, height: 18, background: color,
          transform: "translateX(-50%) rotate(45deg)", borderRight: `1px solid ${C.line}`, borderBottom: `1px solid ${C.line}` }} />
      </div>
    </div>
  );
}

export const pseudo = (seed) => random(seed);
