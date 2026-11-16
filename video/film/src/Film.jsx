import React from "react";
import { AbsoluteFill, Sequence, interpolate, spring, useCurrentFrame, useVideoConfig, Easing } from "remotion";
import { C, F, RATING, loadFonts, mix } from "./theme.js";
import { Paper, Grain, Captions, ReviewCard, Headline, Pill, StarsInline, Bubble, Avatar, clamp } from "./ui.jsx";
import { Stage, Person, CROWD, Mark, Columns, StarRow, projector } from "./Clay.jsx";
import data from "./data.json";

loadFonts();
const ease = Easing.bezier(0.16, 1, 0.3, 1);
const sp = (f, fps, d = 16, m = 0.9) => spring({ frame: f, fps, config: { damping: d, mass: m } });
const TOPICS = ["App reliability", "Login & access", "Device compatibility", "Speed & performance", "Ease of use & design",
  "Features", "Payments & billing", "Price & fees", "Customer service", "Account management", "Orders & delivery",
  "Core service quality", "Trust & security", "Notifications & ads", "Loyalty & rewards"];
const wordAt = (s, rx, fallback) => {
  const w = (s.words || []).find((x) => rx.test(x.w));
  return w ? w.f : fallback;
};
const Glow = ({ items }) => items.map((g, i) => (
  <div key={i} style={{ position: "absolute", left: g.x - g.r, top: g.y - g.r, width: g.r * 2, height: g.r * 2, borderRadius: "50%",
    background: g.c, opacity: g.o ?? 0.14, filter: "blur(100px)" }} />
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
  const popAt = (i) => sp(f + 40 - [0, 3, 1, 5, 2, 7, 4][i] * 3, fps, 12, 0.8);
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
                {items.map((r, i) => <ReviewCard key={i} r={r} w={390} dim={dim} />)}
              </div>
            );
          })}
        </div>
      </AbsoluteFill>
      <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: 560, background: `linear-gradient(${C.paper} 55%, rgba(245,246,248,0))` }} />
      <div style={{ position: "absolute", left: 72, top: 70 }}>
        <div style={{ font: `800 176px/0.88 ${F.display}`, letterSpacing: "-0.05em", color: C.ink, fontVariantNumeric: "tabular-nums" }}>{count.toLocaleString("en-US")}</div>
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
        const t = interpolate(f, [i * 1.5, 18 + i * 1.5], [0, 1], { ...clamp, easing: Easing.in(Easing.cubic) });
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
        <div style={{ font: `800 210px/0.9 ${F.display}`, letterSpacing: "-0.055em", color: C.ink }}>écoute</div>
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

/* 3 ─ Scope: the phone feed and 41 brands; named brands light up as they are spoken */
function Scope({ s }) {
  const f = useCurrentFrame();
  const { width: W, height: H, fps } = useVideoConfig();
  const named = { "BNP Paribas": wordAt(s, /Paribas|BNP/i, 40), Orange: wordAt(s, /Orange/i, 55), Decathlon: wordAt(s, /Decathlon/i, 70), Deliveroo: wordAt(s, /Deliveroo/i, 85) };
  const head = sp(f, fps, 18);
  const phoneIn = sp(f - 4, fps, 16);
  let k = 0;
  return (
    <AbsoluteFill>
      <Glow items={[{ x: W * 0.22, y: H * 0.55, r: 320, c: C.cobalt, o: 0.09 }, { x: W * 0.75, y: H * 0.5, r: 360, c: C.r3, o: 0.08 }]} />
      <Headline appear={head} size={86} sub="Every new review on Google Play and the App Store">{data.stats.brands} brands, {data.stats.sectors} sectors</Headline>
      <div style={{ position: "absolute", left: 72, top: 360, perspective: 1600 }}>
        <div style={{ width: 330, height: 690, borderRadius: 54, background: C.ink, padding: 12, boxShadow: "0 50px 80px -30px rgba(20,22,40,.45), 0 20px 30px -20px rgba(20,22,40,.3)",
          transform: `rotateY(${18 - phoneIn * 4}deg) rotateX(5deg) translateY(${(1 - phoneIn) * 80}px)`, opacity: phoneIn }}>
          <div style={{ width: "100%", height: "100%", borderRadius: 44, background: "#F7F8FA", overflow: "hidden", position: "relative" }}>
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 92, background: "#fff", borderBottom: `1px solid ${C.line}`, zIndex: 2, padding: "40px 22px 0" }}>
              <div style={{ font: `700 26px ${F.display}`, color: C.ink }}>Reviews</div>
            </div>
            <div style={{ position: "absolute", top: 104, left: 14, right: 14, display: "flex", flexDirection: "column", gap: 12, transform: `translateY(${-f * 1.6}px)` }}>
              {data.wall.slice(10, 26).map((r, i) => <ReviewCard key={i} r={r} w={278} />)}
            </div>
          </div>
        </div>
      </div>
      <div style={{ position: "absolute", left: 456, top: 352, width: 556, display: "flex", flexWrap: "wrap", columnGap: 22, rowGap: 12 }}>
        {data.sectors.map((sec) => (
          <div key={sec.name} style={{ width: sec.brands.length > 2 ? "100%" : "calc(50% - 11px)" }}>
            <div style={{ font: `600 18px ${F.body}`, color: C.ink3, marginBottom: 6 }}>{sec.name}</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
              {sec.brands.map((b) => {
                const a = sp(f - 6 - (k++) * 0.9, fps, 15);
                const hit = named[b] != null && f >= named[b] - 3;
                const h = hit ? sp(f - named[b] + 3, fps, 11, 0.7) : 0;
                return (
                  <span key={b} style={{ display: "inline-block", opacity: a, transform: `translateY(${(1 - a) * 18}px) scale(${1 + h * 0.14})`, zIndex: hit ? 2 : 1,
                    background: hit ? C.cobalt : C.card, color: hit ? "#fff" : C.ink, border: `1.5px solid ${hit ? C.cobalt : C.line}`, borderRadius: 999,
                    padding: "6px 13px", font: `600 19px ${F.body}`, boxShadow: hit ? `0 14px 28px -10px ${C.cobalt}` : "0 4px 12px -8px rgba(28,34,52,.3)" }}>{b}</span>
                );
              })}
            </div>
          </div>
        ))}
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
      <div style={{ position: "absolute", left: 72, top: 372, perspective: 1600 }}>
        <div style={{ transform: `rotateX(${10 - card * 4}deg) rotateY(-7deg) translateY(${(1 - card) * 60}px)`, opacity: card, position: "relative" }}>
          <div style={{ position: "absolute", top: -22, left: 30, zIndex: 3 }}><Pill size={22} bg={C.ink} color="#fff" border={C.ink}>Deliveroo</Pill></div>
          <div style={{ width: 936, background: C.card, borderRadius: 34, padding: "44px 48px 40px", border: `1px solid ${C.line}`,
            boxShadow: "0 40px 70px -30px rgba(28,34,52,.4)", position: "relative", overflow: "hidden" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 14 }}>
              <StarsInline n={r.r} size={40} /><span style={{ font: `500 26px ${F.body}`, color: C.ink3 }}>{r.src}</span>
            </div>
            <div lang="fr" style={{ font: `500 40px/1.38 ${F.body}`, color: C.ink }}><Highlighted text={r.t} progress={scan} /></div>
            <div style={{ position: "absolute", left: 0, right: 0, top: `${scan * 100}%`, height: 90, transform: "translateY(-50%)", opacity: scan > 0 && scan < 1 ? 1 : 0,
              background: `linear-gradient(to bottom, rgba(47,77,245,0), rgba(47,77,245,.16) 50%, rgba(47,77,245,0))`, borderTop: `2px solid ${C.cobalt}` }} />
          </div>
        </div>
      </div>
      <div style={{ position: "absolute", left: 72, top: 820, width: 936, display: "flex", flexWrap: "wrap", gap: 10 }}>
        {TOPICS.map((t, i) => {
          const a = sp(f - 10 - i * 1.3, fps, 15);
          const lit = hot[t] != null && scan >= 1;
          const l = lit ? sp(f - 54 - (t === "Customer service" ? 8 : 0), fps, 11, 0.7) : 0;
          return (
            <span key={t} style={{ position: "relative", opacity: a, transform: `translateY(${(1 - a) * 16}px) scale(${1 + l * 0.12})`, zIndex: lit ? 2 : 1,
              background: lit ? (t === "Customer service" ? C.r2 : C.r1) : C.card, color: lit ? "#fff" : C.ink2, border: `1.5px solid ${lit ? "transparent" : C.line}`,
              borderRadius: 999, padding: "8px 16px", font: `600 22px ${F.body}`, boxShadow: lit ? "0 14px 26px -12px rgba(238,65,54,.7)" : "none" }}>
              {t}
              {lit && <span style={{ display: "inline-block", marginLeft: 10, background: "rgba(255,255,255,.95)", color: C.ink, borderRadius: 999, padding: "1px 10px",
                font: `800 21px ${F.display}`, transform: `scale(${l})` }}>−{hot[t].toFixed(2)}★</span>}
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
        <Pill size={23}><span style={{ color: C.r5 }}>★</span> {D.store.toFixed(1)} on Google Play, all-time</Pill>
        <Pill size={23} bg={mix(C.r1, "#ffffff", 0.88)} color={C.r1} border={mix(C.r1, "#ffffff", 0.6)} style={{ opacity: interpolate(f, [20, 34], [0, 1], clamp) }}>
          ★ {D.avg.toFixed(2)} in reviews from the last 60 days
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
                opacity: grow(i), letterSpacing: "-0.02em" }}>−{d.lost.toFixed(2)}★</div>
              <div style={{ position: "absolute", left: lx, top: ly + 8, width: 210, transform: "translateX(-50%)", textAlign: "center",
                font: `${i ? 500 : 700} 23px/1.25 ${F.body}`, color: i ? C.ink2 : C.ink, opacity: grow(i) }}>{d.label}</div>
            </React.Fragment>
          );
        })}
      </div>
    </AbsoluteFill>
  );
}

/* 6 ─ E.Leclerc: the spike, and the agent's investigation */
function Leclerc({ s }) {
  const f = useCurrentFrame();
  const { width: W, height: H, fps } = useVideoConfig();
  const L = data.leclerc;
  const head = sp(f, fps, 18);
  const stageTop = 300, stageH = 520;
  const cam = { position: [0, 3.2, 17], fov: 28, look: [0, 1.9, 0] };
  const proj = projector(cam, W, stageH);
  const n = L.daily.length;
  const gap = 0.47;
  const xs = L.daily.map((_, i) => (i - (n - 1) / 2) * gap);
  const spikeI = L.daily.findIndex((d) => d.d === L.day);
  const hOf = (v) => (v / L.peak) * 4.4;
  const grow = (i) => (i === spikeI ? sp(f - 26, fps, 9, 1.2) : interpolate(f, [4 + i * 0.9, 16 + i * 0.9], [0, 1], { ...clamp, easing: ease }));
  const panel = sp(f - s.frames * 0.36, fps, 17);
  const steps = [
    { t: `Queried ${L.reviews.toLocaleString("en-US")} E.Leclerc reviews`, at: 0.42 },
    { t: `Read ${L.read} reviews posted around ${L.day.slice(8, 10)} Nov`, at: 0.53 },
    { t: `Cause found: app version ${L.version}, crash at launch and failed logins`, at: 0.66, key: true },
  ];
  const ev = (i) => sp(f - s.frames * (0.58 + i * 0.07), fps, 14);
  const [sx, sy] = proj(xs[spikeI], hOf(L.peak) * grow(spikeI) + 0.3, 0);
  const fmtD = (d) => `${+d.slice(8, 10)} ${["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][+d.slice(5, 7)]}`;
  return (
    <AbsoluteFill>
      <Glow items={[{ x: W * 0.62, y: H * 0.38, r: 340, c: C.r1, o: 0.11 }, { x: W * 0.4, y: H * 0.78, r: 320, c: C.cobalt, o: 0.08 }]} />
      <Headline appear={head} size={118} sub="Negative reviews per day">E.Leclerc</Headline>
      <div style={{ position: "absolute", left: 0, top: stageTop }}>
        <Stage width={W} height={stageH} cam={cam} shadow={0.18}>
          <Columns bars={L.daily.map((d, i) => ({ x: xs[i], h: hOf(d.n) * grow(i), w: 0.36, d: 0.6,
            color: i === spikeI ? C.r1 : d.n > L.usual * 2 ? C.r2 : "#CCD2DC", glow: i === spikeI ? 0.1 + Math.max(0, Math.sin(f / 5)) * 0.12 : 0 }))} />
        </Stage>
        <div style={{ position: "absolute", left: sx, top: sy, transform: `translate(-50%,-100%) scale(${grow(spikeI)})`, transformOrigin: "50% 100%" }}>
          <Pill size={26} bg={C.r1} color="#fff" border={C.r1}>×{L.ratio} on {fmtD(L.day)}</Pill>
        </div>
        {[0, n - 1].map((i) => {
          const [lx, ly] = proj(xs[i], 0, 0.55);
          return <div key={i} style={{ position: "absolute", left: lx, top: ly + 6, transform: "translateX(-50%)", font: `500 21px ${F.body}`, color: C.ink3, whiteSpace: "nowrap" }}>{fmtD(L.daily[i].d)}</div>;
        })}
      </div>
      {L.evidence.map((e, i) => (
        <div key={i} style={{ position: "absolute", left: i ? 150 : 72, top: i ? 470 : 340, width: i ? 470 : 430, opacity: ev(i),
          transform: `translateY(${(1 - ev(i)) * 30}px) rotate(${i ? 2 : -2}deg)` }}>
          <div lang="fr" style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 20, padding: "14px 18px", boxShadow: "0 18px 36px -16px rgba(28,34,52,.4)",
            font: `500 22px/1.32 ${F.body}`, color: C.ink }}>
            <div style={{ marginBottom: 4 }}><StarsInline n={1} size={20} /></div>“{e}”
          </div>
        </div>
      ))}
      <div style={{ position: "absolute", left: 72, right: 72, top: 836, opacity: panel, transform: `translateY(${(1 - panel) * 70}px)` }}>
        <div style={{ background: C.card, borderRadius: 30, border: `1.5px solid ${mix(C.cobalt, "#ffffff", 0.7)}`, padding: "24px 30px 26px",
          boxShadow: "0 40px 70px -34px rgba(47,77,245,.45)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 14 }}>
            <div style={{ width: 16, height: 16, borderRadius: 8, background: C.cobalt, boxShadow: `0 0 0 ${6 + Math.sin(f / 5) * 3}px ${mix(C.cobalt, "#ffffff", 0.8)}` }} />
            <div style={{ font: `700 32px ${F.display}`, color: C.ink, letterSpacing: "-0.02em" }}>Écoute agent</div>
            <div style={{ marginLeft: "auto" }}>
              {f > s.frames * 0.7
                ? <Pill size={20} bg={mix(C.r5, "#ffffff", 0.86)} color={C.r5} border={mix(C.r5, "#ffffff", 0.55)}>Cause found</Pill>
                : <Pill size={20} bg={C.cobaltSoft} color={C.cobalt} border={mix(C.cobalt, "#ffffff", 0.6)}>Investigating</Pill>}
            </div>
          </div>
          {steps.map((st, i) => {
            const a = sp(f - s.frames * st.at, fps, 16);
            return (
              <div key={i} style={{ display: "flex", gap: 14, alignItems: "flex-start", marginTop: 10, opacity: a, transform: `translateX(${(1 - a) * 24}px)` }}>
                <div style={{ width: 30, height: 30, borderRadius: 15, flex: "none", background: st.key ? C.r5 : C.cobalt, color: "#fff",
                  display: "grid", placeItems: "center", font: `700 18px ${F.body}`, marginTop: 2 }}>✓</div>
                <div style={{ font: `${st.key ? 600 : 500} 27px/1.3 ${F.body}`, color: st.key ? C.ink : C.ink2 }}>{st.t}</div>
              </div>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
}

/* 7 ─ Actions: what the companies could do, as assigned tickets */
const AVATAR = { "Mobile team": "mobile", QA: "qa", Operations: "ops", "Customer service": "support" };
function Actions({ s }) {
  const f = useCurrentFrame();
  const { width: W, height: H, fps } = useVideoConfig();
  const head = sp(f, fps, 18);
  const dvAt = wordAt(s, /Deliveroo/i, s.frames * 0.62);
  const starts = [10, 22, dvAt - 6, dvAt + 6];
  return (
    <AbsoluteFill>
      <Glow items={[{ x: W * 0.5, y: H * 0.5, r: 420, c: C.cobalt, o: 0.09 }]} />
      <Headline appear={head} size={92} sub="Recommended by the agent, ranked by stars at stake">What they could do</Headline>
      <div style={{ position: "absolute", left: 72, top: 372, width: 936, perspective: 1800 }}>
        {data.actions.map((a, i) => {
          const t = sp(f - starts[i], fps, 16);
          const done = sp(f - starts[i] - 20, fps, 12, 0.7);
          const tone = a.tone === 1 ? C.r1 : C.r2;
          return (
            <div key={i} style={{ marginBottom: 16, opacity: t, transform: `rotateX(7deg) rotateY(-5deg) translateX(${(1 - t) * 140}px)`, filter: `blur(${(1 - t) * 8}px)` }}>
              <div style={{ background: C.card, borderRadius: 28, border: `1px solid ${C.line}`, padding: "18px 24px", display: "grid",
                gridTemplateColumns: "92px 1fr", gap: 20, boxShadow: "0 30px 50px -28px rgba(28,34,52,.42)" }}>
                <div style={{ width: 92, height: 92, borderRadius: 26, background: mix(C.cobalt, "#ffffff", 0.9), display: "grid", placeItems: "center", overflow: "hidden" }}>
                  <Avatar name={AVATAR[a.team]} size={92} />
                </div>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span style={{ font: `800 28px ${F.display}`, color: C.ink, letterSpacing: "-0.01em" }}>{a.brand}</span>
                    <Pill size={19} bg={mix(tone, "#ffffff", 0.86)} color={tone} border={mix(tone, "#ffffff", 0.55)} style={{ boxShadow: "none" }}>{a.tag}</Pill>
                  </div>
                  <div style={{ font: `600 30px/1.25 ${F.body}`, color: C.ink, marginTop: 6 }}>{a.title}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10, font: `500 22px ${F.body}`, color: C.ink2 }}>
                    {a.team}
                    <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 8, color: C.cobalt, font: `600 22px ${F.body}`, opacity: done, transform: `scale(${0.7 + 0.3 * done})` }}>
                      <span style={{ width: 26, height: 26, borderRadius: 13, background: C.cobalt, color: "#fff", display: "grid", placeItems: "center", fontSize: 16 }}>✓</span> Assigned
                    </span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
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
        <div style={{ font: `500 30px/1.3 ${F.body}`, color: C.ink2, marginTop: 16, maxWidth: 900 }}>{D.brand}'s estimated recent rating if the {D.topics} complaint topics Écoute found stopped. Store rating: {D.store.toFixed(1)}★ all-time.</div>
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
          Background: {data.trend.brand}'s real weekly rating, {data.trend.from}★ to {data.trend.to}★ in {data.trend.weeks} weeks
        </div>
      )}
    </AbsoluteFill>
  );
}

/* 9 ─ End card */
function End({ s }) {
  const f = useCurrentFrame();
  const { width: W, height: H, fps } = useVideoConfig();
  const a = sp(f, fps, 16);
  const b = sp(f - 10, fps, 18);
  const c = sp(f - 22, fps, 18);
  const cam = { position: [0, 2.6, 13.5], fov: 30, look: [0, 1.9, 0] };
  const happy = [CROWD[1], CROWD[2], CROWD[4], CROWD[5]];
  return (
    <AbsoluteFill>
      <Glow items={[{ x: W * 0.25, y: H * 0.3, r: 300, c: C.r1, o: 0.07 }, { x: W * 0.5, y: H * 0.3, r: 300, c: C.r3, o: 0.07 }, { x: W * 0.75, y: H * 0.3, r: 300, c: C.r5, o: 0.09 }]} />
      <div style={{ position: "absolute", left: 0, top: 40 }}>
        <Stage width={W} height={560} cam={cam} shadow={0.15}>
          <Mark appear={interpolate(f, [0, 20], [0.3, 1], clamp)} y={2.2} scale={1.15} />
          {happy.map((p, i) => <Person key={i} {...p} x={[-4.2, -2.6, 2.6, 4.2][i]} z={-0.4} s={0.82} mood={1} pop={sp(f - 4 - i * 3, fps, 12)} />)}
        </Stage>
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: 590, textAlign: "center" }}>
        <div style={{ font: `800 200px/0.9 ${F.display}`, letterSpacing: "-0.055em", color: C.ink, opacity: a, transform: `scale(${0.9 + 0.1 * a})` }}>écoute</div>
        <div style={{ font: `600 54px ${F.display}`, color: C.ink, marginTop: 16, opacity: b, letterSpacing: "-0.02em" }}>Every review, heard.</div>
        <div style={{ opacity: c, marginTop: 34 }}>
          <div style={{ font: `500 28px ${F.body}`, color: C.ink2 }}>Designed and built by</div>
          <div style={{ font: `700 46px ${F.display}`, color: C.ink, letterSpacing: "-0.02em" }}>Narpat Ganwliya</div>
          <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap", marginTop: 22, padding: "0 70px" }}>
            {["Python", "SQL", "Machine learning", "AI agents", "GitHub Actions"].map((t) => <Pill key={t} size={22}>{t}</Pill>)}
          </div>
          <div style={{ font: `600 26px ${F.body}`, color: C.cobalt, marginTop: 22 }}>github.com/narpatganwliya7/Voice-of-the-Customer-AI</div>
          <div style={{ font: `500 19px/1.35 ${F.body}`, color: C.ink3, marginTop: 14, padding: "0 90px" }}>Independent portfolio project, not affiliated with or endorsed by the brands shown. Based on public app reviews; estimates come from a statistical model. Voice: ElevenLabs.</div>
        </div>
      </div>
    </AbsoluteFill>
  );
}

const SCENES = { hook: Hook, intro: Intro, scope: Scope, understand: Understand, deliveroo: Deliveroo, leclerc: Leclerc, actions: Actions, improve: Improve, cta: End };

export function Film({ captions = true }) {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ fontFamily: F.body }}>
      <Paper />
      {data.scenes.map((s, idx) => {
        const Comp = SCENES[s.id];
        const local = frame - s.start;
        const first = idx === 0, last = idx === data.scenes.length - 1;
        const fin = first ? 1 : interpolate(local, [0, 10], [0, 1], clamp);
        const fout = last ? 1 : interpolate(local, [s.frames - 8, s.frames], [1, 0], clamp);
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
      <Grain />
      {captions && <Captions captions={data.captions} />}
    </AbsoluteFill>
  );
}
