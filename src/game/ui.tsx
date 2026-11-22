import { useEffect, useState, type MutableRefObject, type ReactNode } from 'react';
import { Bone, ChevronLeft, ChevronRight, FlaskConical, Ghost, HelpCircle, Pause, Play, RotateCcw, Users, Volume2, VolumeX, X, Home, Flag } from 'lucide-react';
import { CHARACTERS, ITEMS, TRACK_LENGTH, driftTier, formatTime, useItem, type Input, type RaceResult, type RaceState } from './engine';
import { SoundControls } from './SoundControls';
import { Minimap } from './Minimap';
import { DifficultySelect, type DifficultyProps } from './DifficultySelect';
import { DIFFICULTIES } from './arcade';
import { MOTOR_CLASSES, type MotorClass } from './motors';

const LAPS = 3;

export function ItemIcon({ id, className = 'w-8 h-8' }: { id: string; className?: string }) {
  if (id === 'ghost') return <Ghost className={className} />;
  if (id === 'bones') return <Bone className={className} />;
  if (id === 'slime') return <FlaskConical className={className} />;
  if (id === 'pumpkin')
    return (
      <svg viewBox="0 0 32 32" className={className} fill="currentColor"><path d="M16 7c-1-3 1-5 3-5-1 1-1 3-1 5 6 0 11 4 11 11s-6 11-13 11S3 25 3 18 9 7 16 7Z" opacity=".9" /><path d="M10 15l3 3h-4zM22 15l1 3h-4zM10 22h12l-2 2-2-1-2 1-2-1-2 1z" fill="#1a0f2e" /></svg>
    );
  return (
    <svg viewBox="0 0 32 32" className={className} fill="currentColor"><path d="M16 12c1-2 2-3 2-3l1 3c3-2 7-2 11 0-2 1-3 3-3 6-2-2-4-1-5 1-1-1-3-1-4 1-1-2-3-2-4-1-1-2-3-3-5-1 0-3-1-5-3-6 4-2 8-2 11 0l1-3s1 1 2 3z" /></svg>
  );
}

export function TopBar({ muted, onMute, onHelp, children }: { muted: boolean; onMute: () => void; onHelp: () => void; children?: ReactNode }) {
  return (
    <div className="absolute top-3 right-3 z-30 flex gap-2">
      {children}
      <button aria-label="Como jogar" data-testid="button-help" onClick={onHelp} className="btn-ghost rounded-xl w-11 h-11 grid place-items-center"><HelpCircle className="w-5 h-5" /></button>
      <button aria-label={muted ? 'Ativar som' : 'Desativar som'} data-testid="button-mute" onClick={onMute} className="btn-ghost rounded-xl w-11 h-11 grid place-items-center">
        {muted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5 text-orange-300" />}
      </button>
    </div>
  );
}

export function TitleScreen({ onPlay, onHelp, ...difficulty }: { onPlay: () => void; onHelp: () => void } & DifficultyProps) {
  return (
    <div className="title-screen absolute inset-0 z-20 flex flex-col items-center justify-between p-6 pb-5 pointer-events-none overflow-y-auto gap-5">
      <div className="mt-[4vh] text-center rise">
        <p className="text-xs sm:text-sm tracking-[0.5em] uppercase text-purple-200/80 mb-2">Corrida de monstros sob a lua cheia</p>
        <h1 className="logo-text text-[19vw] sm:text-[9rem] leading-[0.85] flicker" data-testid="text-title">Haunted<br />Kart</h1>
      </div>
      <div className="flex flex-col items-center gap-2.5 pointer-events-auto rise" style={{ animationDelay: '.3s' }}>
        <button data-testid="button-play" onClick={onPlay} className="btn-pumpkin pulse-ring rounded-2xl px-14 py-4 text-2xl font-extrabold uppercase tracking-wider">Jogar</button>
        <button data-testid="button-instructions" onClick={onHelp} className="text-purple-200 underline underline-offset-4 decoration-orange-400/60 hover:text-orange-300">Como jogar</button>
        <DifficultySelect {...difficulty} />
        <SoundControls />
        <p className="text-xs text-purple-300/60 font-mono">3 voltas no Cemitério da Colina Torta</p>
      </div>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div>
      <div className="flex justify-between text-xs uppercase tracking-widest text-purple-200/80 mb-1"><span>{label}</span><span className="font-mono">{value}/10</span></div>
      <div className="h-2.5 rounded-full bg-purple-950/80 overflow-hidden flex gap-[2px] p-[2px]">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="flex-1 rounded-sm transition-all duration-300" style={{ background: i < value ? color : 'hsl(268 35% 22%)', opacity: i < value ? 1 : 0.6 }} />
        ))}
      </div>
    </div>
  );
}

export function SelectScreen({ selectedId, onSelect, onRace, onBack, ...difficulty }: { selectedId: number; onSelect: (id: number) => void; onRace: () => void; onBack: () => void } & DifficultyProps) {
  const idx = Math.max(0, CHARACTERS.findIndex(c => c.id === selectedId));
  const ch = CHARACTERS[idx];
  const step = (d: number) => onSelect(CHARACTERS[(idx + d + CHARACTERS.length) % CHARACTERS.length].id);
  return (
    <div className="absolute inset-0 z-20 flex flex-col md:flex-row md:items-stretch justify-end md:justify-start p-3 md:p-6 gap-3 pointer-events-none">
      <div className="panel rounded-3xl p-4 md:p-6 md:w-[420px] pointer-events-auto rise flex flex-col gap-4 min-h-0 max-h-full overflow-y-auto">
        <div className="flex items-center gap-2">
          <button data-testid="button-back" onClick={onBack} className="btn-ghost rounded-xl w-9 h-9 grid place-items-center" aria-label="Voltar"><ChevronLeft className="w-5 h-5" /></button>
          <h2 className="text-sm uppercase tracking-[0.3em] text-purple-200">Escolha seu monstro</h2>
        </div>
        <div className="grid grid-cols-6 md:grid-cols-3 gap-2">
          {CHARACTERS.map(c => (
            <button key={c.id} aria-label={c.name} aria-pressed={c.id === selectedId} data-testid={`button-character-${c.id}`} onClick={() => onSelect(c.id)}
              className={`rounded-xl p-1.5 md:p-3 text-left transition-all border ${c.id === selectedId ? 'border-orange-400 bg-orange-500/15 -translate-y-0.5' : 'border-purple-700/40 bg-purple-950/40 hover:bg-purple-900/50'}`}>
              <div className="w-full aspect-square md:aspect-[2/1] rounded-lg mb-0 md:mb-1.5" style={{ background: `radial-gradient(circle at 40% 40%, ${c.color}, ${c.accent})` }} />
              <div className="hidden md:block text-sm font-semibold truncate">{c.name}</div>
            </button>
          ))}
        </div>
        <div>
          <div className="flex items-center justify-between">
            <button onClick={() => step(-1)} className="btn-ghost rounded-lg w-8 h-8 grid place-items-center md:hidden" aria-label="Anterior" data-testid="button-prev"><ChevronLeft className="w-4 h-4" /></button>
            <h3 className="font-display text-4xl md:text-5xl" style={{ color: ch.color }} data-testid="text-character-name">{ch.name}</h3>
            <button onClick={() => step(1)} className="btn-ghost rounded-lg w-8 h-8 grid place-items-center md:hidden" aria-label="Próximo" data-testid="button-next"><ChevronRight className="w-4 h-4" /></button>
          </div>
          <p className="text-purple-200/90 text-sm mt-1 min-h-[2.5em]">{ch.description}</p>
        </div>
        <div className="space-y-2.5">
          <Stat label="Velocidade" value={ch.speed} color="#ff7a1a" />
          <Stat label="Aceleração" value={ch.acceleration} color="#c78bff" />
          <Stat label="Dirigibilidade" value={ch.handling} color="#9be255" />
        </div>
        <DifficultySelect {...difficulty} />
        <button data-testid="button-race" onClick={onRace} className="btn-pumpkin rounded-2xl py-3.5 text-xl font-extrabold uppercase tracking-wider flex items-center justify-center gap-2 md:mt-auto">
          <Flag className="w-5 h-5" /> Correr
        </button>
      </div>
    </div>
  );
}

function rankOf(race: RaceState) {
  const order = race.racers.map((r, i) => ({ i, r })).sort((a, b) => {
    const fa = a.r.finishTime, fb = b.r.finishTime;
    if (fa != null && fb != null) return fa - fb;
    if (fa != null) return -1;
    if (fb != null) return 1;
    return b.r.progress - a.r.progress;
  });
  return order.findIndex(o => o.i === 0) + 1;
}

interface Snap {
  lap: number; pos: number; total: number; time: number; speed: number; lane: number; item: string | null;
  countdown: number; message: string; boost: boolean; drift: number; offroad: boolean; wrongWay: boolean;
  pickup: boolean; used: boolean; hit: boolean; racers: { id: number; progress: number }[];
  roulette: number; recovery: number; hop: number; direction: number; draft: number; drafting: boolean; difficulty: string;
  motorClass: MotorClass;
}

export function HUD({ raceRef, pausedRef }: { raceRef: MutableRefObject<RaceState>; pausedRef: MutableRefObject<boolean> }) {
  const [s, setS] = useState<Snap | null>(null);
  useEffect(() => {
    const tick = () => {
      const race = raceRef.current;
      const p = race.racers[0];
      setS({
        lap: Math.min(LAPS, Math.floor(Math.max(0, p.progress) / TRACK_LENGTH) + 1),
        pos: rankOf(race), total: race.racers.length, time: p.finishTime ?? race.time, speed: p.finishTime === null ? p.speed : 0, lane: p.lane,
        item: p.item, countdown: race.countdown, message: race.messageTime > 0 ? race.message : '', boost: p.boost > 0, drift: p.drifting ? p.driftCharge : 0,
        offroad: p.offroad, wrongWay: p.wrongWay > 0.35, pickup: p.pickupFlash > 0, used: p.useFlash > 0, hit: p.hitFlash > 0,
        racers: race.racers.map(r => ({ id: r.id, progress: r.progress })),
        roulette: p.roulette, recovery: p.recovery, hop: p.hop, direction: p.driftDirection,
        draft: p.draftCharge, drafting: p.draftActive, difficulty: DIFFICULTIES[race.difficulty].label,
        motorClass: race.motorClass,
      });
    };
    tick();
    const id = setInterval(tick, 100);
    return () => { clearInterval(id); };
  }, [raceRef, pausedRef]);
  if (!s) return null;
  const item = s.roulette > 0 ? ITEMS[Math.floor(s.time * 14) % ITEMS.length] : s.item ? ITEMS.find(i => i.id === s.item) : null;
  const cdNum = Math.ceil(s.countdown);
  const showCd = s.countdown > 0;
  const showGo = s.countdown <= 0 && s.time < 0.8;
  return (
    <div className="absolute inset-0 z-20 pointer-events-none no-select" data-testid="race-hud"
      data-lane={s.lane.toFixed(3)} data-drift={s.drift.toFixed(3)} data-drift-tier={driftTier(s.drift)} data-drift-direction={s.direction} data-hop={s.hop.toFixed(3)}
      data-offroad={s.offroad} data-boost={s.boost} data-item={s.item ?? ''} data-item-ready={!!s.item && s.roulette === 0}
      data-countdown={s.countdown.toFixed(3)} data-roulette={s.roulette > 0} data-difficulty={s.difficulty} data-motor-class={s.motorClass} data-recovery={s.recovery.toFixed(2)}>
      {s.hit && <div className="absolute inset-0 bg-red-500/15 border-4 border-red-400/40" />}
      {s.used && <div className="absolute inset-0 border-4 border-violet-300/40 shadow-[inset_0_0_60px_#9b65dc33]" />}
      <div className="absolute top-3 left-3 flex gap-2 items-start">
        <div className="panel rounded-2xl px-4 py-2 text-center">
          <div className="text-[10px] uppercase tracking-[0.3em] text-purple-300">Posição</div>
          <div className="font-display text-5xl leading-none text-orange-400" data-testid="text-position">{s.pos}º<span className="text-xl text-purple-200">/{s.total}</span></div>
        </div>
        <div className="panel rounded-2xl px-4 py-2">
          <div className="text-[10px] uppercase tracking-[0.3em] text-purple-300">Volta</div>
          <div className="font-mono text-2xl font-bold" data-testid="text-lap">{s.lap}/{LAPS}</div>
          <div className="font-mono text-sm text-orange-200" data-testid="text-timer">{formatTime(s.time)}</div>
          <div className="text-[9px] text-purple-300">{s.difficulty}</div>
        </div>
      </div>
      <button type="button" disabled={!s.item || s.roulette > 0 || pausedRef.current} onClick={() => useItem(raceRef.current)} aria-label={s.roulette > 0 ? 'Sorteando poder' : item ? `Usar ${item.name}` : 'Sem item'}
        className={`absolute top-[4.5rem] right-3 md:top-16 panel rounded-2xl w-20 h-20 grid place-items-center pointer-events-auto transition-transform ${s.pickup ? 'scale-110 ring-4 ring-orange-300/70' : ''}`}
        data-testid="status-item" style={{ borderColor: item?.color }}>
        {item ? <div className={`flex flex-col items-center ${s.roulette > 0 ? 'item-roulette' : ''}`} style={{ color: item.color }}><ItemIcon id={item.id} className="w-8 h-8" /><span className="text-[9px] uppercase tracking-wider mt-0.5 text-center leading-tight px-1">{s.roulette > 0 ? 'Sorteando...' : item.name}</span>
          {s.roulette === 0 && <span className="mouse-only text-[8px] text-purple-100 mt-0.5">ESPAÇO USA</span>}</div>
          : <span className="text-[10px] uppercase tracking-widest text-purple-400/70">Sem item</span>}
      </button>
      <div data-testid="text-motor-class" className="absolute top-40 right-3 panel rounded-lg px-2 py-1 text-[10px] text-cyan-200">Motor: {MOTOR_CLASSES[s.motorClass].label}</div>
      <Minimap racers={s.racers} />
      <div className="race-speed absolute bottom-4 left-1/2 -translate-x-1/2 md:left-auto md:right-6 md:translate-x-0 text-center md:text-right">
        <div className={`font-mono font-bold text-4xl md:text-5xl leading-none ${s.boost ? 'text-cyan-200' : 'text-orange-100'}`} data-testid="text-speed">{Math.round(Math.abs(s.speed) * 3.6)}</div>
        <div className="text-[10px] uppercase tracking-[0.3em] text-purple-300">km/h</div>
        {s.drift > 0 && <div className="mt-2">
          <div className="text-[10px] font-bold mb-1" style={{ color: driftTier(s.drift) === 2 ? '#ff9b37' : '#58cfff' }}>{driftTier(s.drift) === 2 ? 'SUPERTURBO' : driftTier(s.drift) === 1 ? 'TURBO AZUL' : 'CARREGANDO TURBO'}</div>
          <div className="h-2 w-28 rounded-full bg-purple-950 overflow-hidden ml-auto mr-auto md:mr-0"><div className="h-full" style={{ width: `${Math.min(100, s.drift / 1.5 * 100)}%`, background: driftTier(s.drift) === 2 ? '#ff9b37' : '#58cfff' }} /></div>
        </div>}
        {s.offroad && <div className="text-xs text-orange-200 font-bold mt-1" data-testid="warning-offroad">Fora da pista!</div>}
        {s.recovery > 0 && <div className="text-xs text-cyan-200 mt-1">Proteção após impacto</div>}
        {s.drafting && <div className="text-xs text-cyan-200 mt-1" data-testid="status-draft">Vácuo {Math.min(100, Math.round(s.draft / 1.1 * 100))}%</div>}
      </div>
      {s.message && <div key={s.message} className="absolute top-[30%] left-1/2 -translate-x-1/2 panel rounded-2xl px-5 py-2 text-orange-200 font-semibold rise w-max max-w-[90vw] text-center" data-testid="text-message">{s.message}</div>}
      {s.wrongWay && <div role="alert" data-testid="warning-wrong-way" className="absolute top-[43%] left-1/2 -translate-x-1/2 panel rounded-2xl px-5 py-3 text-orange-200 font-extrabold w-max max-w-[90vw] text-center">Contramão!<span className="block text-xs font-normal">Acelere para seguir na direção certa.</span></div>}
      {showCd && !showGo && <div key={cdNum} className="absolute inset-0 grid place-items-center"><span className="logo-text text-[9rem] md:text-[13rem] pop" data-testid="text-countdown">{cdNum}</span></div>}
      {showGo && <div className="absolute inset-0 grid place-items-center"><span className="logo-text text-[8rem] md:text-[12rem] pop" style={{ color: '#9be255' }}>Vai!</span></div>}
    </div>
  );
}

type Key = keyof Input;
function TouchBtn({ k, touchRef, className, children, label, onPress }: { k: Key; touchRef: MutableRefObject<Input>; className: string; children: ReactNode; label: string; onPress?: () => void }) {
  const [on, setOn] = useState(false);
  const set = (v: boolean) => { touchRef.current[k] = v; setOn(v); };
  useEffect(() => {
    const release = () => { touchRef.current[k] = false; setOn(false); };
    window.addEventListener('blur', release);
    document.addEventListener('visibilitychange', release);
    return () => { release(); window.removeEventListener('blur', release); document.removeEventListener('visibilitychange', release); };
  }, [k, touchRef]);
  return (
    <button aria-label={label} data-testid={`touch-${k}`}
      onPointerDown={e => { e.preventDefault(); (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); set(true); onPress?.(); }}
      onPointerUp={() => set(false)} onPointerCancel={() => set(false)} onLostPointerCapture={() => set(false)}
      onContextMenu={e => e.preventDefault()}
      className={`pointer-events-auto rounded-full grid place-items-center font-bold uppercase text-xs transition-transform ${on ? 'scale-90 brightness-125' : ''} ${className}`}>
      {children}
    </button>
  );
}

export function TouchControls({ touchRef, onItem }: { touchRef: MutableRefObject<Input>; onItem: () => void }) {
  useEffect(() => {
    const release = () => { (Object.keys(touchRef.current) as Key[]).forEach(k => { touchRef.current[k] = false; }); };
    window.addEventListener('blur', release);
    document.addEventListener('visibilitychange', release);
    return () => { release(); window.removeEventListener('blur', release); document.removeEventListener('visibilitychange', release); };
  }, [touchRef]);
  const ghost = 'bg-purple-900/60 border border-purple-400/40 text-purple-100 backdrop-blur';
  return (
    <div className="touch-only absolute inset-x-0 bottom-0 z-30 flex justify-between items-end p-4 pb-6 pointer-events-none no-select">
      <div className="flex gap-3">
        <TouchBtn k="left" touchRef={touchRef} label="Esquerda" className={`w-20 h-20 ${ghost}`}><ChevronLeft className="w-9 h-9" /></TouchBtn>
        <TouchBtn k="right" touchRef={touchRef} label="Direita" className={`w-20 h-20 ${ghost}`}><ChevronRight className="w-9 h-9" /></TouchBtn>
      </div>
      <div className="grid grid-cols-2 gap-2.5 items-end">
        <TouchBtn k="item" touchRef={touchRef} onPress={onItem} label="Usar poder" className="w-14 h-14 bg-purple-600/70 border border-purple-300/50 text-white">Poder</TouchBtn>
        <TouchBtn k="drift" touchRef={touchRef} label="Pular e derrapar" className="w-14 h-14 bg-cyan-700/60 border border-cyan-200/50 text-white"><span className="text-[9px]">Derrapar</span></TouchBtn>
        <TouchBtn k="brake" touchRef={touchRef} label="Frear" className={`w-16 h-16 ${ghost}`}>Freio</TouchBtn>
        <TouchBtn k="accelerate" touchRef={touchRef} label="Acelerar" className="w-20 h-20 btn-pumpkin">Gás</TouchBtn>
      </div>
    </div>
  );
}

export function ResultsScreen({ results, motorClass, playerId, onAgain, onChange, onMenu }: { results: RaceResult[]; motorClass: MotorClass; playerId: number; onAgain: () => void; onChange: () => void; onMenu: () => void }) {
  const sorted = [...results].sort((a, b) => a.position - b.position);
  return (
    <div className="absolute inset-0 z-20 flex items-start justify-center p-4 overflow-y-auto">
      <div className="panel rounded-3xl p-5 md:p-8 w-full max-w-lg rise my-auto">
        <p className="text-xs uppercase tracking-[0.4em] text-purple-300 text-center">Resultado final</p>
        <h2 className="logo-text text-6xl text-center mb-2">Bandeirada!</h2>
        <p data-testid="result-motor-class" className="text-center text-cyan-200 text-sm mb-4">Velocidade do motor: {MOTOR_CLASSES[motorClass].label}</p>
        <ol className="space-y-1.5">
          {sorted.map(r => {
            const c = CHARACTERS.find(ch => ch.id === r.id);
            return (
              <li key={r.id} data-testid={`row-result-${r.id}`} className={`flex items-center gap-3 rounded-xl px-3 py-2 ${r.position === 1 ? 'bg-orange-500/20 border border-orange-400/50' : 'bg-purple-950/50'}`}>
                <span className="font-display text-3xl w-8 text-center text-orange-400">{r.position}º</span>
                <span className="w-7 h-7 rounded-full shrink-0" style={{ background: `radial-gradient(circle at 35% 35%, ${c?.color}, ${c?.accent})` }} />
                <span className="flex-1 font-semibold">{c?.name ?? `Corredor ${r.id}`}{r.id === playerId && <span className="block text-xs text-orange-200">Você</span>}</span>
                <span className="text-right">
                  <span className="font-mono block">{formatTime(r.time)}</span>
                  {r.estimated && <span className="text-[10px] uppercase tracking-wider text-purple-300">Tempo estimado</span>}
                </span>
              </li>
            );
          })}
        </ol>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-6">
          <button data-testid="button-race-again" onClick={onAgain} className="btn-pumpkin rounded-2xl py-3 font-extrabold uppercase flex items-center justify-center gap-2"><RotateCcw className="w-4 h-4" /> Correr de novo</button>
          <button data-testid="button-change-character" onClick={onChange} className="btn-ghost rounded-2xl py-3 font-semibold flex items-center justify-center gap-2"><Users className="w-4 h-4" /> Trocar personagem</button>
        </div>
        <button data-testid="button-menu" onClick={onMenu} className="w-full mt-2 text-sm text-purple-300 hover:text-orange-300 py-2 flex items-center justify-center gap-1"><Home className="w-4 h-4" /> Menu principal</button>
      </div>
    </div>
  );
}

export function PauseButton({ onClick }: { onClick: () => void }) {
  return <button aria-label="Pausar" data-testid="button-pause" onClick={onClick} className="btn-ghost rounded-xl w-11 h-11 grid place-items-center"><Pause className="w-5 h-5" /></button>;
}

export function PauseOverlay({ onResume, onRestart, onMenu }: { onResume: () => void; onRestart: () => void; onMenu: () => void }) {
  return (
    <div className="absolute inset-0 z-40 flex items-start justify-center bg-[#12081f]/70 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="panel rounded-3xl p-6 w-full max-w-xs text-center rise my-auto">
        <h2 className="logo-text text-5xl mb-4">Pausa</h2>
        <div className="flex flex-col gap-2">
          <SoundControls />
          <button data-testid="button-resume" onClick={onResume} className="btn-pumpkin rounded-2xl py-3 font-extrabold uppercase flex items-center justify-center gap-2"><Play className="w-4 h-4" /> Continuar</button>
          <button data-testid="button-restart" onClick={onRestart} className="btn-ghost rounded-2xl py-3 font-semibold">Reiniciar corrida</button>
          <button data-testid="button-quit" onClick={onMenu} className="btn-ghost rounded-2xl py-3 font-semibold">Sair para o menu</button>
        </div>
      </div>
    </div>
  );
}

export function Instructions({ onClose }: { onClose: () => void }) {
  const rows: [string, string][] = [
    ['Seta para cima / W', 'Acelerar'], ['Seta para baixo / S', 'Frear; segure parado para dar ré'], ['Setas laterais / A D', 'Virar'],
    ['Espaço', 'Usar o poder após a roleta'], ['Shift (ou Z/X)', 'Pular e derrapar; solte para turbinar'], ['Esc / P', 'Pausar'],
  ];
  return (
    <div className="absolute inset-0 z-50 flex items-start justify-center bg-[#12081f]/75 backdrop-blur-sm p-4 overflow-y-auto" onClick={onClose}>
      <div className="panel rounded-3xl p-6 w-full max-w-lg rise relative my-auto" onClick={e => e.stopPropagation()}>
        <button onClick={onClose} aria-label="Fechar" data-testid="button-close-help" className="absolute top-4 right-4 btn-ghost rounded-xl w-9 h-9 grid place-items-center"><X className="w-4 h-4" /></button>
        <h2 className="logo-text text-5xl mb-1">Como jogar</h2>
        <p className="text-purple-200 text-sm mb-4">Três voltas pelo cemitério. Pegue as caixas roxas, solte as maldições e cruze a linha antes dos outros monstros.</p>
        <p className="text-cyan-200 text-sm mb-4">Velocidade do motor: Normal para o ritmo clássico, Turbo para mais velocidade e aceleração de todos os karts. A dificuldade muda o desafio dos adversários, independentemente do motor.</p>
        <p className="text-orange-200 text-sm mb-4">Largada especial: aperte a seta para cima (ou W) quando aparecer o 1 e segure até o Vai! Espaço só usa poderes. Acelerar cedo demais faz o motor engasgar.</p>
        <p className="text-purple-200 text-sm mb-4">Na derrapagem, a direção fica travada: use as setas para fechar ou abrir o arco. Faíscas azuis dão turbo; laranjas dão superturbo. Siga de perto outro kart para pegar vácuo e passe pelas faixas ciano para ganhar impulso. Após um ataque, você recebe proteção breve.</p>
        <div className="mouse-only space-y-1.5 mb-4">
          {rows.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3 text-sm border-b border-purple-800/50 pb-1.5"><span className="font-mono text-orange-300">{k}</span><span className="text-right text-purple-100">{v}</span></div>
          ))}
        </div>
        <p className="touch-only text-sm text-purple-100 mb-4">Toque nas setas à esquerda para virar. À direita: Gás acelera, Freio freia ou dá ré, Derrapar pula e derrapa, e Poder usa o item sorteado.</p>
        <h3 className="text-xs uppercase tracking-[0.3em] text-purple-300 mb-2">Itens</h3>
        <div className="grid grid-cols-5 gap-2">
          {ITEMS.map(it => (
            <div key={it.id} className="flex flex-col items-center text-center gap-1 rounded-xl bg-purple-950/50 p-2" style={{ color: it.color }}>
              <ItemIcon id={it.id} className="w-7 h-7" />
              <span className="text-[10px] leading-tight text-purple-100">{it.name}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
