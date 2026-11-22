import { useMemo, useRef, type MutableRefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useKeyboardControls } from '@react-three/drei';
import * as THREE from 'three';
import { CHARACTERS, ITEMS, TRACK_LENGTH, trackPoint, updateRace, type Input, type RaceState } from './engine';
import { Kart } from './models';
import { World, getTrackData, getGlowTexture, Pumpkin } from './world';
import { audio } from './audio';
import { StaticScenery } from './StaticScenery';

export type Phase = 'title' | 'select' | 'race' | 'results';

export function charIndex(id: number) {
  const i = CHARACTERS.findIndex(c => c.id === id);
  return i < 0 ? 0 : i;
}

const _p = new THREE.Vector3();
function place(progress: number, lane: number, out: THREE.Vector3) {
  const t = progress / TRACK_LENGTH;
  const p = trackPoint(t);
  out.set(p.x + Math.cos(p.angle) * lane, p.y, p.z - Math.sin(p.angle) * lane);
  const q = trackPoint(t + 2 / TRACK_LENGTH);
  return { angle: p.angle, pitch: -Math.atan2(q.y - p.y, 2) };
}

interface SceneProps {
  phase: Phase;
  raceRef: MutableRefObject<RaceState>;
  raceVersion: number;
  selectedId: number;
  touchRef: MutableRefObject<Input>;
  pausedRef: MutableRefObject<boolean>;
  onFinish: () => void;
  onDemoEnd: () => void;
}

function RacerMesh({ index, raceRef }: { index: number; raceRef: MutableRefObject<RaceState> }) {
  const outer = useRef<THREE.Group>(null);
  const inner = useRef<THREE.Group>(null);
  const flame = useRef<THREE.Mesh>(null);
  const shield = useRef<THREE.Mesh>(null);
  const spark = useRef<THREE.Sprite>(null);
  const prevLane = useRef(0);
  const racer = raceRef.current.racers[index];
  const ch = CHARACTERS[charIndex(racer.id)];
  useFrame(({ clock }, dt) => {
    const r = raceRef.current.racers[index];
    if (!r || !outer.current || !inner.current) return;
    const pose = place(r.progress, r.lane, outer.current.position);
    outer.current.rotation.set(pose.pitch, pose.angle, 0, 'YXZ');
    const dl = (r.lane - prevLane.current) / Math.max(dt, 0.001);
    prevLane.current = r.lane;
    const t = clock.elapsedTime;
    const follow = 1 - Math.exp(-14 * dt);
    inner.current.rotation.y = r.spin > 0 ? t * 14 : THREE.MathUtils.lerp(inner.current.rotation.y % (Math.PI * 2), r.steering * (r.drifting ? 0.42 : 0.09), follow);
    inner.current.rotation.z = THREE.MathUtils.lerp(inner.current.rotation.z, THREE.MathUtils.clamp(dl * 0.025, -0.14, 0.14), follow);
    inner.current.position.y = Math.abs(Math.sin(t * 20 + index)) * Math.min(0.05, Math.abs(r.speed) * 0.002);
    if (flame.current) { const on = r.boost > 0; flame.current.visible = on; flame.current.scale.setScalar(on ? 0.8 + Math.sin(t * 40) * 0.25 : 1); }
    if (shield.current) shield.current.visible = r.shield > 0;
    if (spark.current) {
      spark.current.visible = r.drifting;
      const c = r.driftCharge >= 1.5 ? '#ff9b37' : '#58cfff';
      (spark.current.material as THREE.SpriteMaterial).color.set(c);
      spark.current.scale.setScalar((r.driftCharge >= 1.5 ? 1.7 : 1) + Math.sin(t * 30) * 0.2);
    }
    if (r.slow > 0) inner.current.rotation.z += Math.sin(t * 30) * 0.05;
  });
  return (
    <group ref={outer}>
      <group ref={inner}>
        <StaticScenery><Kart index={charIndex(racer.id)} color={ch.color} accent={ch.accent} /></StaticScenery>
        <mesh ref={flame} position={[0, 0.5, -1.6]} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
          <coneGeometry args={[0.3, 1.2, 8]} />
          <meshBasicMaterial color="#9de8ff" transparent opacity={0.8} toneMapped={false} />
        </mesh>
        <mesh ref={shield} position={[0, 1, 0]} visible={false}>
          <sphereGeometry args={[1.8, 16, 12]} />
          <meshBasicMaterial color="#eee5c8" transparent opacity={0.18} depthWrite={false} />
        </mesh>
        <sprite ref={spark} position={[0, 0.3, -1.1]} visible={false}>
          <spriteMaterial map={getGlowTexture()} transparent depthWrite={false} blending={THREE.AdditiveBlending} />
        </sprite>
      </group>
    </group>
  );
}

function ItemBoxes({ raceRef }: { raceRef: MutableRefObject<RaceState> }) {
  const group = useRef<THREE.Group>(null);
  const count = raceRef.current.boxes.length;
  useFrame(({ clock }) => {
    const g = group.current; if (!g) return;
    const boxes = raceRef.current.boxes;
    g.children.forEach((c, i) => {
      const b = boxes[i];
      if (!b) { c.visible = false; return; }
      place(b.t * TRACK_LENGTH, b.lane, c.position);
      c.position.y += 1 + Math.sin(clock.elapsedTime * 2 + i) * 0.2;
      c.rotation.set(clock.elapsedTime * 0.8, clock.elapsedTime * 1.3 + i, 0);
      const target = b.cooldown > 0 ? 0.001 : 1;
      const s = THREE.MathUtils.lerp(c.scale.x, target, 0.15);
      c.scale.setScalar(s);
      c.visible = s > 0.02;
    });
  });
  return (
    <group ref={group}>
      {Array.from({ length: count }).map((_, i) => (
        <group key={i}>
          <mesh>
            <boxGeometry args={[1.2, 1.2, 1.2]} />
            <meshStandardMaterial color="#8a3dff" transparent opacity={0.55} emissive="#6b2fd0" emissiveIntensity={0.6} depthWrite={false} />
          </mesh>
          <mesh>
            <octahedronGeometry args={[0.42]} />
            <meshBasicMaterial color="#ff9a3c" toneMapped={false} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

const POOL = 16;
function Hazards({ raceRef }: { raceRef: MutableRefObject<RaceState> }) {
  const hz = useRef<THREE.Group>(null);
  const pj = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    const r = raceRef.current;
    hz.current?.children.forEach((c, i) => {
      const h = r.hazards[i];
      c.visible = !!h;
      if (h) { place(h.t * TRACK_LENGTH, h.lane, c.position); c.position.y += 0.08; c.rotation.y = clock.elapsedTime + i; }
    });
    pj.current?.children.forEach((c, i) => {
      const h = r.projectiles[i];
      c.visible = !!h;
      if (h) { place(h.t * TRACK_LENGTH, h.lane, c.position); c.position.y += 1 + Math.sin(clock.elapsedTime * 10 + i) * 0.3; c.rotation.y = clock.elapsedTime * 6; }
    });
  });
  return (
    <>
      <group ref={hz}>
        {Array.from({ length: POOL }).map((_, i) => (
          <group key={i} visible={false}>
            <mesh rotation={[-Math.PI / 2, 0, 0]}>
              <circleGeometry args={[1.3, 12]} />
              <meshStandardMaterial color="#9be255" emissive="#4f8a1a" emissiveIntensity={0.7} transparent opacity={0.85} />
            </mesh>
          </group>
        ))}
      </group>
      <group ref={pj}>
        {Array.from({ length: POOL }).map((_, i) => (
          <group key={i} visible={false}>
            <Pumpkin position={[0, 0, 0]} scale={1.1} />
          </group>
        ))}
      </group>
    </>
  );
}

function Showcase({ selectedId, phase }: { selectedId: number; phase: Phase }) {
  const { showcase } = getTrackData();
  const spin = useRef<THREE.Group>(null);
  useFrame((_, dt) => { if (spin.current) spin.current.rotation.y += dt * 0.6; });
  const idx = charIndex(selectedId);
  const ch = CHARACTERS[idx];
  return (
    <group position={showcase} visible={phase === 'select'}>
      <mesh position={[0, 0.3, 0]}><cylinderGeometry args={[3.2, 3.6, 0.6, 10]} /><meshStandardMaterial color="#4b3f63" roughness={1} /></mesh>
      <mesh position={[0, 0.62, 0]}><cylinderGeometry args={[2.9, 2.9, 0.04, 40]} /><meshBasicMaterial color={ch.accent} transparent opacity={0.45} /></mesh>
      <group ref={spin} position={[0, 0.62, 0]}>
        <StaticScenery key={idx}><Kart index={idx} color={ch.color} accent={ch.accent} /></StaticScenery>
      </group>
      {[0, 1, 2, 3, 4].map(k => {
        const a = k / 5 * Math.PI * 2;
        return (
          <group key={k} position={[Math.cos(a) * 3.3, 0.6, Math.sin(a) * 3.3]}>
            <mesh position={[0, 0.25, 0]}><cylinderGeometry args={[0.1, 0.1, 0.5, 6]} /><meshStandardMaterial color="#efe3c0" /></mesh>
            <sprite position={[0, 0.65, 0]} scale={0.6}><spriteMaterial map={getGlowTexture()} color="#ffb04a" blending={THREE.AdditiveBlending} depthWrite={false} /></sprite>
          </group>
        );
      })}
      <pointLight position={[2, 4, 4]} color="#ffb04a" intensity={40} distance={16} decay={2} />
      <pointLight position={[-3, 3, -2]} color={ch.accent} intensity={30} distance={14} decay={2} />
    </group>
  );
}

function CameraRig({ phase, raceRef }: { phase: Phase; raceRef: MutableRefObject<RaceState> }) {
  const { camera, size, gl } = useThree();
  const look = useRef(new THREE.Vector3());
  const target = useMemo(() => new THREE.Vector3(), []);
  const lookT = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ clock }, dt) => {
    const t = clock.elapsedTime;
    const k = 1 - Math.exp(-dt * (phase === 'race' ? 6 : 2.5));
    const race = raceRef.current;
    if (phase === 'select') {
      const s = getTrackData().showcase;
      const narrow = size.width < 768;
      target.set(s.x + (narrow ? 0 : -1.5), s.y + (narrow ? 4.2 : 3.2), s.z + (narrow ? 11 : 9));
      lookT.set(s.x + (narrow ? 0 : -2.6), s.y + (narrow ? -0.3 : 1.2), s.z);
    } else if (phase === 'race') {
      const r = race.racers[0];
      const pose = place(r.progress, r.lane, _p);
      const fx = Math.sin(pose.angle), fz = Math.cos(pose.angle);
      const back = size.width < 768 ? 10 : 8.5;
      target.set(_p.x - fx * back, _p.y + 4.2, _p.z - fz * back);
      lookT.set(_p.x + fx * 6, _p.y + 1.2, _p.z + fz * 6);
      if (race.countdown > 0) target.y += race.countdown * 0.6;
    } else {
      // title/results: cinematic orbit around a racer
      const lead = phase === 'results' ? race.racers[0] : race.racers.reduce((a, b) => (b.progress > a.progress ? b : a));
      place(lead.progress, lead.lane, _p);
      const a = t * 0.12;
      const rad = phase === 'results' ? 12 : 15;
      target.set(_p.x + Math.cos(a) * rad, _p.y + 6 + Math.sin(t * 0.2) * 1.5, _p.z + Math.sin(a) * rad);
      lookT.set(_p.x, _p.y + 1.5, _p.z);
    }
    camera.position.lerp(target, k);
    look.current.lerp(lookT, k);
    camera.lookAt(look.current);
    const perspective = camera as THREE.PerspectiveCamera;
    const desiredFov = phase === 'race' && race.racers[0].boost > 0 ? 68 : 60;
    const fov = THREE.MathUtils.lerp(perspective.fov, desiredFov, 1 - Math.exp(-5 * dt));
    if (Math.abs(fov - perspective.fov) > 0.005) { perspective.fov = fov; perspective.updateProjectionMatrix(); }
    const fovLabel = perspective.fov.toFixed(0);
    if (gl.domElement.dataset.cameraFov !== fovLabel) gl.domElement.dataset.cameraFov = fovLabel;
  });
  return null;
}

const DEMO: Input = { accelerate: true, brake: false, left: false, right: false, drift: false, item: false };

function Loop({ phase, raceRef, touchRef, pausedRef, onFinish, onDemoEnd }: Omit<SceneProps, 'raceVersion' | 'selectedId'>) {
  const [, get] = useKeyboardControls();
  const notified = useRef<RaceState | null>(null);
  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.5);
    const race = raceRef.current;
    if (phase === 'race') {
      if (pausedRef.current) { audio.sync(race, true); return; }
      const k = get() as Record<string, boolean>;
      const tch = touchRef.current;
      const input: Input = {
        accelerate: !!k.accelerate || tch.accelerate,
        brake: !!k.brake || tch.brake,
        left: !!k.left || tch.left,
        right: !!k.right || tch.right,
        drift: !!k.drift || tch.drift,
        item: !!k.item || tch.item,
      };
      updateRace(race, dt, input);
      audio.sync(race, false);
      if (race.finished && notified.current !== race) { notified.current = race; onFinish(); }
    } else {
      updateRace(race, dt, DEMO);
      if (phase !== 'results' && (race.finished || race.time > 200)) onDemoEnd();
    }
  });
  return null;
}

export function Scene(props: SceneProps) {
  const { raceRef, raceVersion } = props;
  const count = raceRef.current.racers.length;
  return (
    <>
      <RenderBudget />
      <World />
      <group key={raceVersion}>
        {Array.from({ length: count }).map((_, i) => <RacerMesh key={i} index={i} raceRef={raceRef} />)}
        <ItemBoxes raceRef={raceRef} />
      </group>
      <Hazards raceRef={raceRef} />
      {props.phase === 'select' && <Showcase selectedId={props.selectedId} phase={props.phase} />}
      <CameraRig phase={props.phase} raceRef={raceRef} />
      <Loop phase={props.phase} raceRef={raceRef} touchRef={props.touchRef} pausedRef={props.pausedRef} onFinish={props.onFinish} onDemoEnd={props.onDemoEnd} />
    </>
  );
}

function RenderBudget() {
  const { setDpr, gl } = useThree();
  const sample = useRef({ time: 0, frames: 0, dpr: 1 });
  useFrame((_, delta) => {
    const s = sample.current;
    s.time += delta; s.frames++;
    if (s.time < 2) return;
    const fps = s.frames / s.time;
    const next = fps < 48 ? Math.max(0.65, s.dpr - 0.1) : fps > 58 ? Math.min(1, s.dpr + 0.05) : s.dpr;
    if (next !== s.dpr) { setDpr(next); s.dpr = next; }
    // Read-only performance evidence; it never affects simulation speed.
    gl.domElement.dataset.renderFps = fps.toFixed(1);
    gl.domElement.dataset.renderDpr = s.dpr.toFixed(2);
    gl.domElement.dataset.drawCalls = String(gl.info.render.calls);
    s.time = 0; s.frames = 0;
  });
  return null;
}

export const itemInfo = (id: string | null) => (id ? ITEMS.find(i => i.id === id) ?? null : null);
