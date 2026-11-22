import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Stars } from '@react-three/drei';
import * as THREE from 'three';
import { trackPoint } from './engine';
import { StaticScenery } from './StaticScenery';

export const HALF = 7.5;
type S = { x: number; y: number; z: number; angle: number };

export interface TrackData {
  samples: S[];
  minX: number; maxX: number; minZ: number; maxZ: number; minY: number;
  groundY: number;
  center: THREE.Vector3;
  showcase: THREE.Vector3;
  castle: THREE.Vector3;
  chapel: THREE.Vector3;
  span: number;
}

let cache: TrackData | null = null;
export function getTrackData(): TrackData {
  if (cache) return cache;
  const N = 500;
  const samples: S[] = [];
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity, minY = Infinity;
  for (let i = 0; i < N; i++) {
    const p = trackPoint(i / N);
    samples.push({ x: p.x, y: p.y, z: p.z, angle: p.angle });
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z); minY = Math.min(minY, p.y);
  }
  const groundY = minY - 0.35;
  const center = new THREE.Vector3((minX + maxX) / 2, groundY, (minZ + maxZ) / 2);
  cache = {
    samples, minX, maxX, minZ, maxZ, minY, groundY, center,
    span: Math.max(maxX - minX, maxZ - minZ),
    showcase: new THREE.Vector3(center.x, groundY, maxZ + 24),
    castle: new THREE.Vector3(minX - 30, groundY, center.z - 6),
    chapel: new THREE.Vector3(maxX + 26, groundY, center.z + 4),
  };
  return cache;
}

export function distToTrack(x: number, z: number) {
  const { samples } = getTrackData();
  let d = Infinity;
  for (let i = 0; i < samples.length; i += 3) {
    const s = samples[i];
    d = Math.min(d, (s.x - x) ** 2 + (s.z - z) ** 2);
  }
  return Math.sqrt(d);
}

function rng(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type V3 = [number, number, number];
function strip(samples: S[], f0: (s: S) => V3, f1: (s: S) => V3, color?: (i: number) => THREE.Color) {
  const n = samples.length;
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= n; i++) {
    const s = samples[i % n];
    pos.push(...f0(s), ...f1(s));
    if (color) { const c = color(i); col.push(c.r, c.g, c.b, c.r, c.g, c.b); }
  }
  for (let i = 0; i < n; i++) { const q = i * 2; idx.push(q, q + 1, q + 2, q + 1, q + 3, q + 2); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  if (color) g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
const lat = (s: S, d: number, y = 0): V3 => [s.x + Math.cos(s.angle) * d, s.y + y, s.z - Math.sin(s.angle) * d];

let glowTex: THREE.Texture | null = null;
export function getGlowTexture() {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.4, 'rgba(255,255,255,0.35)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  glowTex = new THREE.CanvasTexture(c);
  return glowTex;
}

function Track() {
  const td = getTrackData();
  const geos = useMemo(() => {
    const { samples, groundY } = td;
    const road = strip(samples, s => lat(s, HALF, 0.02), s => lat(s, -HALF, 0.02));
    const roadCol = new THREE.Color('#171923');
    const dash = new THREE.Color('#d9c9ef');
    const center = strip(samples, s => lat(s, 0.16, 0.05), s => lat(s, -0.16, 0.05), i => (Math.floor(i / 5) % 2 ? dash : roadCol));
    const orange = new THREE.Color('#ff7a1a');
    const purple = new THREE.Color('#8549dc');
    const curbDark = new THREE.Color('#282431');
    const inCurve = (i: number) => {
      const before = samples[(i - 1 + samples.length) % samples.length].angle;
      const after = samples[(i + 1) % samples.length].angle;
      return Math.abs(Math.atan2(Math.sin(after - before), Math.cos(after - before))) > 0.00015;
    };
    const curbC = (i: number) => !inCurve(i) ? curbDark : Math.floor(i / 3) % 2 ? orange : purple;
    const curbL = strip(samples, s => lat(s, HALF + 0.9, 0.09), s => lat(s, HALF - 0.1, 0.09), curbC);
    const curbR = strip(samples, s => lat(s, -HALF + 0.1, 0.09), s => lat(s, -HALF - 0.9, 0.09), curbC);
    const skirtL = strip(samples, s => lat(s, HALF + 0.9, 0.09), s => [...lat(s, HALF + 0.9)].map((v, k) => (k === 1 ? groundY : v)) as V3);
    const skirtR = strip(samples, s => lat(s, -HALF - 0.9, 0.09), s => [...lat(s, -HALF - 0.9)].map((v, k) => (k === 1 ? groundY : v)) as V3);
    return { road, center, curbL, curbR, skirtL, skirtR };
  }, [td]);

  const postsRef = useRef<THREE.InstancedMesh>(null);
  const railsRef = useRef<THREE.InstancedMesh>(null);
  const spikesRef = useRef<THREE.InstancedMesh>(null);
  const pillarRef = useRef<THREE.InstancedMesh>(null);

  const fence = useMemo(() => {
    const { samples } = td;
    const posts: { p: V3; a: number }[] = [];
    const rails: { p: V3; a: number; len: number; slope: number }[] = [];
    const step = 4;
    for (const side of [1, -1]) {
      for (let i = 0; i < samples.length; i += step) {
        const s = samples[i];
        const n = samples[(i + step) % samples.length];
        const a = lat(s, side * (HALF + 1.5));
        const b = lat(n, side * (HALF + 1.5));
        posts.push({ p: a, a: s.angle });
        const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
        const len = Math.hypot(dx, dz);
        rails.push({ p: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], a: Math.atan2(dx, dz), len, slope: Math.atan2(dy, len) });
      }
    }
    const pillars: { p: V3; h: number }[] = [];
    for (let i = 0; i < samples.length; i += 14) {
      const s = samples[i];
      const h = s.y - td.groundY;
      if (h > 1.4) { pillars.push({ p: lat(s, HALF - 1.5), h }); pillars.push({ p: lat(s, -HALF + 1.5), h }); }
    }
    return { posts, rails, pillars };
  }, [td]);

  useLayoutEffect(() => {
    const m = new THREE.Object3D();
    fence.posts.forEach((f, i) => {
      m.position.set(f.p[0], f.p[1] + 0.7, f.p[2]); m.rotation.set(0, f.a, 0); m.scale.set(1, 1, 1); m.updateMatrix();
      postsRef.current!.setMatrixAt(i, m.matrix);
      m.position.y = f.p[1] + 1.55; m.updateMatrix();
      spikesRef.current!.setMatrixAt(i, m.matrix);
    });
    fence.rails.forEach((r, i) => {
      for (let k = 0; k < 2; k++) {
        m.position.set(r.p[0], r.p[1] + (k ? 1.2 : 0.45), r.p[2]); m.rotation.set(0, r.a, 0); m.rotation.order = 'YXZ'; m.rotation.x = -r.slope;
        m.scale.set(1, 1, r.len); m.updateMatrix();
        railsRef.current!.setMatrixAt(i * 2 + k, m.matrix);
      }
    });
    fence.pillars.forEach((p, i) => {
      m.rotation.set(0, 0, 0); m.position.set(p.p[0], td.groundY + p.h / 2, p.p[2]); m.scale.set(1, p.h, 1); m.updateMatrix();
      pillarRef.current!.setMatrixAt(i, m.matrix);
    });
    [postsRef, spikesRef, railsRef, pillarRef].forEach(r => { if (r.current) r.current.instanceMatrix.needsUpdate = true; });
  }, [fence, td]);

  const start = trackPoint(0);
  const iron = <meshStandardMaterial color="#1a1222" metalness={0.7} roughness={0.45} />;
  return (
    <group>
      <mesh geometry={geos.road}>
        <meshStandardMaterial color="#2b2340" roughness={0.82} side={THREE.DoubleSide} />
      </mesh>
      <mesh geometry={geos.center}>
        <meshStandardMaterial vertexColors roughness={0.8} side={THREE.DoubleSide} />
      </mesh>
      <mesh geometry={geos.curbL}><meshStandardMaterial vertexColors roughness={0.6} side={THREE.DoubleSide} /></mesh>
      <mesh geometry={geos.curbR}><meshStandardMaterial vertexColors roughness={0.6} side={THREE.DoubleSide} /></mesh>
      <mesh geometry={geos.skirtL}><meshStandardMaterial color="#3a2a52" roughness={1} side={THREE.DoubleSide} /></mesh>
      <mesh geometry={geos.skirtR}><meshStandardMaterial color="#3a2a52" roughness={1} side={THREE.DoubleSide} /></mesh>
      <instancedMesh ref={postsRef} args={[undefined, undefined, fence.posts.length]}>
        <boxGeometry args={[0.12, 1.4, 0.12]} />{iron}
      </instancedMesh>
      <instancedMesh ref={spikesRef} args={[undefined, undefined, fence.posts.length]}>
        <coneGeometry args={[0.12, 0.35, 4]} />{iron}
      </instancedMesh>
      <instancedMesh ref={railsRef} args={[undefined, undefined, fence.rails.length * 2]}>
        <boxGeometry args={[0.06, 0.08, 1]} />{iron}
      </instancedMesh>
      <instancedMesh ref={pillarRef} args={[undefined, undefined, Math.max(1, fence.pillars.length)]}>
        <cylinderGeometry args={[0.7, 0.9, 1, 8]} />
        <meshStandardMaterial color="#4a3b5e" roughness={1} />
      </instancedMesh>
      {/* start gate */}
      <group position={[start.x, start.y, start.z]} rotation={[0, start.angle, 0]}>
        {Array.from({ length: 12 }).map((_, i) => (
          <mesh key={i} position={[-HALF + 0.5 + i, 0.06, (i % 2) * 0.5 - 0.25]}>
            <boxGeometry args={[1, 0.02, 0.5]} />
            <meshStandardMaterial color={i % 2 ? '#f2e8ff' : '#140e1c'} />
          </mesh>
        ))}
        {Array.from({ length: 12 }).map((_, i) => (
          <mesh key={`b${i}`} position={[-HALF + 0.5 + i, 0.06, ((i + 1) % 2) * 0.5 - 0.25]}>
            <boxGeometry args={[1, 0.02, 0.5]} />
            <meshStandardMaterial color={i % 2 ? '#140e1c' : '#f2e8ff'} />
          </mesh>
        ))}
        {[-1, 1].map(s => (
          <group key={s} position={[s * (HALF + 1), 0, 0]}>
            <mesh position={[0, 2.6, 0]}><boxGeometry args={[0.7, 5.2, 0.7]} /><meshStandardMaterial color="#3d2e52" roughness={1} /></mesh>
            <Pumpkin position={[0, 5.55, 0]} scale={1.1} />
          </group>
        ))}
        <mesh position={[0, 4.6, 0]}>
          <boxGeometry args={[2 * HALF + 2.6, 0.9, 0.3]} />
          <meshStandardMaterial color="#ff7a1a" emissive="#ff4d00" emissiveIntensity={0.5} />
        </mesh>
        {Array.from({ length: 14 }).map((_, i) => (
          <mesh key={`c${i}`} position={[-HALF - 0.3 + i, 4.6, 0.16]}>
            <boxGeometry args={[0.45, 0.45, 0.02]} />
            <meshBasicMaterial color={i % 2 ? '#1a0f2e' : '#ffe3b8'} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

export function Pumpkin({ position, scale = 1, rotation = 0 }: { position: V3; scale?: number; rotation?: number }) {
  return (
    <group position={position} scale={scale} rotation={[0, rotation, 0]}>
      <mesh scale={[1, 0.78, 1]}>
        <sphereGeometry args={[0.5, 14, 10]} />
        <meshStandardMaterial color="#ff7a1a" emissive="#ff4800" emissiveIntensity={0.25} roughness={0.6} />
      </mesh>
      <mesh position={[0, 0.43, 0]}><cylinderGeometry args={[0.05, 0.08, 0.2, 6]} /><meshStandardMaterial color="#3b5a1e" /></mesh>
      {[-0.17, 0.17].map(x => (
        <mesh key={x} position={[x, 0.08, 0.44]} rotation={[Math.PI / 2, 0, 0]}>
          <coneGeometry args={[0.09, 0.05, 3]} />
          <meshBasicMaterial color="#ffd36b" toneMapped={false} />
        </mesh>
      ))}
      <mesh position={[0, -0.12, 0.45]}><boxGeometry args={[0.32, 0.07, 0.03]} /><meshBasicMaterial color="#ffd36b" toneMapped={false} /></mesh>
    </group>
  );
}

function DeadTree({ seed, position, scale }: { seed: number; position: V3; scale: number }) {
  const branches = useMemo(() => {
    const r = rng(seed);
    return Array.from({ length: 5 }).map(() => ({ y: 1.6 + r() * 2.2, a: r() * Math.PI * 2, tilt: 0.6 + r() * 0.6, len: 1 + r() * 1.4 }));
  }, [seed]);
  const mat = <meshStandardMaterial color="#1e1628" roughness={1} />;
  return (
    <group position={position} scale={scale}>
      <mesh position={[0, 2, 0]} rotation={[0.05, 0, 0.08]}><cylinderGeometry args={[0.12, 0.35, 4, 6]} />{mat}</mesh>
      {branches.map((b, i) => (
        <group key={i} position={[0, b.y, 0]} rotation={[0, b.a, 0]}>
          <mesh rotation={[0, 0, b.tilt]} position={[-Math.sin(b.tilt) * b.len / 2, Math.cos(b.tilt) * b.len / 2, 0]}>
            <cylinderGeometry args={[0.03, 0.09, b.len, 5]} />{mat}
          </mesh>
        </group>
      ))}
    </group>
  );
}

function Scatter() {
  const td = getTrackData();
  const data = useMemo(() => {
    const r = rng(1337);
    const pad = 45;
    const tombs: { p: V3; a: number; s: number; cross: boolean }[] = [];
    const trees: { p: V3; s: number; seed: number }[] = [];
    const pumpkins: { p: V3; s: number; a: number }[] = [];
    const avoid = [td.showcase, td.castle, td.chapel];
    let tries = 0;
    while ((tombs.length < 110 || trees.length < 22 || pumpkins.length < 26) && tries++ < 4000) {
      const x = td.minX - pad + r() * (td.maxX - td.minX + pad * 2);
      const z = td.minZ - pad + r() * (td.maxZ - td.minZ + pad * 2);
      const d = distToTrack(x, z);
      if (d < 10) continue;
      if (avoid.some(v => Math.hypot(v.x - x, v.z - z) < 13)) continue;
      const k = r();
      const p: V3 = [x, td.groundY, z];
      if (k < 0.65 && tombs.length < 110) tombs.push({ p, a: r() * 0.6 - 0.3 + Math.PI * (r() > 0.5 ? 1 : 0), s: 0.7 + r() * 0.6, cross: r() > 0.7 });
      else if (k < 0.82 && trees.length < 22 && d > 13) trees.push({ p, s: 0.9 + r() * 0.9, seed: Math.floor(r() * 1e6) });
      else if (pumpkins.length < 26 && d < 18) pumpkins.push({ p: [x, td.groundY + 0.35, z], s: 0.7 + r() * 0.9, a: r() * 6 });
    }
    return { tombs, trees, pumpkins };
  }, [td]);
  const stoneRef = useRef<THREE.InstancedMesh>(null);
  const crossRef = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const m = new THREE.Object3D();
    let si = 0, ci = 0;
    data.tombs.forEach(t => {
      m.position.set(t.p[0], t.p[1] + 0.6 * t.s, t.p[2]); m.rotation.set(0.08, t.a, 0.05); m.scale.setScalar(t.s); m.updateMatrix();
      if (t.cross) {
        crossRef.current!.setMatrixAt(ci++, m.matrix);
        m.position.y += 0.35 * t.s; m.scale.set(t.s * 2.6, t.s * 0.25, t.s); m.updateMatrix();
        crossRef.current!.setMatrixAt(ci++, m.matrix);
      } else stoneRef.current!.setMatrixAt(si++, m.matrix);
    });
    stoneRef.current!.count = si; crossRef.current!.count = ci;
    stoneRef.current!.instanceMatrix.needsUpdate = true; crossRef.current!.instanceMatrix.needsUpdate = true;
  }, [data]);
  return (
    <group>
      <instancedMesh ref={stoneRef} args={[undefined, undefined, 120]}>
        <boxGeometry args={[0.9, 1.2, 0.25]} />
        <meshStandardMaterial color="#6d6384" roughness={1} />
      </instancedMesh>
      <instancedMesh ref={crossRef} args={[undefined, undefined, 240]}>
        <boxGeometry args={[0.22, 1.5, 0.22]} />
        <meshStandardMaterial color="#5a5070" roughness={1} />
      </instancedMesh>
      {data.trees.map((t, i) => <DeadTree key={i} seed={t.seed} position={t.p} scale={t.s} />)}
      {data.pumpkins.map((p, i) => <Pumpkin key={i} position={p.p} scale={p.s} rotation={p.a} />)}
    </group>
  );
}

function Castle() {
  const { castle, center } = getTrackData();
  const face = Math.atan2(center.x - castle.x, center.z - castle.z);
  const stone = <meshStandardMaterial color="#4b3f63" roughness={1} />;
  const win = <meshBasicMaterial color="#ff9a3c" toneMapped={false} />;
  const towers: [number, number, number][] = [[-9, 0, 14], [9, 0, 11], [-9, -8, 9], [10, -9, 17]];
  return (
    <group position={castle} rotation={[0, face, 0]}>
      <mesh position={[0, 3.5, 0]}><boxGeometry args={[18, 7, 1.6]} />{stone}</mesh>
      <mesh position={[4, 8.2, 0]}><boxGeometry args={[6, 2.4, 1.6]} />{stone}</mesh>
      <mesh position={[0, 3.5, -8]}><boxGeometry args={[18, 5, 1.6]} />{stone}</mesh>
      <mesh position={[-9, 3, -4]}><boxGeometry args={[1.6, 6, 8]} />{stone}</mesh>
      {towers.map(([x, z, h], i) => (
        <group key={i} position={[x, 0, z]}>
          <mesh position={[0, h / 2, 0]}><cylinderGeometry args={[2, 2.3, h, 10]} />{stone}</mesh>
          {Array.from({ length: 8 }).map((_, k) => (k === 3 && i % 2 ? null : (
            <mesh key={k} position={[Math.cos(k / 8 * Math.PI * 2) * 2, h + 0.4, Math.sin(k / 8 * Math.PI * 2) * 2]}>
              <boxGeometry args={[0.7, 0.8, 0.7]} />{stone}
            </mesh>
          )))}
          <mesh position={[0, h * 0.62, 2.05]}><boxGeometry args={[0.6, 1.2, 0.2]} />{win}</mesh>
          {i === 1 && <mesh position={[0, h + 2.4, 0]}><coneGeometry args={[2.6, 4, 10]} /><meshStandardMaterial color="#2a1d3d" /></mesh>}
        </group>
      ))}
      {[-5, -1, 6].map(x => <mesh key={x} position={[x, 4.4, 0.82]}><boxGeometry args={[0.9, 1.6, 0.1]} />{win}</mesh>)}
      <mesh position={[1, 1.6, 0.82]}><boxGeometry args={[2.6, 3.2, 0.1]} /><meshBasicMaterial color="#2b0f1e" /></mesh>
      <pointLight position={[0, 4, 4]} color="#ff7a1a" intensity={60} distance={30} decay={2} />
    </group>
  );
}

function Chapel() {
  const { chapel, center } = getTrackData();
  const face = Math.atan2(center.x - chapel.x, center.z - chapel.z);
  const stone = <meshStandardMaterial color="#574a6e" roughness={1} />;
  return (
    <group position={chapel} rotation={[0, face, 0]}>
      <mesh position={[0, 2.5, -3]}><boxGeometry args={[6, 5, 10]} />{stone}</mesh>
      <mesh position={[0, 5.8, -3]} rotation={[Math.PI / 2, Math.PI / 4, 0]}>
        <cylinderGeometry args={[3.2, 3.2, 10.4, 4, 1]} />
        <meshStandardMaterial color="#2a1d3d" roughness={1} />
      </mesh>
      <mesh position={[0, 6, 2.6]}><boxGeometry args={[2.4, 12, 2.4]} />{stone}</mesh>
      <mesh position={[0, 13.6, 2.6]} rotation={[0, Math.PI / 4, 0]}><coneGeometry args={[2, 3.4, 4]} /><meshStandardMaterial color="#2a1d3d" /></mesh>
      <mesh position={[0, 16, 2.6]}><boxGeometry args={[0.2, 1.6, 0.2]} /><meshStandardMaterial color="#1a1222" /></mesh>
      <mesh position={[0, 16.3, 2.6]}><boxGeometry args={[0.9, 0.2, 0.2]} /><meshStandardMaterial color="#1a1222" /></mesh>
      <mesh position={[0, 9, 3.82]}><circleGeometry args={[0.7, 16]} /><meshBasicMaterial color="#c78bff" toneMapped={false} /></mesh>
      <mesh position={[0, 1.6, 3.82]}><planeGeometry args={[1.4, 3.2]} /><meshBasicMaterial color="#ff9a3c" toneMapped={false} /></mesh>
      <pointLight position={[0, 2.5, 6]} color="#b06bff" intensity={50} distance={26} decay={2} />
    </group>
  );
}

function Bats() {
  const ref = useRef<THREE.Group>(null);
  const { castle } = getTrackData();
  useFrame(({ clock }) => {
    const g = ref.current; if (!g) return;
    const t = clock.elapsedTime;
    g.children.forEach((b, i) => {
      const a = t * (0.5 + i * 0.07) + i;
      b.position.set(castle.x + Math.cos(a) * (10 + i * 1.5), castle.y + 16 + Math.sin(t * 2 + i) * 1.5, castle.z + Math.sin(a) * (10 + i * 1.5));
      b.rotation.y = -a;
      const flap = Math.sin(t * 18 + i) * 0.7;
      b.children[0].rotation.z = flap; b.children[1].rotation.z = -flap;
    });
  });
  return (
    <group ref={ref}>
      {Array.from({ length: 7 }).map((_, i) => (
        <group key={i}>
          {[1, -1].map(s => (
            <group key={s}>
              <mesh position={[s * 0.5, 0, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                <circleGeometry args={[0.55, 3]} />
                <meshBasicMaterial color="#0d0812" side={THREE.DoubleSide} />
              </mesh>
            </group>
          ))}
        </group>
      ))}
    </group>
  );
}

function Fog() {
  const td = getTrackData();
  const geo = useMemo(() => {
    const r = rng(99);
    const n = 90;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = td.minX - 40 + r() * (td.maxX - td.minX + 80);
      pos[i * 3 + 1] = td.groundY + 0.6 + r() * 2.5;
      pos[i * 3 + 2] = td.minZ - 40 + r() * (td.maxZ - td.minZ + 80);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    return g;
  }, [td]);
  const wisps = useMemo(() => {
    const r = rng(7);
    const n = 70;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = td.minX - 20 + r() * (td.maxX - td.minX + 40);
      pos[i * 3 + 1] = td.groundY + 1 + r() * 6;
      pos[i * 3 + 2] = td.minZ - 20 + r() * (td.maxZ - td.minZ + 40);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    return g;
  }, [td]);
  const fogRef = useRef<THREE.Points>(null);
  const wispRef = useRef<THREE.Points>(null);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (fogRef.current) fogRef.current.position.x = Math.sin(t * 0.08) * 6;
    if (wispRef.current) { wispRef.current.position.y = Math.sin(t * 0.6) * 0.8; wispRef.current.position.x = Math.cos(t * 0.3) * 2; }
  });
  const tex = getGlowTexture();
  return (
    <>
      <points ref={fogRef} geometry={geo}>
        <pointsMaterial map={tex} size={16} color="#b9a3e6" transparent opacity={0.13} depthWrite={false} sizeAttenuation />
      </points>
      <points ref={wispRef} geometry={wisps}>
        <pointsMaterial map={tex} size={0.9} color="#ffb04a" transparent opacity={0.9} depthWrite={false} blending={THREE.AdditiveBlending} sizeAttenuation />
      </points>
    </>
  );
}

function Moon() {
  const { center } = getTrackData();
  const p: V3 = [center.x - 140, 95, center.z - 210];
  return (
    <group position={p}>
      <mesh><sphereGeometry args={[16, 32, 24]} /><meshBasicMaterial color="#fff0d2" fog={false} /></mesh>
      <sprite scale={[110, 110, 1]}>
        <spriteMaterial map={getGlowTexture()} color="#e7c8ff" transparent opacity={0.55} depthWrite={false} fog={false} blending={THREE.AdditiveBlending} />
      </sprite>
    </group>
  );
}

export function World() {
  const td = getTrackData();
  return (
    <>
      <color attach="background" args={['#1d1035']} />
      <fogExp2 attach="fog" args={['#2a1648', 0.0065]} />
      <hemisphereLight args={['#8d6bff', '#2a0f24', 0.85]} />
      <ambientLight intensity={0.25} color="#b3a0ff" />
      <directionalLight position={[-140, 95, -210]} intensity={1.6} color="#d6ddff" />
      <Stars radius={260} depth={40} count={700} factor={5} saturation={0.4} fade speed={0.4} />
      <Moon />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[td.center.x, td.groundY, td.center.z]}>
        <circleGeometry args={[td.span * 1.4 + 80, 48]} />
        <meshStandardMaterial color="#251a3a" roughness={1} />
      </mesh>
      <Track />
      <StaticScenery>
        <Scatter />
        <Castle />
        <Chapel />
      </StaticScenery>
      <Bats />
      <Fog />
    </>
  );
}
