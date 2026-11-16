import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig, random, Img, staticFile } from "remotion";
import { C, F, RATING } from "./theme.js";

export const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" };

/* Plain white paper with one soft pool of light. No dot grid, no grain: colour comes from the subject. */
export function Paper({ children }) {
  return (
    <AbsoluteFill style={{ background: `radial-gradient(1400px 1100px at 50% 28%, #FFFFFF 0%, ${C.paper} 60%, #EDEFF3 100%)` }}>
      {children}
    </AbsoluteFill>
  );
}

/* Authored icons: one 24px grid, 2px rounded strokes. */
const STAR = "M12 2.6l2.82 5.92 6.5.83-4.77 4.5 1.21 6.45L12 17.17 6.24 20.3l1.21-6.45-4.77-4.5 6.5-.83z";
export function Star({ size = 24, color = C.r3, style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ display: "inline-block", verticalAlign: "-0.12em", flex: "none", ...style }}>
      <path d={STAR} fill={color} stroke={color} strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}
export function StarsInline({ n, size = 26, color }) {
  const col = color || RATING[n];
  return (
    <span style={{ display: "inline-flex", gap: size * 0.1, lineHeight: 1, whiteSpace: "nowrap", verticalAlign: "middle" }}>
      {[0, 1, 2, 3, 4].map((i) => <Star key={i} size={size} color={i < n ? col : "#DCDFE6"} />)}
    </span>
  );
}
const PATHS = {
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  cross: <path d="M7 7l10 10M17 7L7 17" />,
  db: <><ellipse cx="12" cy="6" rx="7" ry="2.8" /><path d="M5 6v12c0 1.55 3.13 2.8 7 2.8s7-1.25 7-2.8V6M5 12c0 1.55 3.13 2.8 7 2.8s7-1.25 7-2.8" /></>,
  search: <><circle cx="10.5" cy="10.5" r="6" /><path d="M15 15l5 5" /></>,
  bars: <path d="M5 20V11M10 20V5M15 20v-7M20 20V9" />,
  doc: <><path d="M7 3h7l4 4v14H7z" /><path d="M14 3v4h4M10 12h5M10 16h5" /></>,
  spark: <path d="M12 3v5M12 16v5M3 12h5M16 12h5M6.3 6.3l2.8 2.8M14.9 14.9l2.8 2.8M17.7 6.3l-2.8 2.8M9.1 14.9l-2.8 2.8" />,
  alert: <><path d="M12 3.5L21.5 20h-19z" /><path d="M12 10v4.5M12 17.4v.1" /></>,
  bolt: <path d="M13 2.5L5 13.5h6l-1 8 8-11h-6z" />,
};
export function Icon({ name, size = 24, color = "currentColor", stroke = 2, style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round"
      style={{ display: "inline-block", flex: "none", ...style }}>{PATHS[name]}</svg>
  );
}
/** A filled round badge with an icon, e.g. the step check. */
export function Badge({ name, size = 30, bg = C.cobalt, color = "#fff" }) {
  return (
    <span style={{ width: size, height: size, borderRadius: size / 2, background: bg, display: "inline-grid", placeItems: "center", flex: "none" }}>
      <Icon name={name} size={size * 0.62} color={color} stroke={2.6} />
    </span>
  );
}

export function ReviewCard({ r, w = 420, style, dim = 0, big = false }) {
  const fs = big ? w * 0.05 : w * 0.056;
  return (
    <div style={{
      width: w, background: C.card, borderRadius: 16, padding: `${w * 0.045}px ${w * 0.055}px ${w * 0.05}px`,
      boxShadow: "0 1px 2px rgba(20,22,28,.06), 0 14px 30px -14px rgba(28,34,52,.26)",
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
      <div style={{ font: `800 ${size}px/0.98 ${F.display}`, letterSpacing: "-0.03em", color, textWrap: "balance", fontStretch: "92%" }}>{children}</div>
      {sub && <div style={{ font: `500 ${Math.round(size * 0.36)}px/1.3 ${F.body}`, color: C.ink2, marginTop: size * 0.22 }}>{sub}</div>}
    </div>
  );
}

export function Pill({ children, bg = C.card, color = C.ink, border = C.line, size = 24, style }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 10, background: bg, color, border: `1.5px solid ${border}`,
      borderRadius: 999, padding: `${size * 0.36}px ${size * 0.78}px`, font: `600 ${size}px ${F.body}`, whiteSpace: "nowrap",
      ...style }}>{children}</span>
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
      <div lang="fr" style={{ background: "rgba(20,22,28,.92)", borderRadius: 16, padding: `${width * 0.013}px ${width * 0.028}px`,
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
    <div style={{ position: "absolute", left: x, top: y, transform: `translate(-50%, -100%) translateY(${(1 - appear) * 14}px) scale(${0.9 + 0.1 * appear})`, transformOrigin: "50% 100%",
      opacity: appear, ...style }}>
      <div style={{ background: color, borderRadius: 16, padding: "12px 20px", width: w, boxShadow: "0 1px 2px rgba(20,22,28,.06), 0 16px 34px -14px rgba(28,34,52,.36)",
        position: "relative" }}>
        {children}
        <div style={{ position: "absolute", bottom: -9, left: tail === "center" ? "50%" : tail, width: 18, height: 18, background: color,
          transform: "translateX(-50%) rotate(45deg)", borderBottomRightRadius: 4 }} />
      </div>
    </div>
  );
}

export const pseudo = (seed) => random(seed);
