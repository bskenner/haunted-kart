import type { Racer, RaceState } from './engine';

export const DIFFICULTIES = {
  // Normal keeps the previous Normal opponent tuning unchanged.
  normal: { label: 'Normal', pace: 0.96, catchup: 0.065, aggression: 1, aheadSlack: 0.035, racingLine: 1 },
  // Berserk is a notch harsher than the old Difícil: slightly faster, better
  // lines, more frequent items, and less easing off when ahead.
  berserk: { label: 'Berserk', pace: 1.04, catchup: 0.065, aggression: 0.62, aheadSlack: 0.012, racingLine: 1.18 },
} as const;
export type Difficulty = keyof typeof DIFFICULTIES;

/** Map a stored or typed difficulty, including legacy Fácil/Difícil keys, to Normal or Berserk. */
export function parseDifficulty(saved: string | null | undefined): Difficulty {
  const value = (saved ?? '').trim().toLocaleLowerCase('pt-BR');
  const folded = value.normalize('NFD').replace(/\p{M}/gu, '');
  if (value === 'berserk' || folded === 'hard' || folded === 'dificil') return 'berserk';
  return 'normal';
}
// Three arrow strips live only on the long start/finish straight, past the
// grid and well before the first corner, so they never fire at rocket start.
export const BOOST_PADS = [
  { t: 0.07, lane: 0 }, { t: 0.19, lane: 0 },
] as const;
export function loadDifficulty(): Difficulty {
  try {
    const saved = localStorage.getItem('hk-difficulty');
    const difficulty = parseDifficulty(saved);
    if (saved !== difficulty) saveDifficulty(difficulty);
    return difficulty;
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
