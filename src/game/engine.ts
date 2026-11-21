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

export interface Input {
  accelerate: boolean; brake: boolean; left: boolean; right: boolean; drift: boolean; item: boolean;
}
export interface Racer {
  id: number; progress: number; lane: number; speed: number; boost: number; shield: number;
  spin: number; slow: number; driftCharge: number; drifting: boolean; item: string | null;
  finishTime: number | null;
}
export interface RaceResult { id: number; time: number; position: number; estimated: boolean }
export interface ItemBox { t: number; lane: number; cooldown: number }
export interface Hazard { t: number; lane: number; life: number; owner: number }
export interface Projectile { t: number; lane: number; life: number; owner: number }
export interface RaceState {
  racers: Racer[]; time: number; countdown: number; finished: boolean; results: RaceResult[];
  boxes: ItemBox[]; hazards: Hazard[]; projectiles: Projectile[]; message: string; messageTime: number;
  /** Internal state belongs to each race, so restarting resets every cooldown. */
  aiTimers: number[]; itemHeld: boolean;
}
export function createRace(characterId: number): RaceState {
  const ids = [characterId, ...CHARACTERS.filter(c => c.id !== characterId).map(c => c.id)];
  return {
    racers: ids.map((id, i) => ({
      id, progress: i < 2 ? 0 : -Math.floor(i / 2) * 3.5, lane: i % 2 === 0 ? -1.6 : 1.6,
      speed: 0, boost: 0, shield: 0, spin: 0, slow: 0, driftCharge: 0, drifting: false,
      item: null, finishTime: null,
    })),
    time: 0, countdown: 3, finished: false, results: [], hazards: [], projectiles: [],
    boxes: [0.12, 0.36, 0.61, 0.84].flatMap(t => [-3.4, 0, 3.4].map(lane => ({ t, lane, cooldown: 0 }))),
    message: '', messageTime: 0, aiTimers: ids.map((_, i) => 7 + i * 1.8), itemHeld: false,
  };
}
function announce(race: RaceState, message: string) {
  race.message = message;
  race.messageTime = 2.5;
}
function hit(race: RaceState, racer: Racer, spin: boolean) {
  if (racer.finishTime !== null) return;
  if (racer.shield > 0) {
    racer.shield = 0;
    if (racer === race.racers[0]) announce(race, 'Seu escudo bloqueou o ataque!');
    return;
  }
  if (racer.spin > 0 || racer.slow > 1) return;
  if (spin) { racer.spin = 1.4; racer.speed *= 0.35; }
  else { racer.slow = 2.6; racer.speed *= 0.65; }
  if (racer === race.racers[0]) announce(race, spin ? 'Você rodou! Acelere para recuperar.' : 'Morcegos! Você perdeu velocidade.');
}
export function useItem(race: RaceState, racerIndex = 0) {
  const racer = race.racers[racerIndex];
  if (!racer || !racer.item || race.countdown > 0 || race.finished || racer.finishTime !== null) return;
  const item = racer.item;
  racer.item = null;
  if (racerIndex === 0) announce(race, ITEMS.find(i => i.id === item)?.name ?? '');
  if (item === 'ghost') racer.boost = 2.5;
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
    race.countdown = Math.max(0, race.countdown - dt);
    return;
  }
  race.time += dt;
  race.messageTime = Math.max(0, race.messageTime - dt);
  race.boxes.forEach(box => { box.cooldown = Math.max(0, box.cooldown - dt); });
  if (input.item && !race.itemHeld) useItem(race);
  race.itemHeld = input.item;
  race.racers.forEach((racer, index) => {
    if (racer.finishTime !== null) return;
    const stats = CHARACTERS[racer.id];
    const prevProgress = racer.progress;
    racer.boost = Math.max(0, racer.boost - dt);
    racer.shield = Math.max(0, racer.shield - dt);
    racer.spin = Math.max(0, racer.spin - dt);
    racer.slow = Math.max(0, racer.slow - dt);
    const t = racer.progress / TRACK_LENGTH;
    const p = trackPoint(t);
    const ahead = trackPoint(t + 0.014);
    const curve = Math.atan2(Math.sin(ahead.angle - p.angle), Math.cos(ahead.angle - p.angle));
    let maxSpeed = 22 + stats.speed * 0.95;
    let throttle = index === 0 ? input.accelerate : true;
    const braking = index === 0 && input.brake;
    const steering = index === 0 ? Number(input.left) - Number(input.right) : 0;
    const drifting = index === 0 && input.drift && steering !== 0 && racer.speed > 8 && Math.abs(curve) > 0.012;
    if (index > 0) {
      // Modest pace variation and bounded catch-up keep the grid competitive without teleporting.
      const gap = clamp((race.racers[0].progress - racer.progress) / 100, -1, 1);
      maxSpeed *= 0.9 + 0.035 * Math.sin(race.time * 0.37 + index * 2) + 0.06 * gap;
      maxSpeed *= 1 - Math.min(0.2, Math.abs(curve) * 0.65);
      let targetLane = Math.sin(race.time * 0.22 + index * 1.7) * 2.8;
      const nearbyBox = race.boxes.find(b => b.cooldown <= 0 && wrap(b.t - t) * TRACK_LENGTH < 15);
      if (!racer.item && nearbyBox) targetLane = nearbyBox.lane;
      racer.lane += clamp(targetLane - racer.lane, -2.2 * dt, 2.2 * dt);
      race.aiTimers[index] -= dt;
      if (race.aiTimers[index] <= 0) {
        if (racer.item) useItem(race, index);
        race.aiTimers[index] = 5 + Math.random() * 6;
      }
    } else {
      // Positive lane follows the track's right normal; a left input reduces lane.
      const lateralSpeed = (2 + stats.handling * 0.38) * (drifting ? 1.32 : 1);
      racer.lane -= steering * lateralSpeed * dt * Math.min(1, racer.speed / 8);
      racer.lane -= curve * racer.speed * dt * (drifting ? 0.55 : 0.85) * (11 - stats.handling) * 0.18;
      // Keep the whole kart on the pavement, inside the raised curbs and fences.
      racer.lane = clamp(racer.lane, -4.8, 4.8);
      if (Math.abs(racer.lane) > 4.5) {
        maxSpeed *= 0.86;
        // Releasing the steering gently recovers from a curb instead of leaving
        // a slower racer permanently stranded outside the road.
        if (steering === 0) racer.lane -= Math.sign(racer.lane) * 1.8 * dt;
      }
      if (drifting) racer.driftCharge = Math.min(2.5, racer.driftCharge + dt);
      if (racer.drifting && !drifting) {
        if (racer.driftCharge > 0.45) {
          racer.boost = 0.6 + racer.driftCharge * 0.6;
          announce(race, 'Derrapagem perfeita! Impulso!');
        }
        racer.driftCharge = 0;
      }
      racer.drifting = drifting;
    }
    if (racer.boost > 0) maxSpeed *= 1.42;
    if (racer.slow > 0) maxSpeed *= 0.58;
    if (racer.spin > 0) { maxSpeed *= 0.2; throttle = false; }
    if (throttle && !braking) racer.speed = Math.min(maxSpeed, racer.speed + (6 + stats.acceleration * 1.25) * (racer.boost > 0 ? 1.8 : 1) * dt);
    else racer.speed = Math.max(0, racer.speed - (braking ? 26 : 5) * dt);
    if (racer.speed > maxSpeed) racer.speed = Math.max(maxSpeed, racer.speed - 18 * dt);
    racer.progress += racer.speed * dt;
    for (const box of race.boxes) {
      // Crossing test avoids skipping a box at low frame rates.
      const next = Math.floor(prevProgress / TRACK_LENGTH) * TRACK_LENGTH + box.t * TRACK_LENGTH;
      const crossed = (next >= prevProgress - 1.8 && next <= racer.progress + 1.8)
        || (next + TRACK_LENGTH >= prevProgress - 1.8 && next + TRACK_LENGTH <= racer.progress + 1.8);
      if (box.cooldown === 0 && !racer.item && crossed && Math.abs(racer.lane - box.lane) < 1.7) {
        racer.item = ITEMS[Math.floor(Math.random() * ITEMS.length)].id;
        box.cooldown = 4;
        if (index === 0) announce(race, `${ITEMS.find(i => i.id === racer.item)!.name} — use E ou toque no item`);
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
    }
  });
  for (const projectile of race.projectiles) {
    projectile.life -= dt;
    projectile.t = wrap(projectile.t + 57 * dt / TRACK_LENGTH);
    // Slight homing toward the nearest opponent ahead makes shots useful through curves.
    const targets = race.racers.map((r, i) => ({ r, i, d: wrap(r.progress / TRACK_LENGTH - projectile.t) * TRACK_LENGTH }))
      .filter(x => x.i !== projectile.owner && x.r.finishTime === null && x.d < 25).sort((a, b) => a.d - b.d);
    if (targets[0]) projectile.lane += clamp(targets[0].r.lane - projectile.lane, -5 * dt, 5 * dt);
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
