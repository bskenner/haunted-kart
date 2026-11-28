import { arcadeRacer, BOOST_PADS, bumpRacers, crossedMarker, DIFFICULTIES, KART_COLLISION_RADIUS, updateDraft, type ArcadeRacer, type Difficulty } from './arcade.ts';
import { MOTOR_CLASSES, type MotorClass } from './motors.ts';
/** Browser-only race simulation. Distances are measured along the closed circuit. */
export const CHARACTERS = [
  { id: 0, name: 'Fantasma', color: '#c4f4ff', accent: '#55bde9', speed: 7, acceleration: 5, handling: 10, description: 'Leve na pista. Impossível de assombrar.' },
  { id: 1, name: 'Zumbi', color: '#83bb49', accent: '#733ec1', speed: 5, acceleration: 10, handling: 7, description: 'Pode estar morto, mas a largada é viva.' },
  { id: 2, name: 'Múmia', color: '#dac494', accent: '#c38a42', speed: 7, acceleration: 7, handling: 8, description: 'Milênios de experiência em cada curva.' },
  { id: 3, name: 'Frankenstein', color: '#63a86b', accent: '#7755b8', speed: 10, acceleration: 4, handling: 5, description: 'Um monstro de velocidade nas retas.' },
  { id: 4, name: 'Vampiro', color: '#b8244c', accent: '#291b39', speed: 9, acceleration: 8, handling: 6, description: 'A noite é sua. A vitória também pode ser.' },
  { id: 5, name: 'Lobisomem', color: '#96705a', accent: '#bec6d6', speed: 6, acceleration: 9, handling: 10, description: 'Instinto selvagem. Curvas perfeitas.' },
] as const;

export const ITEMS = [
  { id: 'bats', name: 'Enxame de morcegos', symbol: 'morcegos', color: '#ba80ff' },
  { id: 'pumpkin', name: 'Bomba de abóbora', symbol: 'abóbora', color: '#ff903b' },
  { id: 'ghost', name: 'Impulso fantasma', symbol: 'fantasma', color: '#9de8ff' },
  { id: 'bones', name: 'Escudo de ossos', symbol: 'ossos', color: '#eee5c8' },
  { id: 'slime', name: 'Poção escorregadia', symbol: 'poção', color: '#9be255' },
] as const;

const TAU = Math.PI * 2;
const wrap = (x: number, m = 1) => ((x % m) + m) % m;
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

type TrackControl = [number, number, number];
// The first cubic is collinear and forms the only straight. Every later cubic
// bends around the cemetery before the final hairpin returns to the start.
const TRACK_SECTIONS: TrackControl[][] = [
  [[0, 1.4, -55], [0, 1.4, -18], [0, 1.4, 18], [0, 1.4, 55]],
  [[0, 1.4, 55], [0, 1.4, 78], [24, 1.9, 82], [38, 1.9, 66]],
  [[38, 1.9, 66], [52, 1.9, 50], [72, 1.5, 67], [80, 1.5, 43]],
  [[80, 1.5, 43], [88, 1.5, 19], [78, 1.1, -2], [64, 1.1, -14]],
  [[64, 1.1, -14], [50, 1.1, -26], [60, 0.9, -48], [38, 0.9, -50]],
  [[38, 0.9, -50], [16, 0.9, -52], [18, 1.3, -76], [0, 1.3, -76]],
  [[0, 1.3, -76], [-18, 1.3, -76], [0, 1.4, -66], [0, 1.4, -55]],
];
export const START_STRAIGHT_LENGTH = TRACK_SECTIONS[0][3][2] - TRACK_SECTIONS[0][0][2];
function cubic(a: number, b: number, c: number, d: number, t: number) {
  const u = 1 - t;
  return u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c + t * t * t * d;
}
function rawPoint(t: number) {
  const scaled = wrap(t) * TRACK_SECTIONS.length;
  const index = Math.min(TRACK_SECTIONS.length - 1, Math.floor(scaled));
  const localT = scaled - index;
  const section = TRACK_SECTIONS[index];
  return {
    x: cubic(section[0][0], section[1][0], section[2][0], section[3][0], localT),
    y: cubic(section[0][1], section[1][1], section[2][1], section[3][1], localT),
    z: cubic(section[0][2], section[1][2], section[2][2], section[3][2], localT),
  };
}
// Arc-length lookup makes speed independent of local track curvature.
const SAMPLES = 1024;
const arc = [0];
let previous = rawPoint(0);
for (let i = 1; i <= SAMPLES; i++) {
  const p = rawPoint(i / SAMPLES);
  arc.push(arc[i - 1] + Math.hypot(p.x - previous.x, p.y - previous.y, p.z - previous.z));
  previous = p;
}
export const TRACK_LENGTH = arc[SAMPLES];
export function trackPoint(t: number) {
  const distance = wrap(t) * TRACK_LENGTH;
  let lo = 0;
  let hi = SAMPLES;
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1;
    if (arc[mid] <= distance) lo = mid;
    else hi = mid;
  }
  const u = (lo + (distance - arc[lo]) / (arc[lo + 1] - arc[lo])) / SAMPLES;
  const p = rawPoint(u);
  const ahead = rawPoint(u + 0.0001);
  const behind = rawPoint(u - 0.0001);
  return { ...p, angle: Math.atan2(ahead.x - behind.x, ahead.z - behind.z) };
}
export const CHECKPOINT_COUNT = 16;
const trackSegments = Array.from({ length: SAMPLES }, (_, i) => {
  const from = rawPoint(i / SAMPLES), to = rawPoint((i + 1) / SAMPLES);
  return {
    from, to, start: arc[i], length: arc[i + 1] - arc[i],
    dx: to.x - from.x, dz: to.z - from.z,
    lengthSq: (to.x - from.x) ** 2 + (to.z - from.z) ** 2,
  };
});
export function projectToTrack(x: number, z: number, referenceProgress?: number) {
  if (referenceProgress !== undefined && Number.isFinite(referenceProgress)) {
    const reference = wrap(referenceProgress, TRACK_LENGTH);
    const anchor = trackPoint(reference / TRACK_LENGTH);
    const tangentX = Math.sin(anchor.angle), tangentZ = Math.cos(anchor.angle);
    const alongTangent = (x - anchor.x) * tangentX + (z - anchor.z) * tangentZ;
    const tangentStep = Math.abs(alongTangent) < 1e-6 ? 0 : clamp(alongTangent, -3, 3);
    const progress = wrap(reference + tangentStep, TRACK_LENGTH);
    const point = trackPoint(progress / TRACK_LENGTH);
    const ahead = trackPoint((progress + 2) / TRACK_LENGTH);
    const dx = x - point.x, dz = z - point.z;
    return {
      progress,
      lane: dx * Math.cos(point.angle) - dz * Math.sin(point.angle),
      x: point.x, y: point.y, z: point.z, angle: point.angle,
      pitch: -Math.atan2(ahead.y - point.y, 2),
    };
  }
  let bestDistanceSq = Infinity;
  let best = { progress: 0, lane: 0, x: 0, y: 0, z: 0, angle: 0, pitch: 0 };
  for (const segment of trackSegments) {
    const t = clamp(((x - segment.from.x) * segment.dx + (z - segment.from.z) * segment.dz) / segment.lengthSq, 0, 1);
    const progress = segment.start + segment.length * t;
    const px = segment.from.x + segment.dx * t;
    const pz = segment.from.z + segment.dz * t;
    const ox = x - px, oz = z - pz;
    const distanceSq = ox * ox + oz * oz;
    if (distanceSq >= bestDistanceSq) continue;
    const angle = Math.atan2(segment.dx, segment.dz);
    const horizontalLength = Math.hypot(segment.dx, segment.dz);
    bestDistanceSq = distanceSq;
    best = {
      progress,
      lane: ox * Math.cos(angle) - oz * Math.sin(angle),
      x: px, y: segment.from.y + (segment.to.y - segment.from.y) * t, z: pz, angle,
      pitch: -Math.atan2(segment.to.y - segment.from.y, horizontalLength),
    };
  }
  return best;
}
function railPose(progress: number, lane: number) {
  const p = trackPoint(progress / TRACK_LENGTH);
  const ahead = trackPoint(progress / TRACK_LENGTH + 2 / TRACK_LENGTH);
  return {
    x: p.x + Math.cos(p.angle) * lane, y: p.y,
    z: p.z - Math.sin(p.angle) * lane,
    heading: p.angle, trackAngle: p.angle,
    trackPitch: -Math.atan2(ahead.y - p.y, 2),
  };
}
function syncRailPose(racer: Racer, afterBump = false) {
  if (afterBump) {
    const reference = wrap(racer.progress, TRACK_LENGTH);
    const projection = projectToTrack(racer.x, racer.z, reference);
    if (racer.finishTime === null) {
      let progressDelta = projection.progress - reference;
      if (progressDelta > TRACK_LENGTH / 2) progressDelta -= TRACK_LENGTH;
      else if (progressDelta < -TRACK_LENGTH / 2) progressDelta += TRACK_LENGTH;
      // A kart bump may nudge the rail pose, but it must not skip or undo a
      // meaningful amount of race progress in one simulation step.
      racer.progress += clamp(progressDelta, -0.15, 0.15);
    }
    racer.lane = clamp(projection.lane, -3.8, 3.8);
  }
  Object.assign(racer, railPose(racer.progress, racer.lane));
  racer.rawProgress = wrap(racer.progress, TRACK_LENGTH);
}
function crossedCheckpoint(beforeX: number, beforeZ: number, afterX: number, afterZ: number, gateProgress: number) {
  const gate = trackPoint(gateProgress / TRACK_LENGTH);
  const tx = Math.sin(gate.angle), tz = Math.cos(gate.angle);
  const before = (beforeX - gate.x) * tx + (beforeZ - gate.z) * tz;
  const after = (afterX - gate.x) * tx + (afterZ - gate.z) * tz;
  if (before > 0 || after <= 0 || after === before) return false;
  const ratio = -before / (after - before);
  const x = beforeX + (afterX - beforeX) * ratio;
  const z = beforeZ + (afterZ - beforeZ) * ratio;
  const laneAtGate = (x - gate.x) * Math.cos(gate.angle) - (z - gate.z) * Math.sin(gate.angle);
  return Math.abs(laneAtGate) <= ROAD_EDGE;
}
function updatePlayerTrackState(
  racer: Racer,
  beforeX: number,
  beforeZ: number,
  projection = projectToTrack(racer.x, racer.z, racer.rawProgress),
) {
  racer.rawProgress = projection.progress;
  racer.lane = projection.lane;
  racer.y = projection.y;
  racer.trackAngle = projection.angle;
  racer.trackPitch = projection.pitch;
  const nextGate = (racer.checkpointIndex + 1) * TRACK_LENGTH / CHECKPOINT_COUNT;
  if (crossedCheckpoint(beforeX, beforeZ, racer.x, racer.z, nextGate)) {
    if (racer.checkpointIndex === CHECKPOINT_COUNT - 1) {
      racer.completedLaps = Math.min(3, racer.completedLaps + 1);
      racer.checkpointIndex = 0;
    } else racer.checkpointIndex++;
  }
  const sectorStart = racer.checkpointIndex * TRACK_LENGTH / CHECKPOINT_COUNT;
  const sectorEnd = (racer.checkpointIndex + 1) * TRACK_LENGTH / CHECKPOINT_COUNT;
  if (projection.progress >= sectorStart && projection.progress <= sectorEnd)
    racer.progress = racer.completedLaps * TRACK_LENGTH + projection.progress;
  else racer.progress = clamp(racer.progress, racer.completedLaps * TRACK_LENGTH + sectorStart, racer.completedLaps * TRACK_LENGTH + sectorEnd);
}
function wrapAngle(angle: number) { return ((angle + Math.PI) % TAU + TAU) % TAU - Math.PI; }

export interface Input {
  accelerate: boolean; brake: boolean; left: boolean; right: boolean; drift: boolean; item: boolean;
}
export interface Racer extends ArcadeRacer {
  id: number; progress: number; lane: number; speed: number; boost: number; shield: number;
  x: number; y: number; z: number; heading: number; rawProgress: number;
  trackAngle: number; trackPitch: number; checkpointIndex: number; completedLaps: number;
  spin: number; slow: number; driftCharge: number; drifting: boolean; item: string | null;
  finishTime: number | null;
  lateralSpeed: number; steering: number; boostPower: number; offroad: boolean;
  wallCooldown: number; reverseHold: number; wrongWay: number; stumble: number;
  pickupFlash: number; useFlash: number; hitFlash: number;
}
export type EventKind = 'countdown' | 'pickup' | 'use' | 'hit' | 'shield' | 'boost' | 'tier' | 'wall' | 'lap' | 'finalLap' | 'finish' | 'launch' | 'stumble' | 'hop' | 'bump' | 'draft' | 'pad';
export interface RaceEvent { seq: number; type: EventKind; value?: number; item?: string }
export const DRIFT_BLUE = 0.55;
export const DRIFT_ORANGE = 1.5;
export const ROAD_EDGE = 6.6;
// The visible rail is centered at lateral 9m and is 6cm thick. Keep a small
// safety gap after the complete kart bounding radius so its body cannot clip it.
export const WALL_EDGE = 9 - 0.06 - KART_COLLISION_RADIUS - 0.02;
export const driftTier = (charge: number) => charge >= DRIFT_ORANGE ? 2 : charge >= DRIFT_BLUE ? 1 : 0;
export interface RaceResult { id: number; time: number; position: number; estimated: boolean }
export interface ItemBox { t: number; lane: number; cooldown: number }
export interface Hazard { t: number; lane: number; life: number; owner: number }
export interface Projectile { t: number; lane: number; life: number; owner: number }
export interface RaceState {
  racers: Racer[]; time: number; countdown: number; finished: boolean; results: RaceResult[];
  boxes: ItemBox[]; hazards: Hazard[]; projectiles: Projectile[]; message: string; messageTime: number;
  /** Internal state belongs to each race, so restarting resets every cooldown. */
  aiTimers: number[]; itemHeld: boolean;
  events: RaceEvent[]; eventSeq: number; throttleHeld: boolean; launchAt: number | null;
  announcedLap: number;
  difficulty: Difficulty;
  motorClass: MotorClass;
}
function emit(race: RaceState, type: EventKind, value?: number, item?: string) {
  race.events.push({ seq: ++race.eventSeq, type, value, item });
  if (race.events.length > 256) race.events.shift();
}
function boost(race: RaceState, racer: Racer, duration: number, power: number, tier = 0) {
  racer.boost = Math.max(racer.boost, duration);
  racer.boostPower = Math.max(racer.boostPower, power);
  if (racer === race.racers[0]) emit(race, 'boost', tier);
}
export function createRace(characterId: number, difficulty: Difficulty = 'normal', motorClass: MotorClass = 'normal'): RaceState {
  const ids = [characterId, ...CHARACTERS.filter(c => c.id !== characterId).map(c => c.id)];
  return {
    racers: ids.map((id, i) => {
      const progress = i < 2 ? 0 : -Math.floor(i / 2) * 3.5;
      const lane = i % 2 === 0 ? -1.6 : 1.6;
      return {
        ...arcadeRacer(), ...railPose(progress, lane),
        id, progress, lane, rawProgress: wrap(progress, TRACK_LENGTH),
        checkpointIndex: 0, completedLaps: 0,
        speed: 0, boost: 0, shield: 0, spin: 0, slow: 0, driftCharge: 0, drifting: false,
        item: null, finishTime: null,
        lateralSpeed: 0, steering: 0, boostPower: 1, offroad: false, wallCooldown: 0,
        reverseHold: 0, wrongWay: 0, stumble: 0, pickupFlash: 0, useFlash: 0, hitFlash: 0,
      };
    }),
    time: 0, countdown: 3, finished: false, results: [], hazards: [], projectiles: [], difficulty, motorClass,
    boxes: [0.34, 0.50, 0.68, 0.84].flatMap(t => [-4, 0, 4].map(lane => ({ t, lane, cooldown: 0 }))),
    message: '', messageTime: 0, aiTimers: ids.map((_, i) => 7 + i * 1.8), itemHeld: false,
    events: [{ seq: 1, type: 'countdown', value: 3 }], eventSeq: 1, throttleHeld: false, launchAt: null,
    announcedLap: 0,
  };
}
function announce(race: RaceState, message: string) {
  race.message = message;
  race.messageTime = 2.5;
}
function hit(race: RaceState, racer: Racer, spin: boolean) {
  if (racer.finishTime !== null || racer.recovery > 0) return;
  if (racer.shield > 0) {
    racer.shield = 0;
    racer.recovery = 0.35;
    if (racer === race.racers[0]) { announce(race, 'Seu escudo bloqueou o ataque!'); emit(race, 'shield'); }
    return;
  }
  if (racer.spin > 0 || racer.slow > 1) return;
  if (spin) { racer.spin = 1.4; racer.speed *= 0.35; }
  else { racer.slow = 2.6; racer.speed *= 0.65; }
  racer.recovery = spin ? 2.5 : 2.8;
  racer.hitFlash = 0.5;
  if (racer === race.racers[0]) {
    emit(race, 'hit', spin ? 1 : 0);
    announce(race, spin ? 'Você rodou! Acelere para recuperar.' : 'Morcegos! Você perdeu velocidade.');
  }
}
export function useItem(race: RaceState, racerIndex = 0) {
  const racer = race.racers[racerIndex];
  if (!racer || !racer.item || racer.roulette > 0 || race.countdown > 0 || race.finished || racer.finishTime !== null) return;
  const item = racer.item;
  racer.item = null;
  racer.useFlash = 0.7;
  if (racerIndex === 0) {
    announce(race, `Poder ativado: ${ITEMS.find(i => i.id === item)?.name ?? ''}`);
    emit(race, 'use', undefined, item);
  }
  if (item === 'ghost') boost(race, racer, 2.5, 1.48);
  if (item === 'bones') racer.shield = 6;
  if (item === 'bats') {
    race.racers.filter(r => r.progress > racer.progress && r !== racer).forEach(r => hit(race, r, false));
  }
  if (item === 'pumpkin') {
    race.projectiles.push({ t: wrap((racer.progress + 3) / TRACK_LENGTH), lane: racer.lane, life: 4, owner: racerIndex });
  }
  if (item === 'slime') {
    race.hazards.push({ t: wrap((racer.progress - 3) / TRACK_LENGTH), lane: racer.lane, life: 12, owner: racerIndex });
  }
}
const circularDistance = (a: number, b: number) => {
  const d = Math.abs(wrap(a) - wrap(b));
  return Math.min(d, 1 - d) * TRACK_LENGTH;
};

export function updateRace(race: RaceState, delta: number, input: Input, manualPlayer = true) {
  // Integrate real elapsed time in small steps. Dropping everything over 50ms made
  // low-frame-rate phones play in slow motion; substeps also prevent missed hits.
  let remaining = Number.isFinite(delta) ? clamp(delta, 0, 0.5) : 0;
  while (remaining > 0.000001 && !race.finished) {
    const dt = Math.min(remaining, 1 / 60);
    stepRace(race, dt, input, manualPlayer);
    remaining -= dt;
  }
}
function stepRace(race: RaceState, dt: number, input: Input, manualPlayer: boolean) {
  if (race.finished) return;
  if (race.countdown > 0) {
    if (input.accelerate && !race.throttleHeld) race.launchAt = race.countdown;
    if (!input.accelerate) race.launchAt = null;
    race.throttleHeld = input.accelerate;
    const before = Math.ceil(race.countdown);
    race.countdown = Math.max(0, race.countdown - dt);
    if (Math.ceil(race.countdown) !== before) emit(race, 'countdown', Math.ceil(race.countdown));
    if (race.countdown === 0 && input.accelerate && race.launchAt !== null) {
      if (race.launchAt >= 0.15 && race.launchAt <= 1.05) {
        boost(race, race.racers[0], 1.25, 1.4);
        announce(race, 'Largada monstruosa! Turbo!');
        emit(race, 'launch');
      }
      // A press outside the launch window only misses the bonus; throttle still works on green.
    }
    return;
  }
  race.time += dt;
  race.messageTime = Math.max(0, race.messageTime - dt);
  race.boxes.forEach(box => { box.cooldown = Math.max(0, box.cooldown - dt); });
  if (input.item && !race.itemHeld) useItem(race);
  race.itemHeld = input.item;
  const sortedProgress = race.racers.map(r => r.progress).sort((a, b) => b - a);
  const pack = sortedProgress[2];
  const difficulty = DIFFICULTIES[race.difficulty];
  const motor = MOTOR_CLASSES[race.motorClass];
  race.racers.forEach((racer, index) => {
    if (racer.finishTime !== null) return;
    const stats = CHARACTERS[racer.id];
    const prevProgress = racer.progress;
    racer.boost = Math.max(0, racer.boost - dt);
    if (racer.boost === 0) racer.boostPower = 1;
    racer.shield = Math.max(0, racer.shield - dt);
    racer.spin = Math.max(0, racer.spin - dt);
    racer.slow = Math.max(0, racer.slow - dt);
    racer.wallCooldown = Math.max(0, racer.wallCooldown - dt);
    racer.stumble = Math.max(0, racer.stumble - dt);
    racer.pickupFlash = Math.max(0, racer.pickupFlash - dt);
    racer.useFlash = Math.max(0, racer.useFlash - dt);
    racer.hitFlash = Math.max(0, racer.hitFlash - dt);
    racer.hop = Math.max(0, racer.hop - dt);
    racer.roulette = Math.max(0, racer.roulette - dt);
    racer.recovery = Math.max(0, racer.recovery - dt);
    racer.bumpCooldown = Math.max(0, racer.bumpCooldown - dt);
    racer.draftCooldown = Math.max(0, racer.draftCooldown - dt);
    racer.padCooldown = Math.max(0, racer.padCooldown - dt);
    const t = racer.progress / TRACK_LENGTH;
    const p = trackPoint(t);
    const ahead = trackPoint(t + 0.014);
    const curve = Math.atan2(Math.sin(ahead.angle - p.angle), Math.cos(ahead.angle - p.angle));
    const isManualPlayer = index === 0 && manualPlayer;
    const beforeX = racer.x, beforeZ = racer.z;
    let maxSpeed = (22 + stats.speed * 0.95) * motor.speed;
    if (isManualPlayer && racer.offroad) maxSpeed *= 0.53;
    let throttle = isManualPlayer ? input.accelerate : true;
    const braking = isManualPlayer && input.brake;
    const steering = isManualPlayer ? Number(input.left) - Number(input.right) : 0;
    const canDrift = isManualPlayer && input.drift && racer.speed > 8 && racer.spin === 0 && !racer.offroad && !braking;
    if (isManualPlayer) {
      if (input.drift && !racer.driftHeld && racer.speed > 2 && racer.spin === 0) {
        racer.hop = 0.3; emit(race, 'hop');
      }
      if (canDrift && !racer.driftDirection && steering) {
        racer.driftDirection = steering;
        racer.hop = 0.3;
      }
      racer.driftHeld = input.drift;
    }
    const drifting = canDrift && racer.driftDirection !== 0;
    if (index > 0 || !manualPlayer) {
      // Bounded +/- adjustments around the middle of the field, not teleports
      // or a hidden speed penalty targeting only the human player.
      const catchup = clamp((pack - racer.progress) / 150, -difficulty.aheadSlack, difficulty.catchup);
      maxSpeed *= difficulty.pace + 0.012 * Math.sin(race.time * 0.37 + index * 2) + catchup;
      maxSpeed *= 1 - Math.min(0.12, Math.abs(curve) * 0.5);
      // Look ahead, take the inside gently and leave room to overtake.
      const distant = trackPoint(t + 0.045 * difficulty.racingLine * motor.speed);
      const bend = Math.atan2(Math.sin(distant.angle - p.angle), Math.cos(distant.angle - p.angle));
      let targetLane = Math.sin(index * 2.3) * 0.85 + clamp(bend * 4.5 * difficulty.racingLine, -2.2, 2.2);
      const itemLookAhead = 26 * motor.speed;
      let nearest = itemLookAhead;
      if (!racer.item) for (const box of race.boxes) {
        const distance = wrap(box.t - t) * TRACK_LENGTH;
        if (box.cooldown <= 0 && distance < nearest && distance > 1) {
          nearest = distance;
          targetLane = box.lane;
        }
      }
      for (const pad of BOOST_PADS) {
        const distance = wrap(pad.t - t) * TRACK_LENGTH;
        if (distance > 3 && distance < 20 * motor.speed && nearest === itemLookAhead) targetLane = pad.lane;
      }
      for (const hazard of race.hazards) {
        if (wrap(hazard.t - t) * TRACK_LENGTH < 18 * motor.speed && Math.abs(hazard.lane - racer.lane) < 2)
          targetLane = hazard.lane > 0 ? -2.8 : 2.8;
      }
      for (const other of race.racers) {
        const distance = other.progress - racer.progress;
        if (other !== racer && distance > 0 && distance < 9 * motor.speed && other.speed < racer.speed && Math.abs(other.lane - racer.lane) < 1.8)
          targetLane = other.lane > 0 ? other.lane - 2.7 : other.lane + 2.7;
      }
      racer.lane += clamp(clamp(targetLane, -3.8, 3.8) - racer.lane, -3.5 * motor.steering * dt, 3.5 * motor.steering * dt);
      race.aiTimers[index] -= dt;
      if (race.aiTimers[index] <= 0) {
        const ahead = race.racers.some(r => r !== racer && r.progress > racer.progress && r.progress - racer.progress < 60 && r.finishTime === null);
        const shot = race.racers.some(r => r !== racer && r.progress > racer.progress && r.progress - racer.progress < 42 && Math.abs(r.lane - racer.lane) < 2.5 && r.finishTime === null);
        const behind = race.racers.some(r => r !== racer && racer.progress - r.progress > 0 && racer.progress - r.progress < 24);
        const threat = race.projectiles.some(p => p.owner !== index && circularDistance(p.t, t) < 18)
          || race.hazards.some(h => wrap(h.t - t) * TRACK_LENGTH < 12 && Math.abs(h.lane - racer.lane) < 2);
        const useful = racer.item === 'ghost' ? Math.abs(curve) < 0.35
          : racer.item === 'bones' ? threat || behind
          : racer.item === 'pumpkin' ? shot : racer.item === 'slime' ? behind : ahead;
        if (racer.item && useful) useItem(race, index);
        race.aiTimers[index] = (2.2 + Math.random() * 2.8) * difficulty.aggression;
      }
    } else {
      // Manual player steering changes heading only from explicit input or a held drift.
      racer.steering = steering;
      const oldTier = driftTier(racer.driftCharge);
      if (drifting) racer.driftCharge = Math.min(3, racer.driftCharge + dt);
      if (driftTier(racer.driftCharge) > oldTier) emit(race, 'tier', driftTier(racer.driftCharge));
      if (racer.drifting && !drifting) {
        const tier = driftTier(racer.driftCharge);
        if (tier && racer.spin === 0 && !racer.offroad) {
          boost(race, racer, tier === 2 ? 1.7 : 0.9, tier === 2 ? 1.46 : 1.24, tier);
          announce(race, tier === 2 ? 'Super miniturbo! Impulso máximo!' : 'Miniturbo! Impulso azul!');
        }
        racer.driftCharge = 0;
      }
      racer.drifting = drifting;
      if (!drifting) racer.driftDirection = 0;
    }
    if (updateDraft(racer, race.racers, TRACK_LENGTH, dt)) {
      boost(race, racer, 1.05, 1.2);
      if (index === 0) { emit(race, 'draft'); announce(race, 'Vácuo! Impulso na perseguição!'); }
    }
    if (racer.boost > 0) maxSpeed *= racer.boostPower;
    if (racer.slow > 0) maxSpeed *= 0.58;
    if (racer.spin > 0 || racer.stumble > 0) { maxSpeed *= 0.2; throttle = false; }
    if (braking) {
      if (racer.speed > 0) racer.speed = Math.max(0, racer.speed - 28 * motor.grip * dt);
      if (!input.accelerate && racer.speed <= 0) {
        racer.reverseHold += dt;
        if (racer.reverseHold > 0.65) racer.speed = Math.max(-7, racer.speed - 9 * dt);
      } else racer.reverseHold = 0;
    } else {
      racer.reverseHold = 0;
      if (throttle) {
        const curve = 0.58 + 0.42 * (1 - clamp(racer.speed / maxSpeed, 0, 1));
        const acceleration = (7 + stats.acceleration * 1.5) * motor.acceleration * curve * (racer.boost > 0 ? 2 : 1);
        racer.speed = racer.speed < maxSpeed ? Math.min(maxSpeed, racer.speed + acceleration * dt)
          : Math.max(maxSpeed, racer.speed - (racer.offroad ? 24 : 12) * dt);
      } else {
        const drag = (racer.spin > 0 ? 18 : 5) * dt;
        racer.speed = Math.sign(racer.speed) * Math.max(0, Math.abs(racer.speed) - drag);
      }
    }
    if (isManualPlayer) {
      const speedAuthority = clamp(Math.abs(racer.speed) / 8, 0, 1);
      let turn = steering;
      if (drifting) {
        const arc = steering === racer.driftDirection ? 1.3 : steering === -racer.driftDirection ? 0.22 : 0.68;
        turn = racer.driftDirection * arc;
      }
      if (racer.spin > 0) turn = 0;
      if (turn !== 0 && speedAuthority > 0) {
        const turnRate = drifting ? 0.72 + stats.handling * 0.02 : 1.15 + stats.handling * 0.04;
        const speedStability = 1 - 0.28 * clamp((Math.abs(racer.speed) - 18) / 26, 0, 1);
        racer.heading = wrapAngle(racer.heading + turn * turnRate
          * speedStability * motor.steering * speedAuthority * dt);
      }
      // Sweep the kart's center in short world-space steps. Projection is
      // always referenced to the last local point, so a hairpin can't snap to
      // a later part of the circuit and fast motion can't pass through a rail.
      let projection = projectToTrack(racer.x, racer.z, racer.rawProgress);
      let projectionReference = projection.progress;
      const movementSteps = Math.max(1, Math.ceil(Math.abs(racer.speed * dt) / 0.25));
      const movementDt = dt / movementSteps;
      let wallHitThisStep = false;
      for (let move = 0; move < movementSteps; move++) {
        racer.x += Math.sin(racer.heading) * racer.speed * movementDt;
        racer.z += Math.cos(racer.heading) * racer.speed * movementDt;
        projection = projectToTrack(racer.x, racer.z, projectionReference);
        projectionReference = projection.progress;
        for (let resolve = 0; resolve < 3 && Math.abs(projection.lane) > WALL_EDGE; resolve++) {
          const side = Math.sign(projection.lane);
          const correction = projection.lane - side * WALL_EDGE;
          racer.x -= Math.cos(projection.angle) * correction;
          racer.z += Math.sin(projection.angle) * correction;
          projection = projectToTrack(racer.x, racer.z, projectionReference);
          projectionReference = projection.progress;
          if (racer.wallCooldown === 0 && !wallHitThisStep) {
            racer.speed *= 0.72;
            racer.wallCooldown = 0.55;
            wallHitThisStep = true;
            emit(race, 'wall');
          }
        }
      }
      updatePlayerTrackState(racer, beforeX, beforeZ, projection);
      racer.offroad = Math.abs(racer.lane) > ROAD_EDGE;
      racer.lateralSpeed = ((racer.x - beforeX) * Math.cos(racer.trackAngle)
        - (racer.z - beforeZ) * Math.sin(racer.trackAngle)) / dt;
      if (racer.offroad && racer.speed > 0) {
        const offroadLimit = (22 + stats.speed * 0.95) * motor.speed * 0.53;
        if (racer.speed > offroadLimit) racer.speed = Math.max(offroadLimit, racer.speed - 24 * dt);
      }
      racer.wrongWay = racer.speed * Math.cos(racer.heading - racer.trackAngle) < -1
        ? Math.min(2, racer.wrongWay + dt) : Math.max(0, racer.wrongWay - dt * 3);
    } else {
      racer.progress += racer.speed * dt;
      syncRailPose(racer);
      racer.offroad = Math.abs(racer.lane) > ROAD_EDGE;
      racer.wrongWay = racer.speed < -1 ? Math.min(2, racer.wrongWay + dt) : Math.max(0, racer.wrongWay - dt * 3);
    }
    const currentTrackT = racer.progress / TRACK_LENGTH;
    if (racer.speed > 5 && racer.padCooldown === 0 && BOOST_PADS.some(pad =>
      Math.abs(racer.lane - pad.lane) < 1.65 && crossedMarker(prevProgress, racer.progress, pad.t, TRACK_LENGTH, 2))) {
      racer.padCooldown = 1.3;
      boost(race, racer, 1.25, 1.32);
      if (index === 0) { emit(race, 'pad'); announce(race, 'Faixa de impulso! Segure firme!'); }
    }
    for (const box of race.boxes) {
      // Crossing test avoids skipping a box at low frame rates.
      const crossed = crossedMarker(prevProgress, racer.progress, box.t, TRACK_LENGTH);
      if (box.cooldown === 0 && !racer.item && crossed && Math.abs(racer.lane - box.lane) < 1.7) {
        racer.item = ITEMS[Math.floor(Math.random() * ITEMS.length)].id;
        box.cooldown = 4;
        racer.pickupFlash = 0.8;
        racer.roulette = 0.85;
        if (index === 0) {
          emit(race, 'pickup', undefined, racer.item);
          announce(race, 'Roleta assombrada! Depois, Espaço ou botão Poder.');
        }
      }
    }
    for (const hazard of race.hazards) {
      if (hazard.life > 0 && hazard.owner !== index && circularDistance(currentTrackT, hazard.t) < 2 && Math.abs(racer.lane - hazard.lane) < 1.8) {
        hit(race, racer, true);
        hazard.life = 0;
      }
    }
    if (racer.progress >= TRACK_LENGTH * 3) {
      racer.finishTime = race.time - (racer.progress - TRACK_LENGTH * 3) / Math.max(1, racer.speed);
      racer.progress = TRACK_LENGTH * 3;
      if (index === 0) emit(race, 'finish');
    } else if (index === 0) {
      const lap = Math.floor(racer.progress / TRACK_LENGTH);
      if (lap > race.announcedLap && lap > 0) {
        race.announcedLap = lap;
        emit(race, lap === 2 ? 'finalLap' : 'lap', lap + 1);
        announce(race, lap === 2 ? 'Última volta! Assombre a concorrência!' : 'Volta 2! A corrida continua!');
      }
    }
  });
  const bumps = bumpRacers(race, TRACK_LENGTH);
  if (bumps.impact) emit(race, 'bump');
  bumps.touched.forEach(racer => {
    if (racer !== race.racers[0] || !manualPlayer) syncRailPose(racer, true);
  });
  if (manualPlayer && race.racers[0].finishTime === null) {
    const player = race.racers[0];
    const beforeX = player.x, beforeZ = player.z;
    updatePlayerTrackState(player, beforeX, beforeZ);
  }
  for (const projectile of race.projectiles) {
    projectile.life -= dt;
    projectile.t = wrap(projectile.t + 57 * motor.speed * dt / TRACK_LENGTH);
    // Slight homing toward the nearest opponent ahead makes shots useful through curves.
    const targets = race.racers.map((r, i) => ({ r, i, d: wrap(r.progress / TRACK_LENGTH - projectile.t) * TRACK_LENGTH }))
      .filter(x => x.i !== projectile.owner && x.r.finishTime === null && x.d < 25).sort((a, b) => a.d - b.d);
    if (targets[0]) projectile.lane += clamp(targets[0].r.lane - projectile.lane, -5 * motor.steering * dt, 5 * motor.steering * dt);
    for (let i = 0; i < race.racers.length; i++) {
      const racer = race.racers[i];
      if (i !== projectile.owner && circularDistance(racer.progress / TRACK_LENGTH, projectile.t) < 2.4 && Math.abs(racer.lane - projectile.lane) < 1.8) {
        hit(race, racer, true);
        projectile.life = 0;
        break;
      }
    }
  }
  race.hazards.forEach(h => { h.life -= dt; });
  race.hazards = race.hazards.filter(h => h.life > 0);
  race.projectiles = race.projectiles.filter(p => p.life > 0);
  if (race.racers[0].finishTime !== null && race.racers.some(r => r.finishTime === null)) {
    race.message = 'Você terminou! Aguardando os outros monstros...';
    race.messageTime = 1;
  }
  if (race.racers.every(r => r.finishTime !== null)) {
    race.finished = true;
    const ordered = [...race.racers].sort((a, b) => {
      if (a.finishTime !== null && b.finishTime !== null) return a.finishTime - b.finishTime;
      if (a.finishTime !== null) return -1;
      if (b.finishTime !== null) return 1;
      return b.progress - a.progress;
    });
    race.results = ordered.map((r, i) => ({
      id: r.id, position: i + 1, estimated: false, time: r.finishTime!,
    }));
  }
}
export function formatTime(seconds: number) {
  const value = Math.max(0, seconds);
  return `${Math.floor(value / 60).toString().padStart(2, '0')}:${Math.floor(value % 60).toString().padStart(2, '0')}.${Math.floor((value % 1) * 100).toString().padStart(2, '0')}`;
}
