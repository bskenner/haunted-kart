export const MOTOR_CLASSES = {
  normal: { label: 'Normal', speed: 1, acceleration: 1, steering: 1, grip: 1, camera: 6 },
  turbo: { label: 'Turbo', speed: 1.22, acceleration: 1.25, steering: 1.1, grip: 1.15, camera: 7.8 },
} as const;
export type MotorClass = keyof typeof MOTOR_CLASSES;
export function loadMotorClass(): MotorClass {
  try { return localStorage.getItem('hk-motor-class') === 'turbo' ? 'turbo' : 'normal'; }
  catch { return 'normal'; }
}
export function saveMotorClass(value: MotorClass) {
  try { localStorage.setItem('hk-motor-class', value); } catch { /* Session selection still works without storage. */ }
}
