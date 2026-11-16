import React, { useLayoutEffect, useMemo } from "react";
import { ThreeCanvas } from "@remotion/three";
import { useThree } from "@react-three/fiber";
import { useCurrentFrame } from "remotion";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { C, mix, moodColor } from "./theme.js";

/* Original clay-style 3D characters and objects for the Écoute film. */

export const SKINS = ["#F2C6A4", "#D69E78", "#A66E4C", "#6E452E", "#F6D8C0", "#C4875F", "#E8B48E"];
export const HAIRS = ["#2A1C15", "#3A291E", "#C99A5B", "#141318", "#7B4628", "#5A3A2A", "#1E2230"];
const clamp01 = (x) => Math.max(0, Math.min(1, x));

/* ---------- shared geometry (built once) ---------- */
const G = {
  head: new THREE.SphereGeometry(0.6, 48, 48),
  hairCap: new THREE.SphereGeometry(0.625, 48, 24, 0, Math.PI * 2, 0, Math.PI * 0.38),
  hairShort: new THREE.SphereGeometry(0.618, 48, 24, 0, Math.PI * 2, 0, Math.PI * 0.32),
  bun: new THREE.SphereGeometry(0.21, 24, 24),
  eye: new THREE.SphereGeometry(0.075, 20, 20),
  glint: new THREE.SphereGeometry(0.024, 10, 10),
  brow: new THREE.CapsuleGeometry(0.032, 0.17, 4, 10),
  frown: new THREE.TorusGeometry(0.14, 0.034, 12, 32, Math.PI),
  smile: new THREE.TorusGeometry(0.2, 0.036, 12, 40, Math.PI),
  openSmile: new THREE.CircleGeometry(0.2, 40, Math.PI, Math.PI),
  shout: new THREE.CircleGeometry(0.11, 32),
  cheek: new THREE.SphereGeometry(0.1, 20, 20),
  body: new THREE.CapsuleGeometry(0.5, 0.5, 10, 28),
  arm: new THREE.CapsuleGeometry(0.13, 0.42, 8, 16),
  hand: new THREE.SphereGeometry(0.14, 20, 16),
  leg: new THREE.CapsuleGeometry(0.14, 0.3, 8, 16),
  shoe: new THREE.SphereGeometry(0.16, 20, 16),
  mark: new THREE.CapsuleGeometry(0.035, 0.16, 4, 10),
};
function starShape(outer = 0.5, inner = 0.21) {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = Math.PI / 2 + (i * Math.PI) / 5;
    const r = i % 2 ? inner : outer;
    const p = [Math.cos(a) * r, Math.sin(a) * r];
    i ? s.lineTo(...p) : s.moveTo(...p);
  }
  s.closePath();
  return s;
}
const STAR = (() => {
  const g = new THREE.ExtrudeGeometry(starShape(), { depth: 0.16, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.05, bevelSegments: 5, curveSegments: 2 });
  g.center();
  return g;
})();

/* ---------- camera + studio ---------- */
function LookAt({ target }) {
  const { camera } = useThree();
  useLayoutEffect(() => {
    camera.lookAt(...target);
    camera.updateProjectionMatrix();
  });
  return null;
}

/** A transparent 3D stage: the page's white paper shows through, only soft shadows are drawn. */
export function Stage({ width, height, cam = { position: [0, 2.4, 12], fov: 30, look: [0, 1.4, 0] }, shadow = 0.16, children, clipping = false }) {
  return (
    <ThreeCanvas width={Math.round(width)} height={Math.round(height)} shadows flat dpr={1}
      gl={{ alpha: true, antialias: true, preserveDrawingBuffer: true }}
      camera={{ position: cam.position, fov: cam.fov, near: 0.1, far: 100 }}
      onCreated={(s) => { if (clipping) s.gl.localClippingEnabled = true; }}>
      <LookAt target={cam.look} />
      <hemisphereLight args={["#ffffff", "#e2e6ee", 1.25]} />
      <directionalLight position={[5, 10, 8]} intensity={2.1} castShadow
        shadow-mapSize-width={2048} shadow-mapSize-height={2048}
        shadow-camera-left={-10} shadow-camera-right={10} shadow-camera-top={10} shadow-camera-bottom={-10}
        shadow-camera-near={0.5} shadow-camera-far={40} shadow-bias={-0.0004} />
      <directionalLight position={[-8, 4, 5]} intensity={0.55} color="#e3e9ff" />
      <directionalLight position={[0, 6, -9]} intensity={1.2} color="#ffffff" />
      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[60, 60]} />
        <shadowMaterial transparent opacity={shadow} />
      </mesh>
      {children}
    </ThreeCanvas>
  );
}

/** Screen position of a 3D point for HTML labels, using the same camera as <Stage>. */
export function projector(cam, width, height) {
  const c = new THREE.PerspectiveCamera(cam.fov, width / height, 0.1, 100);
  c.position.set(...cam.position);
  c.lookAt(...cam.look);
  c.updateMatrixWorld();
  c.updateProjectionMatrix();
  return (x, y, z) => {
    const v = new THREE.Vector3(x, y, z).project(c);
    return [((v.x + 1) / 2) * width, ((1 - v.y) / 2) * height];
  };
}

/* ---------- a customer ---------- */
export function Person({ x = 0, z = 0, s = 1, mood = 0, skin = SKINS[0], hair = HAIRS[0], style = 0, phase = 0, pop = 1, ry = 0, shirt: shirtOverride, stars = true }) {
  const frame = useCurrentFrame();
  const t = frame / 30 + phase * 3.1;
  const m = clamp01(mood);
  const angry = clamp01(1 - m / 0.42);
  const happy = clamp01((m - 0.55) / 0.4);
  const shirt = shirtOverride || moodColor(m);
  const headCol = mix(skin, "#F0806C", angry * 0.28);
  const jump = happy > 0.5 ? Math.max(0, Math.sin(t * 5.5)) * 0.32 * happy : 0;
  const bob = Math.sin(t * 2.1) * 0.035;
  const shake = angry * Math.sin(t * 26) * 0.03;
  const sc = s * Math.max(0.001, pop);
  const tilt = angry * 0.5;
  const frownS = clamp01((0.5 - m) / 0.25) * (angry > 0.65 ? 0 : 1);
  const shoutS = clamp01((angry - 0.65) / 0.2);
  const smileS = clamp01((m - 0.45) / 0.25);
  const openS = clamp01((m - 0.78) / 0.15);
  const squint = 1 - happy * 0.5;
  const mat = (color, rough = 0.6) => <meshStandardMaterial color={color} roughness={rough} metalness={0} />;

  return (
    <group position={[x + shake, jump + bob, z]} scale={[sc, sc, sc]} rotation={[0, ry + Math.sin(t * 0.6) * 0.18, 0]}>
      {[-0.2, 0.2].map((lx) => (
        <group key={lx}>
          <mesh geometry={G.leg} position={[lx, 0.36, 0]} castShadow>{mat("#2B303C")}</mesh>
          <mesh geometry={G.shoe} position={[lx, 0.11, 0.07]} scale={[1, 0.68, 1.35]} castShadow>{mat("#FBFBFB", 0.45)}</mesh>
        </group>
      ))}
      <mesh geometry={G.body} position={[0, 1.08, 0]} scale={[1.08, 1, 0.92]} castShadow>{mat(shirt, 0.66)}</mesh>
      {[-1, 1].map((side) => {
        const up = happy * 2.45;
        const wave = happy * Math.sin(t * 7 + side) * 0.28;
        const fist = angry * (0.95 + Math.sin(t * 13 + side * 1.7) * 0.28);
        return (
          <group key={side} position={[side * 0.56, 1.38, 0]} rotation={[-fist * 1.15, 0, side * (0.2 + up + wave)]}>
            <mesh geometry={G.arm} position={[0, -0.32, 0]} castShadow>{mat(shirt, 0.66)}</mesh>
            <mesh geometry={G.hand} position={[0, -0.64, 0]} castShadow>{mat(skin, 0.55)}</mesh>
          </group>
        );
      })}
      <group position={[0, 2.1, 0]} rotation={[angry * 0.1 - happy * 0.1, 0, Math.sin(t * 1.3) * 0.06]}>
        <mesh geometry={G.head} castShadow>
          <meshPhysicalMaterial color={headCol} roughness={0.52} clearcoat={0.18} clearcoatRoughness={0.6} />
        </mesh>
        {style !== 4 && <mesh geometry={style === 3 ? G.hairShort : G.hairCap} rotation={[-0.46, 0, style === 2 ? 0.28 : 0]} castShadow>{mat(hair, 0.7)}</mesh>}
        {style === 1 && <mesh geometry={G.bun} position={[0, 0.5, -0.38]} castShadow>{mat(hair, 0.7)}</mesh>}
        {style === 4 && (
          <>
            <mesh geometry={G.hairCap} rotation={[-0.2, 0, 0]} scale={1.03} castShadow>{mat(C.cobalt, 0.75)}</mesh>
            <mesh geometry={G.bun} position={[0, 0.66, -0.1]} scale={0.7} castShadow>{mat("#FFFFFF", 0.8)}</mesh>
          </>
        )}
        {[-1, 1].map((side) => (
          <group key={side}>
            <group position={[side * 0.2, 0.03, 0.54]} scale={[1, squint, 1]}>
              <mesh geometry={G.eye}>{mat("#1B1C22", 0.25)}</mesh>
              <mesh geometry={G.glint} position={[0.026, 0.03, 0.06]}><meshBasicMaterial color="#ffffff" /></mesh>
            </group>
            <mesh geometry={G.brow} position={[side * 0.21, 0.22 + happy * 0.04 - angry * 0.03, 0.535]}
              rotation={[0, 0, Math.PI / 2 + side * tilt]}>{mat(hair === "#E6E1DA" ? "#8A7A6A" : "#2A221E", 0.6)}</mesh>
            <mesh geometry={G.cheek} position={[side * 0.34, -0.09, 0.45]} scale={[1, 0.62, 0.35]}>
              <meshStandardMaterial color="#FF8A99" transparent opacity={happy * 0.75} roughness={0.8} />
            </mesh>
          </group>
        ))}
        <mesh geometry={G.frown} position={[0, -0.25, 0.555]} scale={[frownS, frownS, 1]}>{mat("#2A1E20", 0.5)}</mesh>
        <mesh geometry={G.shout} position={[0, -0.24, 0.565]} scale={[shoutS, shoutS * 0.75, 1]}>{mat("#4A1D24", 0.6)}</mesh>
        <group position={[0, -0.08, 0.565]} rotation={[0, 0, Math.PI]} scale={[smileS, smileS, 1]}>
          <mesh geometry={G.smile}>{mat("#2A1E20", 0.5)}</mesh>
        </group>
        <mesh geometry={G.openSmile} position={[0, -0.08, 0.57]} scale={[openS * 0.98, openS * 0.98, 1]}>{mat("#4A1D24", 0.6)}</mesh>
        {angry > 0.5 && [0, 1, 2].map((i) => {
          const a = 0.35 + i * 0.5;
          const pulse = 1 + Math.sin(t * 9 + i) * 0.12;
          return (
            <mesh key={i} geometry={G.mark} position={[0.55 + Math.cos(a) * 0.32, 0.55 + Math.sin(a) * 0.32, 0.25]}
              rotation={[0, 0, a - Math.PI / 2]} scale={(angry - 0.5) * 2 * pulse}>{mat(C.r1, 0.5)}</mesh>
          );
        })}
        {stars && happy > 0.4 && [0, 1].map((i) => (
          <mesh key={i} geometry={STAR} position={[(i ? 0.62 : -0.66), 0.82 + Math.sin(t * 3 + i) * 0.08, 0.1]}
            rotation={[0, t * 2 + i, 0]} scale={0.32 * (happy - 0.4) / 0.6}>
            <meshPhysicalMaterial color={C.r3} metalness={0.3} roughness={0.3} clearcoat={1} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

/** A row of customers standing on the white floor. */
export const CROWD = [
  { x: -4.1, z: -0.6, s: 0.92, skin: SKINS[1], hair: HAIRS[0], style: 0, phase: 0.1 },
  { x: -2.7, z: 0.35, s: 1.0, skin: SKINS[4], hair: HAIRS[2], style: 1, phase: 0.6 },
  { x: -1.3, z: -0.4, s: 0.95, skin: SKINS[3], hair: HAIRS[3], style: 3, phase: 1.2 },
  { x: 0.05, z: 0.5, s: 1.05, skin: SKINS[0], hair: HAIRS[4], style: 2, phase: 1.9 },
  { x: 1.45, z: -0.45, s: 0.97, skin: SKINS[2], hair: HAIRS[1], style: 4, phase: 2.4 },
  { x: 2.8, z: 0.3, s: 1.0, skin: SKINS[5], hair: HAIRS[5], style: 0, phase: 2.9 },
  { x: 4.15, z: -0.55, s: 0.92, skin: SKINS[6], hair: HAIRS[6], style: 1, phase: 3.5 },
];

/* ---------- the Écoute mark: from 1★ (red) to 5★ (green) ---------- */
const ARCS = [0.55, 0.92, 1.29].map((r) => new THREE.TorusGeometry(r, 0.13, 24, 96, 1.75));
const DOT = new THREE.SphereGeometry(0.27, 40, 40);
export function Mark({ appear = 1, y = 1.6, scale = 1 }) {
  const frame = useCurrentFrame();
  const t = frame / 30;
  const cols = [C.r1, C.r3, C.r5];
  return (
    <group position={[0, y + Math.sin(t * 1.6) * 0.06, 0]} rotation={[0, Math.sin(t * 0.9) * 0.32, 0]} scale={scale}>
      <mesh geometry={DOT} scale={clamp01(appear * 4)} castShadow>
        <meshPhysicalMaterial color={C.ink} roughness={0.3} clearcoat={1} clearcoatRoughness={0.2} />
      </mesh>
      {ARCS.map((g, i) => {
        const a = clamp01(appear * 4 - 1 - i * 0.7);
        const glow = Math.max(0, Math.sin(t * 3.2 - i * 0.9)) * 0.35;
        return (
          <mesh key={i} geometry={g} rotation={[0, 0, -0.875]} scale={[a, a, a]} castShadow>
            <meshPhysicalMaterial color={cols[i]} emissive={cols[i]} emissiveIntensity={0.08 + glow} roughness={0.32} clearcoat={1} clearcoatRoughness={0.15} />
          </mesh>
        );
      })}
    </group>
  );
}

/* ---------- 3D columns ---------- */
const boxCache = new Map();
const roundedBox = (w, d) => {
  const k = `${w}|${d}`;
  if (!boxCache.has(k)) boxCache.set(k, new RoundedBoxGeometry(w, 1, d, 5, Math.min(w, d) * 0.16));
  return boxCache.get(k);
};
/** bars: [{x, z?, h, color, w?, d?}] — h is the current height in world units */
export function Columns({ bars }) {
  return bars.map((b, i) => {
    const h = Math.max(0.02, b.h);
    return (
      <mesh key={i} geometry={roundedBox(b.w || 0.8, b.d || 0.8)} position={[b.x, h / 2, b.z || 0]} scale={[1, h, 1]} castShadow>
        <meshPhysicalMaterial color={b.color} roughness={0.42} clearcoat={0.35} clearcoatRoughness={0.4} emissive={b.color} emissiveIntensity={b.glow || 0} />
      </mesh>
    );
  });
}

/* ---------- five 3D stars, filled to a rating ---------- */
export function StarRow({ value = 0, y = 4.2, gap = 1.2, scale = 1 }) {
  const frame = useCurrentFrame();
  const stars = [0, 1, 2, 3, 4];
  const gold = useMemo(() => stars.map(() => new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0)), []);
  const grey = useMemo(() => stars.map(() => new THREE.Plane(new THREE.Vector3(1, 0, 0), 0)), []);
  return stars.map((i) => {
    const x = (i - 2) * gap * scale;
    const fill = clamp01(value - i);
    const cut = x - 0.55 * scale + fill * 1.1 * scale;
    gold[i].constant = cut;
    grey[i].constant = -cut;
    const bob = Math.sin(frame / 18 + i * 0.7) * 0.05;
    return (
      <group key={i} position={[x, y + bob, 0]} scale={scale * 1.1}>
        <mesh geometry={STAR} castShadow>
          <meshPhysicalMaterial color={C.r3} metalness={0.25} roughness={0.28} clearcoat={1} clearcoatRoughness={0.1} clippingPlanes={[gold[i]]} />
        </mesh>
        <mesh geometry={STAR} castShadow>
          <meshPhysicalMaterial color="#E3E6EC" roughness={0.45} clearcoat={0.6} clippingPlanes={[grey[i]]} />
        </mesh>
      </group>
    );
  });
}
