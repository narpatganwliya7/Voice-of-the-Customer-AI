import React from "react";
import { AbsoluteFill, Sequence, Img, staticFile, interpolate, spring, useCurrentFrame, useVideoConfig, Easing } from "remotion";
import { C, F, RATING, EASE, loadFonts, mix } from "./theme.js";
import { Paper, Captions, ReviewCard, Headline, Pill, StarsInline, Star, Icon, Badge, Bubble, Avatar, clamp } from "./ui.jsx";
import { Stage, Person, CROWD, Mark, Columns, StarRow, ReviewStream, projector } from "./Clay.jsx";
import { wordAt, agentTimes, briefTimes } from "./timeline.js";
import data from "./data.json";

loadFonts();
const ease = Easing.bezier(...EASE.out);
const IO = Easing.bezier(...EASE.inOut);
const ramp = (f, a, b, e = ease) => interpolate(f, [a, b], [0, 1], { ...clamp, easing: e });
const sp = (f, fps, d = 16, m = 0.9) => spring({ frame: f, fps, config: { damping: d, mass: m } });
const TOPICS = ["App reliability", "Login & access", "Device compatibility", "Speed & performance", "Ease of use & design",
  "Features", "Payments & billing", "Price & fees", "Customer service", "Account management", "Orders & delivery",
  "Core service quality", "Trust & security", "Notifications & ads", "Loyalty & rewards"];
/* Soft pools of colour from the subject. A radial gradient instead of a blur filter: same look, a fraction of the render cost. */
const Glow = ({ items }) => items.map((g, i) => (
  <div key={i} style={{ position: "absolute", left: g.x - g.r * 1.6, top: g.y - g.r * 1.6, width: g.r * 3.2, height: g.r * 3.2, borderRadius: "50%",
    background: `radial-gradient(circle, ${g.c} 0%, ${g.c}00 62%)`, opacity: (g.o ?? 0.14) * 0.9 }} />
));

/* 1 ─ Hook: a wall of real reviews, angry customers, a counter */
function Hook({ s }) {
  const f = useCurrentFrame();
  const { width: W, height: H, fps } = useVideoConfig();
  const wall = data.wall;
  const dim = interpolate(f, [s.frames * 0.52, s.frames * 0.82], [0, 0.9], { ...clamp, easing: ease });
  const count = Math.round(interpolate(f, [0, 50], [data.stats.reviews * 0.62, data.stats.reviews], { ...clamp, easing: Easing.out(Easing.cubic) }));
  const stageTop = 640, stageH = 600;
  const cam = { position: [0, 2.2, 10.2], fov: 30, look: [0, 1.55, 0] };
  const proj = projector(cam, W, stageH);
  const crowd = [CROWD[0], CROWD[1], CROWD[2], CROWD[3], CROWD[4], CROWD[5], CROWD[6]];
  const popAt = (i) => sp(f + 40 - [0, 3, 1, 5, 2, 7, 4][i] * 3, fps, 14, 0.8);
  return (
    <AbsoluteFill>
      <Glow items={[{ x: W * 0.5, y: H * 0.86, r: 420, c: C.r1, o: 0.13 }, { x: W * 0.1, y: H * 0.2, r: 300, c: C.r2, o: 0.08 }]} />
      <AbsoluteFill style={{ WebkitMaskImage: "linear-gradient(to bottom, transparent 18%, black 42%, black 80%, transparent 96%)" }}>
        <div style={{ position: "absolute", left: W / 2, top: H * 0.6, display: "flex", gap: 26,
          transform: "translate(-50%, -50%) perspective(1800px) rotateX(34deg) rotateZ(-13deg) scale(1.22)", transformStyle: "preserve-3d" }}>
          {[0, 1, 2].map((c) => {
            const speed = [2.1, 2.9, 2.4][c];
            const items = Array.from({ length: 16 }, (_, i) => wall[(c * 13 + i * 3) % wall.length]);
            return (
              <div key={c} style={{ display: "flex", flexDirection: "column", gap: 24, transform: `translateY(${-300 - (f + 30) * speed}px)` }}>
                {items.map((r, i) => <ReviewCard key={i} r={r} w={390} />)}
              </div>
            );
          })}
        </div>
      </AbsoluteFill>
      <AbsoluteFill style={{ background: C.paper, opacity: dim * 0.62 }} />
      <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: 560, background: `linear-gradient(${C.paper} 55%, rgba(245,246,248,0))` }} />
      <div style={{ position: "absolute", left: 72, top: 70 }}>
        <div style={{ font: `800 176px/0.88 ${F.display}`, letterSpacing: "-0.04em", color: C.ink, fontVariantNumeric: "tabular-nums" }}>{count.toLocaleString("en-US")}</div>
        <div style={{ font: `500 38px/1.25 ${F.body}`, color: C.ink2, marginTop: 18 }}>customer reviews of {data.stats.brands} French brands</div>
        <div style={{ display: "flex", gap: 14, marginTop: 24 }}>
          <Pill size={26}>Google Play</Pill><Pill size={26}>App Store</Pill>
          <Pill size={26} bg={mix(C.r1, "#ffffff", 0.88)} color={C.r1} border={mix(C.r1, "#ffffff", 0.6)} style={{ opacity: interpolate(f, [s.frames * 0.55, s.frames * 0.7], [0, 1], clamp) }}>Mostly unread</Pill>
        </div>
      </div>
      <div style={{ position: "absolute", left: 0, top: stageTop }}>
        <Stage width={W} height={stageH} cam={cam} shadow={0.18}>
          {crowd.map((p, i) => <Person key={i} {...p} mood={0.04 + (i % 3) * 0.05} pop={popAt(i)} />)}
        </Stage>
        {crowd.map((p, i) => {
          const [x, y] = proj(p.x, 3.55 * p.s, p.z);
          const a = sp(f + 4 - i * 3, fps, 14);
          return i % 2 === 0 || i === 3 ? (
            <Bubble key={i} x={x} y={y} appear={a}><StarsInline n={1} size={30} /></Bubble>
          ) : null;
        })}
      </div>
    </AbsoluteFill>
  );
}

/* 2 ─ Intro: "I designed an AI agent: Écoute" */
function Intro({ s }) {
  const f = useCurrentFrame();
  const { width: W, height: H, fps } = useVideoConfig();
  const appear = interpolate(f, [0, 26], [0, 1], { ...clamp, easing: ease });
  const word = sp(f - 8, fps, 15);
  const credit = sp(f - 16, fps, 18);
  const cam = { position: [0, 2.1, 9.5], fov: 30, look: [0, 1.7, 0] };
  return (
    <AbsoluteFill>
      <Glow items={[{ x: W * 0.5, y: H * 0.32, r: 380, c: C.cobalt, o: 0.1 }, { x: W * 0.2, y: H * 0.5, r: 260, c: C.r1, o: 0.08 }, { x: W * 0.82, y: H * 0.45, r: 260, c: C.r5, o: 0.08 }]} />
      {data.wall.slice(0, 8).map((r, i) => {
        const t = ramp(f, [0, 2.1, 0.9, 3.4, 1.5, 2.8, 0.4, 3.9][i], 22 + [0, 2.1, 0.9, 3.4, 1.5, 2.8, 0.4, 3.9][i], IO);
        const a = (i / 8) * Math.PI * 2;
        const R = (1 - t) * 760;
        return (
          <div key={i} style={{ position: "absolute", left: W / 2 + Math.cos(a) * R, top: H * 0.33 + Math.sin(a) * R * 0.8, opacity: 1 - t,
            transform: `translate(-50%,-50%) scale(${1 - t * 0.9}) rotate(${(1 - t) * (i % 2 ? 12 : -12)}deg)` }}>
            <ReviewCard r={r} w={300} />
          </div>
        );
      })}
      <div style={{ position: "absolute", left: 0, top: 70 }}>
        <Stage width={W} height={720} cam={cam} shadow={0.14}>
          <Mark appear={appear} y={1.75} scale={1.5} />
        </Stage>
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: 740, textAlign: "center", opacity: word, transform: `translateY(${(1 - word) * 40}px)` }}>
        <div style={{ font: `800 210px/0.9 ${F.display}`, letterSpacing: "-0.04em", color: C.ink }}>écoute</div>
        <div style={{ font: `500 38px ${F.body}`, color: C.ink2, marginTop: 18 }}>An AI agent for the voice of the customer</div>
      </div>
      <div style={{ position: "absolute", left: 72, top: 1050, opacity: credit, transform: `translateX(${(1 - credit) * -30}px)`, display: "flex", alignItems: "center", gap: 18 }}>
        <div style={{ width: 6, height: 66, borderRadius: 3, background: C.cobalt }} />
        <div>
          <div style={{ font: `500 26px ${F.body}`, color: C.ink2 }}>Designed and built by</div>
          <div style={{ font: `700 42px ${F.display}`, color: C.ink, letterSpacing: "-0.02em" }}>Narpat Ganwliya</div>
        </div>
      </div>
    </AbsoluteFill>
  );
}

/* 3 ─ Stream: every new review flows from the two stores into the agent; named brands light up as spoken */
function Stream({ s }) {
  const f = useCurrentFrame();
  const { width: W, fps } = useVideoConfig();
  const named = { "BNP Paribas": wordAt(s, /Paribas|BNP/i, 40), Orange: wordAt(s, /Orange/i, 55), Decathlon: wordAt(s, /Decathlon/i, 70), Deliveroo: wordAt(s, /Deliveroo/i, 85) };
  const head = sp(f, fps, 18);
  const st = data.stream;
  const share = st.google_play / (st.google_play + st.app_store);
  const stageTop = 268, stageH = 600;
  const cam = { position: [0, 2.5, 11.5], fov: 32, look: [0, 2.05, 0] };
  const proj = projector(cam, W, stageH);
  const srcs = [[-4.15, 3.95, 0.3], [4.15, 3.95, 0.3]];
  const legend = ramp(f, 26, 44);
  const brands = data.sectors.flatMap((x) => x.brands);
  const order = brands.map((_, i) => (i * 17) % brands.length);
  return (
    <AbsoluteFill>
      <Glow items={[{ x: W * 0.5, y: 560, r: 360, c: C.cobalt, o: 0.08 }]} />
      <Headline appear={head} size={86} sub="Every new review from Google Play and the App Store">{data.stats.brands} brands, {data.stats.sectors} sectors</Headline>
      <div style={{ position: "absolute", left: 0, top: stageTop }}>
        <Stage width={W} height={stageH} cam={cam} shadow={0.12}>
          <Mark appear={1} y={1.75} scale={1.12} />
          <ReviewStream ratings={st.ratings} share={share} sources={srcs} target={[0, 1.8, 0]} spawnEnd={s.frames / 30 - 1.6} count={540} />
        </Stage>
        {srcs.map((p, i) => {
          const [x, y] = proj(p[0], p[1] + 0.75, p[2]);
          const a = sp(f - 4 - i * 5, fps, 16);
          return (
            <div key={i} style={{ position: "absolute", left: x, top: y, transform: `translate(-50%,-100%) translateY(${(1 - a) * 16}px)`, opacity: a, textAlign: "center" }}>
              <Pill size={24} bg={C.ink} color="#fff" border={C.ink}>{i ? "App Store" : "Google Play"}
                <span style={{ color: "rgba(255,255,255,.62)", fontVariantNumeric: "tabular-nums" }}>{Math.round((i ? 1 - share : share) * 100)}%</span></Pill>
            </div>
          );
        })}
      </div>
      <div style={{ position: "absolute", left: 72, right: 72, top: stageTop + stageH - 6, display: "flex", alignItems: "center", gap: 18, opacity: legend,
        transform: `translateY(${(1 - legend) * 12}px)`, font: `500 22px ${F.body}`, color: C.ink2 }}>
        One tile per review, coloured by its stars
        <span style={{ display: "inline-flex", gap: 6, marginLeft: "auto" }}>
          {[1, 2, 3, 4, 5].map((k) => (
            <span key={k} style={{ display: "inline-flex", alignItems: "center", gap: 4, background: mix(RATING[k], "#ffffff", 0.84), color: mix(RATING[k], C.ink, 0.35),
              borderRadius: 8, padding: "4px 9px", font: `700 20px ${F.body}` }}>{k}<Star size={16} color={RATING[k]} /></span>
          ))}
        </span>
      </div>
      <div style={{ position: "absolute", left: 72, right: 72, top: stageTop + stageH + 48, display: "flex", flexWrap: "wrap", gap: 8 }}>
        {brands.map((b, i) => {
          const a = sp(f - 8 - order[i] * 0.45, fps, 16);
          const hit = named[b] != null && f >= named[b] - 3;
          const h = hit ? sp(f - named[b] + 3, fps, 13, 0.7) : 0;
          return (
            <span key={b} style={{ display: "inline-block", opacity: a, transform: `translateY(${(1 - a) * 14}px) scale(${1 + h * 0.1})`, position: "relative", zIndex: hit ? 2 : 1,
              background: hit ? C.cobalt : C.card, color: hit ? "#fff" : C.ink, border: `1.5px solid ${hit ? C.cobalt : C.line}`, borderRadius: 999,
              padding: "5px 12px", font: `600 18px ${F.body}`, boxShadow: hit ? `0 12px 24px -10px ${C.cobalt}` : "none" }}>{b}</span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
}

/* 4 ─ Understand: one real review is read, tagged and priced */
const KEY = { delivery: /(coursier|livr\w*|commande|attente)/gi, service: /(assistance|service client|rembours\w*|annuler)/gi };
function Highlighted({ text, progress }) {
  const parts = [];
  let last = 0;
  const all = [...text.matchAll(new RegExp(`${KEY.delivery.source}|${KEY.service.source}`, "gi"))];
  all.forEach((m, i) => {
    parts.push(text.slice(last, m.index));
    const isDel = new RegExp(KEY.delivery.source, "i").test(m[0]);
    const on = progress > (m.index / text.length) * 0.9;
    const col = isDel ? C.r1 : C.r2;
    parts.push(<span key={i} style={{ background: on ? mix(col, "#ffffff", 0.82) : "transparent", boxShadow: on ? `inset 0 -4px 0 ${col}` : "none", borderRadius: 6, padding: "0 3px" }}>{m[0]}</span>);
    last = m.index + m[0].length;
  });
  parts.push(text.slice(last));
  return parts;
}
function Understand({ s }) {
  const f = useCurrentFrame();
  const { width: W, height: H, fps } = useVideoConfig();
  const r = data.deliveroo.scan;
  const head = sp(f, fps, 18);
  const card = sp(f - 3, fps, 16);
  const scan = interpolate(f, [12, 52], [0, 1], { ...clamp, easing: Easing.inOut(Easing.cubic) });
  const hot = { "Orders & delivery": data.deliveroo.drivers[0].lost, "Customer service": data.deliveroo.drivers[1].lost };
  return (
    <AbsoluteFill>
      <Glow items={[{ x: W * 0.5, y: H * 0.42, r: 360, c: C.r1, o: 0.09 }, { x: W * 0.6, y: H * 0.75, r: 300, c: C.cobalt, o: 0.07 }]} />
      <Headline appear={head} size={86}>{data.stats.topics} pain points, each priced in stars</Headline>
      <div style={{ position: "absolute", left: 72, top: 1090, display: "flex", alignItems: "center", gap: 12, opacity: ramp(f, 30, 48), font: `500 23px/1.3 ${F.body}`, color: C.ink2 }}>
        <Icon name="spark" size={26} color={C.cobalt} />
        Classifier trained on {data.model.train.toLocaleString("en-US")} reviews labelled by Gemini, tested on {data.model.heldout} held-out reviews
      </div>
      <div style={{ position: "absolute", left: 72, top: 392, perspective: 1600 }}>
        <div style={{ transform: `rotateX(${10 - card * 4}deg) rotateY(-7deg) translateY(${(1 - card) * 60}px)`, opacity: card, position: "relative" }}>
          <div style={{ position: "absolute", top: -22, left: 30, zIndex: 3 }}><Pill size={22} bg={C.ink} color="#fff" border={C.ink}>Deliveroo</Pill></div>
          <div style={{ width: 936, background: C.card, borderRadius: 20, padding: "44px 48px 40px",
            boxShadow: "0 1px 2px rgba(20,22,28,.06), 0 40px 70px -30px rgba(28,34,52,.38)", position: "relative", overflow: "hidden" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 14 }}>
              <StarsInline n={r.r} size={40} /><span style={{ font: `500 26px ${F.body}`, color: C.ink3 }}>{r.src}</span>
            </div>
            <div lang="fr" style={{ font: `500 40px/1.38 ${F.body}`, color: C.ink }}><Highlighted text={r.t} progress={scan} /></div>
            <div style={{ position: "absolute", left: 0, right: 0, top: `${scan * 100}%`, height: 90, transform: "translateY(-50%)", opacity: scan > 0 && scan < 1 ? 1 : 0,
              background: `linear-gradient(to bottom, rgba(47,77,245,0), rgba(47,77,245,.16) 50%, rgba(47,77,245,0))`, borderTop: `2px solid ${C.cobalt}` }} />
          </div>
        </div>
      </div>
      <div style={{ position: "absolute", left: 72, top: 846, width: 936, display: "flex", flexWrap: "wrap", gap: 10 }}>
        {TOPICS.map((t, i) => {
          const a = sp(f - 10 - i * 1.3, fps, 15);
          const lit = hot[t] != null && scan >= 1;
          const l = lit ? sp(f - 54 - (t === "Customer service" ? 8 : 0), fps, 11, 0.7) : 0;
          return (
            <span key={t} style={{ position: "relative", opacity: a, transform: `translateY(${(1 - a) * 16}px) scale(${1 + l * 0.12})`, zIndex: lit ? 2 : 1,
              background: lit ? (t === "Customer service" ? C.r2 : C.r1) : C.card, color: lit ? "#fff" : C.ink2, border: `1.5px solid ${lit ? "transparent" : C.line}`,
              borderRadius: 999, padding: "8px 16px", font: `600 22px ${F.body}`, boxShadow: lit ? "0 14px 26px -12px rgba(238,65,54,.7)" : "none" }}>
              {t}
              {lit && <span style={{ display: "inline-flex", alignItems: "center", gap: 4, marginLeft: 10, background: "rgba(255,255,255,.95)", color: C.ink, borderRadius: 999, padding: "1px 10px",
                font: `800 21px ${F.display}`, transform: `scale(${0.9 + 0.1 * l})`, opacity: l }}>−{hot[t].toFixed(2)}<Star size={17} color={C.ink} /></span>}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
}

/* 5 ─ Deliveroo: stars lost per pain point, in 3D */
function Deliveroo({ s }) {
  const f = useCurrentFrame();
  const { width: W, height: H, fps } = useVideoConfig();
  const D = data.deliveroo;
  const head = sp(f, fps, 18);
  const stageTop = 380, stageH = 640;
  const cam = { position: [0, 3.4, 15.5], fov: 28, look: [0, 1.75, 0] };
  const proj = projector(cam, W, stageH);
  const max = D.drivers[0].lost;
  const xs = [-3.45, -1.15, 1.15, 3.45];
  const cols = [C.r1, C.r2, mix(C.r2, C.r3, 0.5), C.r3];
  const grow = (i) => sp(f - 8 - i * 5, fps, 14, 1.1);
  const pct = interpolate(f, [10, 50], [0, D.prevalence], { ...clamp, easing: ease });
  const ring = 2 * Math.PI * 88;
  return (
    <AbsoluteFill>
      <Glow items={[{ x: W * 0.3, y: H * 0.55, r: 380, c: C.r1, o: 0.1 }]} />
      <Headline appear={head} size={118} sub="Stars lost per pain point, last 60 days">Deliveroo</Headline>
      <div style={{ position: "absolute", left: 72, top: 300, opacity: head, display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 10 }}>
        <Pill size={23}><Star size={22} color={C.r5} /> {D.store.toFixed(1)} store rating on Google Play</Pill>
        <Pill size={23} bg={mix(C.r1, "#ffffff", 0.88)} color={C.r1} border={mix(C.r1, "#ffffff", 0.6)} style={{ opacity: ramp(f, 20, 34) }}>
          <Star size={22} color={C.r1} /> {D.avg.toFixed(2)} average in recent written reviews
        </Pill>
      </div>
      <div style={{ position: "absolute", right: 64, top: 70, width: 240, textAlign: "center", opacity: head }}>
        <svg width="220" height="220" viewBox="0 0 220 220">
          <circle cx="110" cy="110" r="88" fill="none" stroke={C.line} strokeWidth="26" />
          <circle cx="110" cy="110" r="88" fill="none" stroke={C.r1} strokeWidth="26" strokeLinecap="round"
            strokeDasharray={`${ring * pct} ${ring}`} transform="rotate(-90 110 110)" />
          <text x="110" y="128" textAnchor="middle" style={{ font: `800 58px ${F.display}`, fill: C.ink }}>{Math.round(pct * 100)}%</text>
        </svg>
        <div style={{ font: `500 23px/1.3 ${F.body}`, color: C.ink2, marginTop: 4 }}>of reviews mention a delivery problem</div>
      </div>
      <div style={{ position: "absolute", left: 0, top: stageTop }}>
        <Stage width={W} height={stageH} cam={cam} shadow={0.2}>
          <Columns bars={D.drivers.map((d, i) => ({ x: xs[i], h: (d.lost / max) * 3.6 * grow(i), color: cols[i], w: 1.45, d: 1.45,
            glow: i === 0 ? 0.06 + Math.max(0, Math.sin(f / 7)) * 0.08 : 0 }))} />
        </Stage>
        {D.drivers.map((d, i) => {
          const [tx, ty] = proj(xs[i], (d.lost / max) * 3.6 * grow(i) + 0.25, 0);
          const [lx, ly] = proj(xs[i], 0, 1.35);
          return (
            <React.Fragment key={i}>
              <div style={{ position: "absolute", left: tx, top: ty, transform: "translate(-50%,-100%)", font: `800 ${i ? 40 : 54}px ${F.display}`, color: i ? C.ink2 : C.r1,
                opacity: grow(i), letterSpacing: "-0.02em", display: "flex", alignItems: "center", gap: 4 }}>−{d.lost.toFixed(2)}<Star size={i ? 32 : 44} color={i ? C.ink2 : C.r1} /></div>
              <div style={{ position: "absolute", left: lx, top: ly + 8, width: 210, transform: "translateX(-50%)", textAlign: "center",
                font: `${i ? 500 : 700} 23px/1.25 ${F.body}`, color: i ? C.ink2 : C.ink, opacity: grow(i) }}>{d.label}</div>
            </React.Fragment>
          );
        })}
      </div>
    </AbsoluteFill>
  );
}

/* 6 ─ The agent at work: a replay of its real tool calls on the E.Leclerc spike */
const K = { text: "#ECEEF3", dim: "#8D95A6", tool: "#A3B4FF", ok: "#46D99B", bad: "#FF7468", line: "rgba(255,255,255,.09)", panel: "#1C1F27" };
const ASPECT = { app_reliability: "App reliability", login_access: "Login & access", features: "Features", usability: "Ease of use", performance: "Speed" };
const fmtDay = (d) => `${+d.slice(8, 10)} ${["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][+d.slice(5, 7)]}`;
const argStr = (o) => Object.entries(o).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(", ");

export function MiniMark({ size = 34 }) {
  const arc = (r) => {
    const a = (50 * Math.PI) / 180;
    return `M${12 + r * Math.cos(-a)} ${20 + r * Math.sin(-a)} A${r} ${r} 0 0 1 ${12 + r * Math.cos(a)} ${20 + r * Math.sin(a)}`;
  };
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" strokeLinecap="round" strokeWidth="3.4">
      <circle cx="12" cy="20" r="3.6" fill="#fff" />
      <path d={arc(8)} stroke={C.r1} /><path d={arc(13.4)} stroke={C.r3} /><path d={arc(18.8)} stroke={C.r5} />
    </svg>
  );
}
function Caret({ f, color = K.tool }) {
  return <span style={{ display: "inline-block", width: "0.55em", height: "1.05em", verticalAlign: "-0.18em", marginLeft: 2, background: color, opacity: Math.floor(f / 7) % 2 ? 0.15 : 0.95 }} />;
}
function Mark3({ text, on }) {
  const rx = /(mise à jour|MAJ|connecter|ouvrir|ne fonctionne plus)/gi;
  const parts = [];
  let last = 0;
  [...text.matchAll(rx)].forEach((m, i) => {
    parts.push(text.slice(last, m.index));
    parts.push(<span key={i} style={{ background: on ? mix(C.r1, "#ffffff", 0.84) : "transparent", boxShadow: on ? `inset 0 -3px 0 ${C.r1}` : "none", borderRadius: 4, padding: "0 2px" }}>{m[0]}</span>);
    last = m.index + m[0].length;
  });
  parts.push(text.slice(last));
  return parts;
}

function Agent({ s }) {
  const f = useCurrentFrame();
  const { width: W, fps } = useVideoConfig();
  const L = data.leclerc, A = data.agent;
  const T = agentTimes(s);
  const head = sp(f, fps, 18);
  const mini = ramp(f, T.inv - 6, T.inv + 24, IO);
  const con = sp(f - T.inv, fps, 18, 1);

  /* the spike, full width first, then parked in the corner */
  const stageTop = 300, stageH = 520;
  const cam = { position: [0, 3.2, 17], fov: 28, look: [0, 1.9, 0] };
  const proj = projector(cam, W, stageH);
  const n = L.daily.length;
  const xs = L.daily.map((_, i) => (i - (n - 1) / 2) * 0.47);
  const spikeI = L.daily.findIndex((d) => d.d === L.day);
  const hOf = (v) => (v / L.peak) * 4.4;
  const grow = (i) => (i === spikeI ? sp(f - 30, fps, 10, 1.1) : ramp(f, 4 + [0, 1.6, 0.7, 2.3][i % 4] + i * 0.8, 16 + i * 0.8));
  const [sx, sy] = proj(xs[spikeI], hOf(L.peak) * grow(spikeI) + 0.3, 0);
  const alert = sp(f - 40, fps, 15);

  /* the log: real tool calls, in order, with the error kept in */
  const st = A.steps;
  const steps = [
    { icon: "db", tool: "run_sql", what: "Counts every E.Leclerc review", code: st[0].args.query, lines: 2, res: { kind: "ok", text: `${L.reviews.toLocaleString("en-US")} reviews` } },
    { icon: "db", tool: "run_sql", what: "Pulls negative reviews from 8 to 12 Nov", code: st[1].args.query, lines: 1, res: { kind: "bad", text: "Parser Error: syntax error" } },
    { icon: "search", tool: "search_reviews", what: "Reads the reviews around the spike instead", code: argStr(st[2].args), lines: 1, res: { kind: "ok", text: `${L.read} reviews read` } },
    { icon: "bars", tool: "key_drivers", what: "Ranks what costs E.Leclerc stars", code: argStr(st[3].args), lines: 1,
      res: { kind: "bars", unit: "star", rows: A.drivers.map((d, i) => ({ label: d.label, v: d.lost, txt: `−${d.lost.toFixed(2)}`, c: i ? C.r2 : C.r1 })) } },
    { icon: "db", tool: "run_sql", what: "Counts complaint topics from 8 to 12 Nov", code: st[4].args.query, lines: 2,
      res: { kind: "bars", rows: A.counts.map((c) => ({ label: ASPECT[c.aspect] || c.aspect, v: c.n, txt: String(c.n), c: c.aspect === "features" ? C.r3 : C.r1 })) } },
  ];
  const H_ = steps.map((x) => 46 + x.lines * 31 + (x.res.kind === "bars" ? x.res.rows.length * 36 + 8 : 40) + 24).concat([196]);
  const top_ = H_.map((_, i) => H_.slice(0, i).reduce((a, b) => a + b, 0));
  const app = T.steps.map((t) => ramp(f, t, t + 12));
  const view = 700;
  const content = H_.reduce((acc, h, i) => acc + h * app[i], 0);
  const scroll = Math.max(0, content - view + 20);
  const ev = ramp(f, T.evOut, T.evOut + 14) * (1 - ramp(f, T.evIn - 16, T.evIn + 2, IO));
  const done = f >= T.steps[5];
  const conTop = 336, bodyTop = 92;

  return (
    <AbsoluteFill>
      <Glow items={[{ x: W * 0.7, y: 200, r: 300, c: C.r1, o: 0.1 * (1 - mini * 0.5) }, { x: W * 0.4, y: 900, r: 420, c: C.cobalt, o: 0.1 * con }]} />
      <div style={{ position: "absolute", left: 72, top: 92, opacity: head, transform: `translateY(${(1 - head) * 40}px)` }}>
        <div style={{ font: `800 ${118 - 22 * mini}px/0.98 ${F.display}`, letterSpacing: "-0.03em", color: C.ink, fontStretch: "92%" }}>E.Leclerc</div>
        <div style={{ font: `500 ${42 - 8 * mini}px/1.3 ${F.body}`, color: C.ink2, marginTop: 18 - 6 * mini }}>Negative reviews per day</div>
      </div>
      <div style={{ position: "absolute", left: 72, top: 286 - 40 * mini, opacity: alert, transform: `translateY(${(1 - alert) * 14}px)` }}>
        <Pill size={23} bg={mix(C.r1, "#ffffff", 0.88)} color={C.r1} border={mix(C.r1, "#ffffff", 0.55)}>
          <Icon name="alert" size={24} color={C.r1} /> Complaint spike: {L.peak} on {fmtDay(L.day)}, usually {L.usual}
        </Pill>
      </div>
      <div style={{ position: "absolute", left: 0, top: stageTop, width: W, height: stageH, transformOrigin: "100% 0%",
        transform: `translate(${-30 * mini}px, ${-238 * mini}px) scale(${1 - 0.56 * mini})` }}>
        <Stage width={W} height={stageH} cam={cam} shadow={0.18}>
          <Columns bars={L.daily.map((d, i) => ({ x: xs[i], h: hOf(d.n) * grow(i), w: 0.36, d: 0.6,
            color: i === spikeI ? C.r1 : d.n > L.usual * 2 ? C.r2 : "#CCD2DC", glow: i === spikeI ? 0.1 + Math.max(0, Math.sin(f / 5)) * 0.12 : 0 }))} />
        </Stage>
        <div style={{ position: "absolute", left: sx, top: sy, transform: `translate(-50%,-100%) scale(${(0.9 + 0.1 * grow(spikeI)) * (1 + mini * 0.95)})`, transformOrigin: "50% 100%",
          opacity: Math.min(1, grow(spikeI) * 2) }}>
          <Pill size={26} bg={C.r1} color="#fff" border={C.r1}>×{L.ratio} on {fmtDay(L.day)}</Pill>
        </div>
        {[0, n - 1].map((i) => {
          const [lx, ly] = proj(xs[i], 0, 0.55);
          return <div key={i} style={{ position: "absolute", left: lx, top: ly + 6, transform: "translateX(-50%)", font: `500 21px ${F.body}`, color: C.ink3, whiteSpace: "nowrap", opacity: 1 - mini }}>{fmtDay(L.daily[i].d)}</div>;
        })}
      </div>

      <div style={{ position: "absolute", left: 48, right: 48, top: conTop, height: 852, perspective: 1800, opacity: Math.min(1, con * 1.4) }}>
        <div style={{ position: "absolute", inset: 0, background: C.ink, borderRadius: 20, overflow: "hidden", transformOrigin: "50% 100%",
          transform: `translateY(${(1 - con) * 130}px) rotateX(${(1 - con) * 12}deg)`, boxShadow: "0 50px 90px -40px rgba(20,22,40,.6)" }}>
          <div style={{ height: 84, display: "flex", alignItems: "center", gap: 14, padding: "0 28px", borderBottom: `1px solid ${K.line}` }}>
            <MiniMark size={40} />
            <div>
              <div style={{ font: `700 30px ${F.display}`, color: "#fff", letterSpacing: "-0.02em" }}>Écoute agent</div>
              <div style={{ font: `500 19px ${F.body}`, color: K.dim, marginTop: 2 }}>Case opened on its own: complaint spike at E.Leclerc</div>
            </div>
            <div style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 10, borderRadius: 999, padding: "8px 16px",
              background: done ? "rgba(70,217,155,.14)" : "rgba(163,180,255,.12)", color: done ? K.ok : K.tool, font: `600 21px ${F.body}` }}>
              {done ? <Icon name="check" size={20} color={K.ok} stroke={2.8} />
                : <span style={{ width: 10, height: 10, borderRadius: 5, background: K.tool, boxShadow: `0 0 0 ${4 + Math.sin(f / 4) * 3}px rgba(163,180,255,.22)` }} />}
              {done ? "Cause found" : "Investigating"}
            </div>
          </div>
          <div style={{ position: "absolute", left: 0, right: 0, top: bodyTop, height: view + 18, overflow: "hidden",
            WebkitMaskImage: "linear-gradient(to bottom, transparent 0, black 26px, black 100%)" }}>
            <div style={{ position: "absolute", left: 28, right: 28, top: 22 - scroll, opacity: 1 - 0.6 * ev }}>
              {steps.map((x, i) => {
                const t = T.steps[i];
                const a = app[i];
                if (a <= 0) return null;
                const cps = Math.min(x.code.length, x.lines * 66) / 15;
                const typed = x.code.slice(0, Math.max(0, Math.floor((f - t - 4) * cps)));
                const rt = t + 22;
                const r = ramp(f, rt, rt + 10);
                const typing = f < rt;
                const resCol = x.res.kind === "bad" ? K.bad : K.ok;
                return (
                  <div key={i} style={{ position: "absolute", left: 0, right: 0, top: top_[i], opacity: a, transform: `translateY(${(1 - a) * 18}px)` }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12, height: 40 }}>
                      <span style={{ width: 34, height: 34, borderRadius: 10, background: "rgba(163,180,255,.14)", display: "grid", placeItems: "center" }}>
                        <Icon name={x.icon} size={21} color={K.tool} />
                      </span>
                      <span style={{ font: `600 23px ${F.mono}`, color: K.tool }}>{x.tool}</span>
                      <span style={{ font: `500 22px ${F.body}`, color: K.dim }}>{x.what}</span>
                    </div>
                    <div style={{ font: `400 21px/31px ${F.mono}`, color: K.text, marginTop: 6, paddingLeft: 46, display: "-webkit-box", WebkitBoxOrient: "vertical",
                      WebkitLineClamp: x.lines, overflow: "hidden", overflowWrap: "anywhere" }}>
                      {typed}{typing && <Caret f={f} />}
                    </div>
                    {x.res.kind !== "bars" ? (
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8, paddingLeft: 46, opacity: r, transform: `translateX(${(1 - r) * -10}px)`,
                        font: `600 23px ${F.mono}`, color: resCol }}>
                        <Icon name={x.res.kind === "bad" ? "cross" : "check"} size={22} color={resCol} stroke={2.8} />{x.res.text}
                        {x.res.kind === "bad" && <span style={{ font: `500 21px ${F.body}`, color: K.dim, marginLeft: 6 }}>the agent changes approach</span>}
                      </div>
                    ) : (
                      <div style={{ marginTop: 10, paddingLeft: 46 }}>
                        {x.res.rows.map((row, k) => {
                          const g = ramp(f, rt + k * 5, rt + 18 + k * 5);
                          const max = Math.max(...x.res.rows.map((q) => q.v));
                          return (
                            <div key={k} style={{ display: "flex", alignItems: "center", gap: 14, height: 36, opacity: Math.min(1, g * 2) }}>
                              <span style={{ width: 190, font: `500 21px ${F.body}`, color: K.text }}>{row.label}</span>
                              <span style={{ height: 14, width: 380 * (row.v / max) * g, borderRadius: 7, background: row.c }} />
                              <span style={{ display: "inline-flex", alignItems: "center", gap: 4, font: `600 22px ${F.mono}`, color: K.text, fontVariantNumeric: "tabular-nums" }}>
                                {row.txt}{x.res.unit === "star" && <Star size={18} color={K.text} />}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
              {app[5] > 0 && (
                <div style={{ position: "absolute", left: 0, right: 0, top: top_[5], opacity: app[5], transform: `translateY(${(1 - app[5]) * 22}px) scale(${0.96 + 0.04 * app[5]})`,
                  transformOrigin: "50% 0%", background: "rgba(70,217,155,.1)", border: `1px solid rgba(70,217,155,.28)`, borderRadius: 16, padding: "20px 24px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <Badge name="check" size={34} bg={C.r5} />
                    <span style={{ font: `700 30px ${F.display}`, color: "#fff", letterSpacing: "-0.01em" }}>Likely cause</span>
                    <span style={{ marginLeft: "auto", font: `600 20px ${F.body}`, color: K.ok }}>Confidence: {A.confidence}</span>
                  </div>
                  <div style={{ font: `500 25px/1.36 ${F.body}`, color: K.text, marginTop: 12 }}>{A.root_cause}</div>
                  <div style={{ font: `500 19px ${F.body}`, color: K.dim, marginTop: 10 }}>Whole investigation: {A.seconds} seconds, {A.steps.length - 1} tool calls</div>
                </div>
              )}
            </div>
          </div>
          <div style={{ position: "absolute", left: 28, right: 28, bottom: 0, height: 46, display: "flex", alignItems: "center", borderTop: `1px solid ${K.line}`,
            font: `500 18px ${F.body}`, color: K.dim }}>
            Replay of the agent's logged tool calls, run on {fmtDay(A.run_day)} {A.run_day.slice(0, 4)} with {A.model.replace(/^gemini-/, "Gemini ").replace("-flash-lite", " Flash-Lite")}
          </div>
        </div>
      </div>

      {A.evidence.slice(0, 3).map((t, i) => {
        const e = ramp(f, T.evOut + [0, 3, 7][i], T.evOut + 14 + [0, 3, 7][i]) * (1 - ramp(f, T.evIn - 16 + i * 2, T.evIn + 2 + i * 2, IO));
        if (e <= 0.001) return null;
        const ox = 48 + 28 + 46 + 120, oy = conTop + bodyTop + 22 - scroll + top_[2] + 46 + 31 + 20;
        const tx = [150, 300, 190][i], ty = [470, 640, 815][i];
        const hl = f > T.evOut + 14 + i * 5;
        return (
          <div key={i} style={{ position: "absolute", left: ox + (tx - ox) * e, top: oy + (ty - oy) * e, width: 620, opacity: Math.min(1, e * 1.6),
            transform: `scale(${0.35 + 0.65 * e}) rotate(${[-3, 2.2, -1.2][i] * e}deg)`, transformOrigin: "0% 0%" }}>
            <div lang="fr" style={{ background: C.card, borderRadius: 16, padding: "16px 20px", boxShadow: "0 1px 2px rgba(20,22,28,.08), 0 26px 50px -18px rgba(10,12,24,.55)",
              font: `500 24px/1.36 ${F.body}`, color: C.ink }}>
              <div style={{ marginBottom: 6 }}><StarsInline n={1} size={20} /></div>“<Mark3 text={t} on={hl} />”
            </div>
          </div>
        );
      })}
    </AbsoluteFill>
  );
}

/* 7 ─ The brief: the agent writes it up, and the work lands with the right teams */
const AVATAR = { "Mobile team": "mobile", Mobile: "mobile", QA: "qa", "IT security": "qa", Operations: "ops", "Customer service": "support" };
function Brief({ s }) {
  const f = useCurrentFrame();
  const { width: W, fps } = useVideoConfig();
  const A = data.agent;
  const T = briefTimes(s);
  const doc = sp(f - T.doc, fps, 17);
  const hl = A.headline;
  const typed = hl.slice(0, Math.max(0, Math.floor((f - T.type) * (hl.length / 52))));
  const acts = data.actions.map((a, i) => (i < 2 ? { ...a, team: A.actions[i]?.team || a.team } : a));
  const groups = [
    { label: "E.Leclerc, from the agent's brief", items: [0, 1] },
    { label: "Deliveroo, ranked by stars at stake", items: [2, 3] },
  ];
  let y = 404;
  return (
    <AbsoluteFill>
      <Glow items={[{ x: W * 0.5, y: 300, r: 380, c: C.cobalt, o: 0.09 }]} />
      <div style={{ position: "absolute", left: 56, right: 56, top: 72, opacity: doc, transform: `translateY(${(1 - doc) * 50}px) scale(${0.96 + 0.04 * doc})`, transformOrigin: "50% 0%" }}>
        <div style={{ background: C.card, borderRadius: 20, padding: "26px 32px 28px", boxShadow: "0 1px 2px rgba(20,22,28,.06), 0 40px 70px -34px rgba(28,34,52,.4)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <span style={{ width: 52, height: 52, borderRadius: 14, background: C.cobalt, display: "grid", placeItems: "center" }}><Icon name="doc" size={30} color="#fff" /></span>
            <div>
              <div style={{ font: `800 40px ${F.display}`, color: C.ink, letterSpacing: "-0.025em" }}>Brief</div>
              <div style={{ font: `500 21px ${F.body}`, color: C.ink2 }}>Written by the Écoute agent, {fmtDay(A.run_day)} {A.run_day.slice(0, 4)}</div>
            </div>
            <span style={{ marginLeft: "auto" }}><Pill size={21} bg={mix(C.r5, "#ffffff", 0.86)} color={C.r5} border={mix(C.r5, "#ffffff", 0.55)}>Confidence: {A.confidence}</Pill></span>
          </div>
          <div style={{ font: `500 28px/1.4 ${F.body}`, color: C.ink, marginTop: 20, minHeight: 80 }}>
            {typed}{f < T.type + 56 && <Caret f={f} color={C.cobalt} />}
          </div>
        </div>
      </div>
      {groups.map((g, gi) => {
        const gy = y;
        y += 44 + g.items.length * 156 + 18;
        const la = ramp(f, T.tickets[g.items[0]] - 8, T.tickets[g.items[0]] + 8);
        return (
          <div key={gi} style={{ position: "absolute", left: 56, right: 56, top: gy }}>
            <div style={{ font: `600 23px ${F.body}`, color: C.ink2, height: 44, opacity: la }}>{g.label}</div>
            {g.items.map((i, k) => {
              const a = acts[i];
              const t = sp(f - T.tickets[i], fps, 17);
              const ok = sp(f - T.tickets[i] - 20, fps, 13, 0.7);
              const tone = a.tone === 1 ? C.r1 : C.r2;
              const tag = a.tag.includes("★") ? <>{a.tag.split("★")[0]}<Star size={17} color={tone} />{a.tag.split("★")[1]}</> : a.tag;
              return (
                <div key={i} style={{ marginBottom: 14, opacity: t, transform: `translateX(${(1 - t) * 90}px)`, filter: t < 0.98 ? `blur(${(1 - t) * 6}px)` : undefined }}>
                  <div style={{ background: C.card, borderRadius: 16, padding: "16px 22px", display: "grid", gridTemplateColumns: "100px 1fr", gap: 20, alignItems: "center",
                    boxShadow: "0 1px 2px rgba(20,22,28,.06), 0 24px 44px -26px rgba(28,34,52,.4)" }}>
                    <div style={{ width: 100, height: 108, borderRadius: 14, background: mix(C.cobalt, "#ffffff", 0.91), display: "grid", placeItems: "center", overflow: "hidden" }}>
                      <Avatar name={AVATAR[a.team] || "support"} size={100} />
                    </div>
                    <div>
                      <div style={{ font: `600 29px/1.25 ${F.body}`, color: C.ink }}>{a.title}</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 10, font: `500 22px ${F.body}`, color: C.ink2 }}>
                        {a.team}
                        <Pill size={18} bg={mix(tone, "#ffffff", 0.87)} color={tone} border={mix(tone, "#ffffff", 0.6)}>{tag}</Pill>
                        <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 8, color: C.cobalt, font: `600 22px ${F.body}`, opacity: ok,
                          transform: `scale(${0.9 + 0.1 * ok})` }}>
                          <Badge name="check" size={26} /> Assigned
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
    </AbsoluteFill>
  );
}

/* 8 ─ Improvement: the crowd turns from red to green, the stars fill up */
function TrendBg({ appear }) {
  const { width: W, height: H } = useVideoConfig();
  const pts = data.trend.points || [];
  if (pts.length < 3) return null;
  const sm = pts.map((_, i) => { const w = pts.slice(Math.max(0, i - 2), i + 1); return w.reduce((a, b) => a + b, 0) / w.length; });
  const lo = Math.min(...sm) - 0.2, hi = Math.max(...sm) + 0.1;
  const n = Math.max(2, Math.round(sm.length * appear));
  const x = (i) => (i / (sm.length - 1)) * W;
  const y = (r) => H * 0.92 - ((r - lo) / (hi - lo)) * H * 0.5;
  const d = sm.slice(0, n).map((r, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(r).toFixed(1)}`).join(" ");
  return (
    <svg width={W} height={H} style={{ position: "absolute", inset: 0 }}>
      <defs><linearGradient id="tg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor={C.r5} stopOpacity="0.16" /><stop offset="1" stopColor={C.r5} stopOpacity="0" /></linearGradient></defs>
      <path d={`${d} L${x(n - 1)},${H} L0,${H} Z`} fill="url(#tg)" />
      <path d={d} fill="none" stroke={C.r5} strokeOpacity="0.35" strokeWidth="5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
function Improve({ s }) {
  const f = useCurrentFrame();
  const { width: W, height: H, fps } = useVideoConfig();
  const D = data.improve;
  const v = interpolate(f, [18, s.frames * 0.75], [D.avg, D.after], { ...clamp, easing: Easing.inOut(Easing.cubic) });
  const head = sp(f, fps, 18);
  const stageTop = 300, stageH = 860;
  const cam = { position: [0, 3.9, 15], fov: 30, look: [0, 3.25, 0] };
  const proj = projector(cam, W, stageH);
  const moodOf = (i) => interpolate(f, [12 + i * 5, s.frames * 0.62 + i * 4], [0.06, 1], { ...clamp, easing: Easing.inOut(Easing.quad) });
  const praise = D.praise[0];
  const pa = sp(f - s.frames * 0.62, fps, 14);
  const [bx, by] = proj(CROWD[3].x, 3.85, CROWD[3].z);
  return (
    <AbsoluteFill>
      <Glow items={[{ x: W * 0.5, y: H * 0.7, r: 460, c: C.r5, o: 0.12 }]} />
      <TrendBg appear={interpolate(f, [0, s.frames], [0.35, 1], clamp)} />
      <div style={{ position: "absolute", left: 72, top: 84, opacity: head }}>
        <div style={{ font: `800 140px/0.9 ${F.display}`, letterSpacing: "-0.05em", color: C.ink, fontVariantNumeric: "tabular-nums" }}>
          {D.avg.toFixed(2)} <span style={{ color: C.ink3, fontWeight: 500 }}>→</span> <span style={{ color: mix(C.r3, C.r5, (v - D.avg) / (D.after - D.avg)) }}>{v.toFixed(2)}</span>
        </div>
        <div style={{ font: `500 30px/1.3 ${F.body}`, color: C.ink2, marginTop: 16, maxWidth: 900 }}>{D.brand}'s estimated recent rating if the {D.topics} complaint topics Écoute found stopped. Its Google Play store rating is {D.store.toFixed(1)}.</div>
      </div>
      <div style={{ position: "absolute", left: 0, top: stageTop }}>
        <Stage width={W} height={stageH} cam={cam} shadow={0.18} clipping>
          <StarRow value={v} y={6.25} gap={1.3} scale={0.95} />
          {CROWD.map((p, i) => <Person key={i} {...p} mood={moodOf(i)} pop={1} />)}
        </Stage>
        {praise && (
          <Bubble x={W / 2} y={by} appear={pa} w={600}>
            <div style={{ marginBottom: 6 }}><StarsInline n={praise.r} size={24} /></div>
            <div lang="fr" style={{ font: `500 22px/1.32 ${F.body}`, color: C.ink }}>“{praise.t}”</div>
          </Bubble>
        )}
      </div>
      {data.trend.brand && (
        <div style={{ position: "absolute", right: 64, bottom: 196, font: `500 21px ${F.body}`, color: C.r5, opacity: interpolate(f, [20, 40], [0, 0.95], clamp), textAlign: "right" }}>
          Background: {data.trend.brand}'s real weekly rating, {data.trend.from} to {data.trend.to} stars in {data.trend.weeks} weeks
        </div>
      )}
    </AbsoluteFill>
  );
}

/* 9 ─ The website: the real site, captured in a browser, explored in three beats */
const SITE_URL = "narpatganwliya7.github.io/Voice-of-the-Customer-AI";
const SHOT = { w: 1280, h: 1120 };               // CSS size of every capture (taken at 3x)
const CHIP = { x: 663.6, y: 422.6 };             // centre of the Deliveroo chip in the explorer capture
const BARS = { x: 607, y: 812 };                 // "Stars lost per topic" card
const BRIEF = { x: 940, y: 470 };                // the brief's headline in the agent capture

function Cursor({ x, y, press }) {
  return (
    <svg width="34" height="40" viewBox="0 0 34 40" style={{ position: "absolute", left: x - 4, top: y - 2, transform: `scale(${1 - press * 0.12})`, transformOrigin: "4px 2px",
      filter: "drop-shadow(0 4px 6px rgba(20,22,28,.35))" }}>
      <path d="M4 2l24 21-11 1.6 6.4 12.4-5 2.4-6.2-12.6L4 33z" fill="#14161C" stroke="#fff" strokeWidth="2.4" strokeLinejoin="round" />
    </svg>
  );
}

function Site({ s }) {
  const f = useCurrentFrame();
  const { width: W, fps } = useVideoConfig();
  const pick = wordAt(s, /^pick/i, 62), see = wordAt(s, /^see/i, 96), read = wordAt(s, /^read/i, 150);
  const head = sp(f, fps, 18);
  const win = sp(f - 2, fps, 18, 1);
  const VW = 960, VH = 800, base = VW / SHOT.w;    // viewport of the browser window, in video pixels

  // which capture is on screen, and the scroll between them
  const toExplorer = ramp(f, pick - 26, pick - 10, IO);
  const clickAt = pick + 14;
  const after = ramp(f, clickAt + 2, clickAt + 8);
  const toAgent = ramp(f, read - 14, read + 2, IO);

  // camera: where the viewport looks (CSS px) and how close
  const cam = (() => {
    if (f < pick - 10) return { x: 640, y: 380 + 40 * ramp(f, 0, pick - 26), z: 1 + 0.04 * ramp(f, 0, pick - 26) };
    if (f < read - 14) {
      const z = ramp(f, see - 6, see + 18, IO);
      return { x: 640 + (BARS.x - 640) * z, y: 380 + (BARS.y - 380) * z, z: 1 + 0.95 * z };
    }
    const z = ramp(f, read + 2, read + 30, IO);
    return { x: 640 + (BRIEF.x - 640) * z, y: 380 + (BRIEF.y - 380) * z, z: 1 + 0.55 * z };
  })();
  const shotStyle = (dy = 0, op = 1) => {
    const sc = base * cam.z;
    let left = VW / 2 - cam.x * sc, top = VH / 2 - cam.y * sc;
    left = Math.min(0, Math.max(VW - SHOT.w * sc, left));
    top = Math.min(0, Math.max(VH - SHOT.h * sc, top));
    return { position: "absolute", left, top: top + dy, width: SHOT.w * sc, height: SHOT.h * sc, opacity: op };
  };
  // cursor path in CSS px of the explorer capture, drawn in viewport pixels
  const mv = ramp(f, pick - 8, clickAt, IO);
  const cx = 1040 + (CHIP.x - 1040) * mv, cy = 980 + (CHIP.y - 980) * mv;
  const press = Math.max(0, 1 - Math.abs(f - clickAt) / 4);
  const ring = ramp(f, clickAt, clickAt + 14);
  const showCursor = f > pick - 12 && f < see + 4;
  const sc = base * cam.z;
  const vx = (x) => shotStyle().left + x * sc, vy = (y) => shotStyle().top + y * sc;

  return (
    <AbsoluteFill>
      <Glow items={[{ x: W * 0.5, y: 760, r: 460, c: C.cobalt, o: 0.08 }]} />
      <Headline appear={head} size={84} sub="The same data, open to anyone">It's all on the website</Headline>
      <div style={{ position: "absolute", left: (W - VW) / 2, top: 292, width: VW, opacity: Math.min(1, win * 1.4),
        transform: `translateY(${(1 - win) * 60}px) scale(${0.96 + 0.04 * win})`, transformOrigin: "50% 0%" }}>
        <div style={{ background: C.card, borderRadius: 18, overflow: "hidden", boxShadow: "0 1px 2px rgba(20,22,28,.08), 0 50px 90px -40px rgba(28,34,52,.5)" }}>
          <div style={{ height: 56, display: "flex", alignItems: "center", gap: 14, padding: "0 18px", background: "#EEF0F4" }}>
            <span style={{ display: "flex", gap: 8 }}>{[C.r1, C.r3, C.r5].map((c) => <span key={c} style={{ width: 13, height: 13, borderRadius: 7, background: c }} />)}</span>
            <span style={{ flex: 1, height: 36, borderRadius: 10, background: "#fff", display: "flex", alignItems: "center", gap: 8, padding: "0 14px",
              font: `500 20px ${F.body}`, color: C.ink2 }}>
              <Icon name="lock" size={17} color={C.ink3} /><span style={{ color: C.ink }}>{SITE_URL}</span>
            </span>
          </div>
          <div style={{ position: "relative", width: VW, height: VH, overflow: "hidden", background: C.paper }}>
            {toExplorer < 1 && <Img src={staticFile("site/hero.jpg")} style={shotStyle(-180 * toExplorer, 1 - toExplorer)} />}
            {toExplorer > 0 && toAgent < 1 && <Img src={staticFile("site/explorer_before.jpg")} style={shotStyle(180 * (1 - toExplorer) - 180 * toAgent, Math.min(toExplorer, 1 - toAgent))} />}
            {after > 0 && toAgent < 1 && <Img src={staticFile("site/explorer_after.jpg")} style={shotStyle(-180 * toAgent, Math.min(after, 1 - toAgent))} />}
            {toAgent > 0 && <Img src={staticFile("site/agent.jpg")} style={shotStyle(180 * (1 - toAgent), toAgent)} />}
            {ring > 0 && ring < 1 && (
              <span style={{ position: "absolute", left: vx(CHIP.x), top: vy(CHIP.y), width: 70, height: 70, marginLeft: -35, marginTop: -35, borderRadius: 35,
                border: `3px solid ${C.cobalt}`, opacity: 1 - ring, transform: `scale(${0.4 + ring})` }} />
            )}
            {showCursor && <Cursor x={vx(cx)} y={vy(cy)} press={press} />}
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
}

/* 10 ─ End card */
function End({ s }) {
  const f = useCurrentFrame();
  const { width: W, height: H, fps } = useVideoConfig();
  const a = sp(f, fps, 16);
  const b = sp(f - 10, fps, 18);
  const c = sp(f - 12, fps, 18);
  const l = sp(f - Math.max(4, wordAt(s, /^explore/i, 8) - 2), fps, 15);
  const cam = { position: [0, 2.6, 13.5], fov: 30, look: [0, 1.9, 0] };
  const happy = [CROWD[1], CROWD[2], CROWD[4], CROWD[5]];
  return (
    <AbsoluteFill>
      <Glow items={[{ x: W * 0.25, y: H * 0.3, r: 300, c: C.r1, o: 0.07 }, { x: W * 0.5, y: H * 0.3, r: 300, c: C.r3, o: 0.07 }, { x: W * 0.75, y: H * 0.3, r: 300, c: C.r5, o: 0.09 }]} />
      <div style={{ position: "absolute", left: 0, top: -20 }}>
        <Stage width={W} height={540} cam={cam} shadow={0.15}>
          <Mark appear={interpolate(f, [0, 20], [0.3, 1], clamp)} y={2.2} scale={1.15} />
          {happy.map((p, i) => <Person key={i} {...p} x={[-4.2, -2.6, 2.6, 4.2][i]} z={-0.4} s={0.82} mood={1} pop={sp(f - 4 - i * 3, fps, 12)} />)}
        </Stage>
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: 500, textAlign: "center" }}>
        <div style={{ font: `800 190px/0.9 ${F.display}`, letterSpacing: "-0.04em", color: C.ink, opacity: a, transform: `scale(${0.9 + 0.1 * a})` }}>écoute</div>
        <div style={{ font: `600 54px ${F.display}`, color: C.ink, marginTop: 16, opacity: b, letterSpacing: "-0.02em" }}>Every review, heard.</div>
        <div style={{ opacity: c, marginTop: 34 }}>
          <div style={{ font: `500 28px ${F.body}`, color: C.ink2 }}>Designed and built by</div>
          <div style={{ font: `700 46px ${F.display}`, color: C.ink, letterSpacing: "-0.02em" }}>Narpat Ganwliya</div>
          <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap", marginTop: 22, padding: "0 70px" }}>
            {["Python", "SQL", "Machine learning", "AI agents", "GitHub Actions"].map((t) => <Pill key={t} size={22}>{t}</Pill>)}
          </div>
          <div style={{ marginTop: 26, opacity: l, transform: `translateY(${(1 - l) * 16}px) scale(${0.94 + 0.06 * l})` }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 12, background: C.cobalt, color: "#fff", borderRadius: 999, padding: "14px 26px",
              font: `600 27px ${F.body}`, boxShadow: `0 18px 36px -16px ${C.cobalt}` }}>
              <Icon name="link" size={28} color="#fff" stroke={2.4} />{SITE_URL}
            </span>
            <div style={{ font: `600 24px ${F.body}`, color: C.ink, marginTop: 12 }}>Explore the live website: link in the post</div>
          </div>
          <div style={{ font: `500 19px/1.35 ${F.body}`, color: C.ink3, marginTop: 14, padding: "0 90px" }}>Independent portfolio project, not affiliated with or endorsed by the brands shown. Based on public app reviews; estimates come from a statistical model. {data.credits || "Voice: ElevenLabs."}</div>
        </div>
      </div>
    </AbsoluteFill>
  );
}

const SCENES = { hook: Hook, intro: Intro, stream: Stream, understand: Understand, deliveroo: Deliveroo, agent: Agent, brief: Brief, improve: Improve, site: Site, cta: End };

export function Film({ captions = true }) {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ fontFamily: F.body }}>
      <Paper />
      {data.scenes.map((s, idx) => {
        const Comp = SCENES[s.id];
        const local = frame - s.start;
        const first = idx === 0, last = idx === data.scenes.length - 1;
        const fin = first ? 1 : ramp(local, 0, 12);
        const fout = last ? 1 : 1 - ramp(local, s.frames - 8, s.frames, IO);
        const blur = (1 - fin) * 10 + (1 - fout) * 8;
        const zoom = 1 + (1 - fin) * 0.04 + interpolate(local, [0, s.frames], [0, 0.015], clamp);
        return (
          <Sequence key={s.id} from={s.start} durationInFrames={s.frames + (last ? 0 : 6)} name={s.id}>
            <AbsoluteFill style={{ opacity: Math.min(fin, fout), filter: blur > 0.05 ? `blur(${blur}px)` : undefined, transform: `scale(${zoom})` }}>
              <Comp s={s} />
            </AbsoluteFill>
          </Sequence>
        );
      })}
      {captions && <Captions captions={data.captions} />}
    </AbsoluteFill>
  );
}
