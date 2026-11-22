import { DIFFICULTIES, type Difficulty } from './arcade';
import { MOTOR_CLASSES, type MotorClass } from './motors';

export interface DifficultyProps {
  difficulty: Difficulty; onDifficulty: (value: Difficulty) => void;
  motorClass: MotorClass; onMotorClass: (value: MotorClass) => void;
}
export function DifficultySelect({ difficulty, onDifficulty, motorClass, onMotorClass }: DifficultyProps) {
  return (
    <div className="w-full max-w-xs space-y-2">
    <label className="flex items-center justify-between gap-4 w-full max-w-xs text-purple-100 text-sm">
      <span>Dificuldade</span>
      <select aria-label="Dificuldade" data-testid="select-difficulty" value={difficulty} onChange={e => onDifficulty(e.target.value as Difficulty)}
        className="rounded-xl border border-purple-500/50 bg-purple-950 px-3 py-2 text-orange-200 cursor-pointer">
        {Object.entries(DIFFICULTIES).map(([value, data]) => <option key={value} value={value}>{data.label}</option>)}
      </select>
    </label>
    <label className="flex items-center justify-between gap-3 text-purple-100 text-sm">
      <span>Velocidade do motor</span>
      <select aria-label="Velocidade do motor" data-testid="select-motor" value={motorClass} onChange={e => onMotorClass(e.target.value as MotorClass)}
        className="rounded-xl border border-cyan-500/50 bg-purple-950 px-3 py-2 text-cyan-200 cursor-pointer">
        {Object.entries(MOTOR_CLASSES).map(([value, data]) => <option key={value} value={value}>{data.label}</option>)}
      </select>
    </label>
    <p className="text-[10px] leading-tight text-purple-300">Dificuldade: desafio dos adversários.<br />Motor: velocidade e aceleração de todos os karts.</p>
    </div>
  );
}
