import { arcadeRacer, BOOST_PADS, bumpRacers, crossedMarker, DIFFICULTIES, updateDraft, type ArcadeRacer, type Difficulty } from './arcade.ts';
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

// A flowing closed course with sweeping corners, a fast stretch and a gentle hill.
function rawPoint(t: number) {
  const a = wrap(t) * TAU;
  return {
    x: 57 * Math.sin(a) + 12 * Math.sin(2 * a),
    y: 1.1 + 2.2 * Math.sin(a - 0.5) + 1.1 * Math.sin(a * 2),
    z: 43 * Math.cos(a) + 10 * Math.sin(a * 3),
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


/** World position of a kart on the track, matching the in-game placement. */
export function kartPosition(progress: number, lane: number) {
  const p = trackPoint(progress / TRACK_LENGTH);
  return { x: p.x + Math.cos(p.angle) * lane, y: p.y, z: p.z - Math.sin(p.angle) * lane, angle: p.angle };
}

/**
 * Camera-space X of a kart, using the same Three.js chase-camera lookAt as the game
 * (camera behind the kart, looking forward). Positive is the right side of the screen.
 * The optional cameraLane pins the camera to a reference lane so a steer can be judged
 * against the view the player actually had.
 */
export function chaseCameraScreenX(progress: number, lane: number, cameraLane = 0) {
  const origin = kartPosition(progress, cameraLane);
  const kart = kartPosition(progress, lane);
  const fx = Math.sin(origin.angle), fz = Math.cos(origin.angle);
  const eye = { x: origin.x - fx * 8.5, y: origin.y + 4.2, z: origin.z - fz * 8.5 };
  const target = { x: origin.x + fx * 6, y: origin.y + 1.2, z: origin.z + fz * 6 };
  const zx = eye.x - target.x, zy = eye.y - target.y, zz = eye.z - target.z;
  const zlen = Math.hypot(zx, zy, zz) || 1;
  const z = { x: zx / zlen, y: zy / zlen, z: zz / zlen };
  // Three.js lookAt: camera X = normalize(up × z), up = (0, 1, 0).
  let xx = z.z, xy = 0, xz = -z.x;
  const xlen = Math.hypot(xx, xy, xz) || 1;
  xx /= xlen; xy /= xlen; xz /= xlen;
  return (kart.x - eye.x) * xx + (kart.y - eye.y) * xy + (kart.z - eye.z) * xz;
}

export interface Input {
  accelerate: boolean; brake: boolean; left: boolean; right: boolean; drift: boolean; item: boolean;
}
export interface Racer extends ArcadeRacer {
  id: number; progress: number; lane: number; speed: number; boost: number; shield: number;
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
export const ROAD_EDGE = 5.05;
export const WALL_EDGE = 6.15;
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
  difficulty: Difficulty;
  motorClass: MotorClass;
}
function emit(race: RaceState, type: EventKind, value?: number, item?: string) {
  race.events.push({ seq: ++race.eventSeq, type, value, item });
  if (race.events.length > 48) race.events.shift();
}
function boost(race: RaceState, racer: Racer, duration: number, power: number, tier = 0) {
  racer.boost = Math.max(racer.boost, duration);
  racer.boostPower = Math.max(racer.boostPower, power);
  if (racer === race.racers[0]) emit(race, 'boost', tier);
}
export function createRace(characterId: number, difficulty: Difficulty = 'normal', motorClass: MotorClass = 'normal'): RaceState {
  const ids = [characterId, ...CHARACTERS.filter(c => c.id !== characterId).map(c => c.id)];
  return {
    racers: ids.map((id, i) => ({
      ...arcadeRacer(),
      id, progress: i < 2 ? 0 : -Math.floor(i / 2) * 3.5, lane: i % 2 === 0 ? -1.6 : 1.6,
      speed: 0, boost: 0, shield: 0, spin: 0, slow: 0, driftCharge: 0, drifting: false,
      item: null, finishTime: null,
      lateralSpeed: 0, steering: 0, boostPower: 1, offroad: false, wallCooldown: 0,
      reverseHold: 0, wrongWay: 0, stumble: 0, pickupFlash: 0, useFlash: 0, hitFlash: 0,
    })),
    time: 0, countdown: 3, finished: false, results: [], hazards: [], projectiles: [], difficulty, motorClass,
    boxes: [0.12, 0.36, 0.61, 0.84].flatMap(t => [-3.4, 0, 3.4].map(lane => ({ t, lane, cooldown: 0 }))),
    message: '', messageTime: 0, aiTimers: ids.map((_, i) => 7 + i * 1.8), itemHeld: false,
    events: [{ seq: 1, type: 'countdown', value: 3 }], eventSeq: 1, throttleHeld: false, launchAt: null,
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

export function updateRace(race: RaceState, delta: number, input: Input) {
  // Integrate real elapsed time in small steps. Dropping everything over 50ms made
  // low-frame-rate phones play in slow motion; substeps also prevent missed hits.
  let remaining = Number.isFinite(delta) ? clamp(delta, 0, 0.5) : 0;
  while (remaining > 0.000001 && !race.finished) {
    const dt = Math.min(remaining, 1 / 60);
    stepRace(race, dt, input);
    remaining -= dt;
  }
}
function stepRace(race: RaceState, dt: number, input: Input) {
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
      // Early or late throttle simply misses the turbo; the kart still accelerates on green.
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
    let maxSpeed = (22 + stats.speed * 0.95) * motor.speed;
    let throttle = index === 0 ? input.accelerate : true;
    const braking = index === 0 && input.brake;
    const steering = index === 0 ? Number(input.left) - Number(input.right) : 0;
    const canDrift = index === 0 && input.drift && racer.speed > 8 && racer.spin === 0 && !racer.offroad && !braking;
    if (index === 0) {
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
    if (index > 0) {
      // Bounded +/- adjustments around the middle of the field, not teleports
      // or a hidden speed penalty targeting only the human player.
      const catchup = clamp((pack - racer.progress) / 150, -0.035, difficulty.catchup);
      maxSpeed *= difficulty.pace + 0.012 * Math.sin(race.time * 0.37 + index * 2) + catchup;
      maxSpeed *= 1 - Math.min(0.12, Math.abs(curve) * 0.5);
      // Look ahead, take the inside gently and leave room to overtake.
      const distant = trackPoint(t + 0.045 * motor.speed);
      const bend = Math.atan2(Math.sin(distant.angle - p.angle), Math.cos(distant.angle - p.angle));
      let targetLane = Math.sin(index * 2.3) * 0.85 - clamp(bend * 4.5, -2.2, 2.2);
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
      // In the Three.js chase camera, a positive lane sits on the LEFT of the screen.
      // Left input is +steering: it increases lane, yaws with positive rotation.y, and goes screen-left.
      const stability = 1 - 0.32 * clamp((Math.abs(racer.speed) / motor.speed - 12) / 24, 0, 1);
      const steerRate = 1 - Math.exp(-dt / (steering ? 0.1 : 0.04) * motor.grip);
      racer.steering += (steering - racer.steering) * steerRate;
      const speedFeel = Math.min(1, 0.45 + Math.abs(racer.speed) / 3.5);
      let lateralTarget = steering * (3.6 + stats.handling * 0.26) * motor.steering * stability * speedFeel;
      if (drifting) {
        const arc = steering === racer.driftDirection ? 1.05 : steering ? 0.18 : 0.5;
        lateralTarget = racer.driftDirection * (2 + stats.handling * 0.08) * arc * motor.steering;
        // Drift steering follows the bend without constantly sliding into fences.
        if (Math.abs(racer.lane) > 3.9 && Math.sign(lateralTarget) === Math.sign(racer.lane)) lateralTarget *= 0.06;
      }
      if (racer.spin > 0) lateralTarget = 0;
      const latRate = drifting ? 9 : steering ? 14 : 28;
      racer.lateralSpeed += (lateralTarget - racer.lateralSpeed) * (1 - Math.exp(-latRate * motor.grip * dt));
      if (!steering && Math.abs(racer.lane) > ROAD_EDGE) racer.lateralSpeed -= Math.sign(racer.lane) * 9 * dt;
      racer.lane += racer.lateralSpeed * dt;
      if (Math.abs(racer.lane) >= WALL_EDGE) {
        const side = Math.sign(racer.lane);
        racer.lane = side * (WALL_EDGE - 0.06);
        racer.lateralSpeed = -side * Math.max(1.8, Math.abs(racer.lateralSpeed) * 0.45);
        if (racer.wallCooldown === 0) {
          racer.speed *= 0.88;
          racer.wallCooldown = 0.55;
          emit(race, 'wall');
        }
      }
      racer.offroad = Math.abs(racer.lane) > ROAD_EDGE;
      if (racer.offroad) maxSpeed *= 0.53;
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
    racer.wrongWay = racer.speed < -1 ? Math.min(2, racer.wrongWay + dt) : Math.max(0, racer.wrongWay - dt * 3);
    racer.progress += racer.speed * dt;
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
      if (hazard.life > 0 && hazard.owner !== index && circularDistance(t, hazard.t) < 2 && Math.abs(racer.lane - hazard.lane) < 1.8) {
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
      if (lap > Math.floor(prevProgress / TRACK_LENGTH) && lap > 0) {
        emit(race, lap === 2 ? 'finalLap' : 'lap', lap + 1);
        announce(race, lap === 2 ? 'Última volta! Assombre a concorrência!' : 'Volta 2! A corrida continua!');
      }
    }
  });
  if (bumpRacers(race, TRACK_LENGTH)) emit(race, 'bump');
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
