import { memo } from 'react';
import { CHARACTERS, TRACK_LENGTH, trackPoint } from './engine';

const points = Array.from({ length: 97 }, (_, i) => trackPoint(i / 96));
const minX = Math.min(...points.map(p => p.x)), minZ = Math.min(...points.map(p => p.z));
const spanX = Math.max(...points.map(p => p.x)) - minX, spanZ = Math.max(...points.map(p => p.z)) - minZ;
const project = (x: number, z: number) => ({ x: 10 + (x - minX) / spanX * 80, y: 10 + (z - minZ) / spanZ * 80 });
const path = points.map((p, i) => { const q = project(p.x, p.z); return `${i ? 'L' : 'M'}${q.x.toFixed(1)},${q.y.toFixed(1)}`; }).join(' ');

export const Minimap = memo(function Minimap({ racers }: { racers: { id: number; progress: number }[] }) {
  return (
    <div className="minimap panel rounded-2xl p-1 absolute left-3 top-28 md:top-auto md:bottom-4 w-[86px] h-[86px] md:w-28 md:h-28" aria-label="Minimapa da pista" data-testid="minimap">
      <svg viewBox="0 0 100 100" className="w-full h-full" role="img" aria-label="Posição dos seis monstros na pista">
        <path d={path} fill="none" stroke="#9d78c4" strokeWidth="6" strokeLinejoin="round" />
        <path d={path} fill="none" stroke="#382446" strokeWidth="3" />
        {racers.map((r, i) => {
          const p = trackPoint(r.progress / TRACK_LENGTH), q = project(p.x, p.z);
          return <circle key={r.id} cx={q.x} cy={q.y} r={i === 0 ? 4.3 : 2.9} fill={CHARACTERS[r.id].color} stroke={i === 0 ? '#fff' : '#171020'} strokeWidth={i === 0 ? 1.8 : 0.9} />;
        }).reverse()}
      </svg>
    </div>
  );
});
