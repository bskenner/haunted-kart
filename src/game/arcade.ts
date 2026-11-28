import type { Racer, RaceState } from './engine';

export const DIFFICULTIES = {
  normal: { label: 'Normal', pace: 0.96, catchup: 0.065, aggression: 1, aheadSlack: 0.035, racingLine: 1 },
  berserk: { label: 'Berserk', pace: 1.04, catchup: 0.065, aggression: 0.62, aheadSlack: 0.012, racingLine: 1.18 },
} as const;
export type Difficulty = keyof typeof DIFFICULTIES;
export const BOOST_PADS = [
  { t: 0.07, lane: 0 }, { t: 0.19, lane: 0 },
] as const;
export function loadDifficulty(): Difficulty {
  try {
    const saved = localStorage.getItem('hk-difficulty')?.trim().toLocaleLowerCase('pt-BR');
    if (saved === 'normal' || saved === 'berserk') return saved;
    if (saved === 'easy' || saved === 'fácil' || saved === 'facil') return 'normal';
    if (saved === 'hard' || saved === 'difícil' || saved === 'dificil') return 'berserk';
  } catch { /* Storage can be disabled. */ }
  return 'normal';
}
export function saveDifficulty(value: Difficulty) {
  try { localStorage.setItem('hk-difficulty', value); } catch { /* The choice still applies to this session. */ }
}
export interface ArcadeRacer {
  hop: number; driftDirection: number; driftHeld: boolean; roulette: number; recovery: number;
  bumpCooldown: number; draftCharge: number; draftCooldown: number; draftActive: boolean; padCooldown: number;
}
/** Horizontal bounding radius of a kart, including its wheels. */
export const KART_COLLISION_RADIUS = 1.42;
export interface BumpReport { touched: Racer[]; impact: boolean }
export function arcadeRacer(): ArcadeRacer {
  return { hop: 0, driftDirection: 0, driftHeld: false, roulette: 0, recovery: 0,
    bumpCooldown: 0, draftCharge: 0, draftCooldown: 0, draftActive: false, padCooldown: 0 };
}
export function crossedMarker(before: number, after: number, t: number, length: number, margin = 1.8) {
  if (after < before - 1e-6) return false;
  const marker = Math.floor(before / length) * length + t * length;
  return (marker >= before - margin && marker <= after + margin)
    || (marker + length >= before - margin && marker + length <= after + margin);
}
export function updateDraft(racer: Racer, racers: Racer[], length: number, dt: number) {
  racer.draftActive = racer.speed > 12 && !racer.offroad && racer.spin === 0 && racers.some(other => {
    if (other === racer || other.finishTime !== null) return false;
    const gap = ((other.progress - racer.progress) % length + length) % length;
    return gap > 2.5 && gap < 15 && other.speed > 10 && Math.abs(other.lane - racer.lane) < 1.25;
  });
  racer.draftCharge = Math.max(0, Math.min(1.15, racer.draftCharge + (racer.draftActive ? dt : -dt * 2)));
  if (racer.draftCharge >= 1.1 && racer.draftCooldown === 0) {
    racer.draftCharge = 0;
    racer.draftCooldown = 3;
    return true;
  }
  return false;
}
/** Six racers need only fifteen inexpensive world-space circle checks per step. */
export function bumpRacers(race: RaceState, _length: number, skipPlayer = false): BumpReport {
  const touched = new Set<Racer>();
  let impact = false;
  const diameter = KART_COLLISION_RADIUS * 2;
  for (let i = skipPlayer ? 1 : 0; i < race.racers.length; i++) for (let j = i + 1; j < race.racers.length; j++) {
    const a = race.racers[i], b = race.racers[j];
    if (a.finishTime !== null || b.finishTime !== null) continue;
    let dx = a.x - b.x, dz = a.z - b.z;
    const distance = Math.hypot(dx, dz);
    if (distance >= diameter) continue;
    if (distance < 1e-5) {
      const side = (i + j) % 2 ? 1 : -1;
      dx = Math.cos(a.trackAngle) * side;
      dz = -Math.sin(a.trackAngle) * side;
    }
    const inverseDistance = distance < 1e-5 ? 1 : 1 / distance;
    const nx = dx * inverseDistance, nz = dz * inverseDistance;
    const correction = (diameter - distance) * 0.5 + 0.015;
    a.x += nx * correction; a.z += nz * correction;
    b.x -= nx * correction; b.z -= nz * correction;
    touched.add(a); touched.add(b);

    if (a.bumpCooldown > 0 || b.bumpCooldown > 0 || Math.max(Math.abs(a.speed), Math.abs(b.speed)) < 3) continue;
    const exchange = (a.speed - b.speed) * 0.12;
    a.speed = (a.speed - exchange) * 0.985;
    b.speed = (b.speed + exchange) * 0.985;
    a.bumpCooldown = b.bumpCooldown = 0.3;
    impact = true;
  }
  return { touched: [...touched], impact };
}
