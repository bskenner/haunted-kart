/** Four gears covering a slow rumble, a mid growl and a high-speed whine. */
export const GEAR_COUNT = 4;
export const ENGINE_GEAR_LIMITS = [0, 8, 16, 26, 40] as const;
export const ENGINE_GEAR_CONFIG = [
  { low: 37, high: 66, cutoff: 380, level: 0.42, wave: 'triangle' as OscillatorType, overtone: 'sine' as OscillatorType, ratio: 0.55 },
  { low: 53, high: 92, cutoff: 760, level: 0.34, wave: 'sawtooth' as OscillatorType, overtone: 'triangle' as OscillatorType, ratio: 2 },
  { low: 73, high: 126, cutoff: 1450, level: 0.3, wave: 'sawtooth' as OscillatorType, overtone: 'triangle' as OscillatorType, ratio: 2 },
  { low: 103, high: 180, cutoff: 2350, level: 0.27, wave: 'sawtooth' as OscillatorType, overtone: 'sine' as OscillatorType, ratio: 2.15 },
] as const;

/** Pick the next gear from the current one, with hysteresis so shifts do not chatter. */
export function nextGear(speed: number, gear: number) {
  const engineSpeed = Math.min(40, Math.abs(Number.isFinite(speed) ? speed : 0));
  let current = Math.max(1, Math.min(GEAR_COUNT, Math.round(gear) || 1)) - 1;
  while (current < GEAR_COUNT - 1 && engineSpeed >= ENGINE_GEAR_LIMITS[current + 1]) current++;
  while (current > 0 && engineSpeed < ENGINE_GEAR_LIMITS[current] - 1.3) current--;
  return current + 1;
}

/** How far the engine is into the current gear, from a low idle to a redline. */
export function gearRpm(speed: number, gear: number) {
  const engineSpeed = Math.min(40, Math.abs(Number.isFinite(speed) ? speed : 0));
  const index = Math.max(1, Math.min(GEAR_COUNT, Math.round(gear) || 1)) - 1;
  const start = ENGINE_GEAR_LIMITS[index];
  const end = ENGINE_GEAR_LIMITS[index + 1];
  return Math.max(0, Math.min(1, (engineSpeed - start) / (end - start)));
}

export function engineTone(speed: number, gear: number, boost = false, turbo = false) {
  const rpm = gearRpm(speed, gear);
  const index = Math.max(1, Math.min(GEAR_COUNT, Math.round(gear) || 1)) - 1;
  const profile = ENGINE_GEAR_CONFIG[index];
  const pitch = (profile.low + (profile.high - profile.low) * rpm) * (boost ? 1.035 : turbo ? 1.015 : 1);
  const cutoff = profile.cutoff * (0.84 + rpm * 0.4 + (boost ? 0.18 : 0));
  const volume = (0.078 + Math.min(40, Math.abs(speed)) / 40 * 0.038) * (turbo ? 1.12 : 1) * (boost ? 1.32 : 1);
  return { gear: index + 1, rpm, pitch, overtone: pitch * profile.ratio, cutoff, volume, level: profile.level };
}
