import type { Racer, RaceState } from './engine';

export const DIFFICULTIES = {
  easy: { label: 'Fácil', pace: 0.85, catchup: 0.08, aggression: 1.45 },
  normal: { label: 'Normal', pace: 0.96, catchup: 0.065, aggression: 1 },
  hard: { label: 'Difícil', pace: 1.025, catchup: 0.05, aggression: 0.72 },
} as const;
export type Difficulty = keyof typeof DIFFICULTIES;
export const BOOST_PADS = [
  { t: 0.40, lane: 2.2 }, { t: 0.565, lane: -2.2 }, { t: 0.70, lane: 2.2 }, { t: 0.93, lane: 0 },
] as const;
export function loadDifficulty(): Difficulty {
  try { const saved = localStorage.getItem('hk-difficulty'); if (saved === 'easy' || saved === 'hard') return saved; } catch { /* Storage can be disabled. */ }
  return 'normal';
}
export function saveDifficulty(value: Difficulty) {
  try { localStorage.setItem('hk-difficulty', value); } catch { /* The choice still applies to this session. */ }
}
export interface ArcadeRacer {
  hop: number; driftDirection: number; driftHeld: boolean; roulette: number; recovery: number;
  bumpCooldown: number; draftCharge: number; draftCooldown: number; draftActive: boolean; padCooldown: number;
}
export function arcadeRacer(): ArcadeRacer {
  return { hop: 0, driftDirection: 0, driftHeld: false, roulette: 0, recovery: 0,
    bumpCooldown: 0, draftCharge: 0, draftCooldown: 0, draftActive: false, padCooldown: 0 };
}
export function crossedMarker(before: number, after: number, t: number, length: number, margin = 1.8) {
  if (after < before) return false;
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
/** Six racers need only fifteen inexpensive contact tests per simulation step. */
export function bumpRacers(race: RaceState, _length: number) {
  let playerBumped = false;
  for (let i = 0; i < race.racers.length; i++) for (let j = i + 1; j < race.racers.length; j++) {
    const a = race.racers[i], b = race.racers[j];
    if (a.finishTime !== null || b.finishTime !== null || a.recovery > 0 || b.recovery > 0 || a.bumpCooldown > 0 || b.bumpCooldown > 0) continue;
    const dx = a.x - b.x, dz = a.z - b.z;
    const dist = Math.hypot(dx, dz);
    if (dist >= 2.35 || dist < 1e-6 || Math.max(Math.abs(a.speed), Math.abs(b.speed)) < 3) continue;
    const nx = dx / dist, nz = dz / dist;
    const separation = (2.2 - dist) * 0.5;
    a.x += nx * separation; a.z += nz * separation;
    b.x -= nx * separation; b.z -= nz * separation;
    a.lateralSpeed += nx * 1.6; b.lateralSpeed -= nx * 1.6;
    const exchange = (a.speed - b.speed) * 0.12;
    a.speed -= exchange; b.speed += exchange;
    a.bumpCooldown = b.bumpCooldown = 0.3;
    if (i === 0) playerBumped = true;
  }
  return playerBumped;
}
