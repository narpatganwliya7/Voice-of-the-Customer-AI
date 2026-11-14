import React, { useMemo } from "react";
import { ThreeCanvas } from "@remotion/three";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import * as THREE from "three";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";

const lerpColor = (a, b, t) => new THREE.Color(a).lerp(new THREE.Color(b), t);

/** A clay-style emoji head. mood 0 = angry red, 1 = happy green. Original design. */
function Head({ x, y, z, scale = 1, mood, phase, frame }) {
  const bob = Math.sin(frame / 14 + phase) * 0.08;
  const shake = mood < 0.5 ? Math.sin(frame / 2.2 + phase) * 0.035 * (1 - mood * 2) : 0;
  const col = lerpColor("#ff4f5a", "#35d48f", mood);
  const smile = interpolate(mood, [0, 1], [-1, 1]);
  const browTilt = interpolate(mood, [0, 1], [0.55, -0.1]);
  return (
    <group position={[x + shake, y + bob, z]} scale={scale} rotation={[0, Math.sin(frame / 40 + phase) * 0.25, 0]}>
      <mesh>
        <sphereGeometry args={[1, 48, 48]} />
        <meshStandardMaterial color={col} roughness={0.55} metalness={0.05} emissive={col} emissiveIntensity={0.12} />
      </mesh>
      {[-0.36, 0.36].map((ex) => (
        <group key={ex}>
          <mesh position={[ex, 0.18, 0.9]}>
            <sphereGeometry args={[0.13, 24, 24]} />
            <meshStandardMaterial color="#1a1014" roughness={0.3} />
          </mesh>
          <mesh position={[ex, 0.48 + Math.abs(browTilt) * 0.03, 0.86]} rotation={[0, 0, ex < 0 ? -browTilt : browTilt]}>
            <boxGeometry args={[0.34, 0.07, 0.07]} />
            <meshStandardMaterial color="#1a1014" />
          </mesh>
        </group>
      ))}
      {/* mouth: half torus, flipped by mood */}
      <mesh position={[0, smile > 0 ? -0.22 : -0.45, 0.88]} rotation={[0, 0, smile > 0 ? Math.PI : 0]} scale={[1, Math.max(0.25, Math.abs(smile)), 1]}>
        <torusGeometry args={[0.32, 0.06, 12, 32, Math.PI]} />
        <meshStandardMaterial color="#1a1014" />
      </mesh>
    </group>
  );
}

export function Heads({ mood = 0, count = 7, width, height, spread = 1 }) {
  const frame = useCurrentFrame();
  const heads = useMemo(() => Array.from({ length: count }, (_, i) => {
    const a = (i / (count - 1) - 0.5) * Math.PI * 0.95;
    return { x: Math.sin(a) * 3.3 * spread, y: (i % 2 ? 0.9 : -0.6) + Math.cos(a) * 0.3, z: -Math.abs(Math.sin(a)) * 1.5, s: 0.62 + (i % 3) * 0.1, p: i * 1.7 };
  }), [count, spread]);
  return (
    <ThreeCanvas width={Math.round(width)} height={Math.round(height)} camera={{ position: [0, 0, 9], fov: 40 }}>
      <ambientLight intensity={0.55} />
      <directionalLight position={[3, 4, 6]} intensity={2.2} />
      <pointLight position={[-4, -2, 4]} intensity={20} color="#ffb547" />
      {heads.map((h, i) => (
        <Head key={i} x={h.x} y={h.y} z={h.z} scale={h.s} phase={h.p} frame={frame}
          mood={Math.min(1, Math.max(0, mood * 1.4 - (i % 4) * 0.1))} />
      ))}
    </ThreeCanvas>
  );
}

/** The AI agent: a glowing orb that reacts to its own voice. */
export function Orb({ level = 0, width, height, intensity = 1 }) {
  const frame = useCurrentFrame();
  const geo = useMemo(() => {
    const g = new THREE.IcosahedronGeometry(1.25, 24);
    g.deleteAttribute("normal");
    g.deleteAttribute("uv");
    return mergeVertices(g);  // shared vertices = smooth, liquid surface
  }, []);
  const base = useMemo(() => geo.attributes.position.array.slice(), [geo]);
  // displace vertices with smooth noise driven by voice level
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = base[i * 3], y = base[i * 3 + 1], z = base[i * 3 + 2];
    const n = Math.sin(x * 3.1 + frame / 6) * Math.cos(y * 2.7 - frame / 7) * Math.sin(z * 3.3 + frame / 9);
    const k = 1 + n * (0.05 + level * 0.22);
    pos.setXYZ(i, x * k, y * k, z * k);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  const s = 1 + level * 0.12;
  return (
    <ThreeCanvas width={Math.round(width)} height={Math.round(height)} camera={{ position: [0, 0, 6], fov: 40 }}>
      <ambientLight intensity={0.3} />
      <pointLight position={[2, 3, 4]} intensity={60 * intensity} color="#ffd59a" />
      <pointLight position={[-3, -2, 2]} intensity={30 * intensity} color="#ff7a3d" />
      <group rotation={[frame / 90, frame / 70, 0]} scale={s}>
        <mesh geometry={geo}>
          <meshStandardMaterial color="#ffb547" emissive="#ff8a1f" emissiveIntensity={0.55 + level * 0.9} roughness={0.25} metalness={0.2} />
        </mesh>
        <mesh scale={1.32}>
          <icosahedronGeometry args={[1.25, 1]} />
          <meshBasicMaterial color="#ffcf87" wireframe transparent opacity={0.18 + level * 0.25} />
        </mesh>
      </group>
    </ThreeCanvas>
  );
}
