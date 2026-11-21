import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { KeyboardControls } from '@react-three/drei';
import { CHARACTERS, createRace, type Input, type RaceResult } from './engine';
import { Scene, type Phase } from './scene';
import { HUD, Instructions, PauseButton, PauseOverlay, ResultsScreen, SelectScreen, TitleScreen, TopBar, TouchControls } from './ui';
import { audio } from './audio';

const keyMap = [
  { name: 'accelerate', keys: ['ArrowUp', 'KeyW'] },
  { name: 'brake', keys: ['ArrowDown', 'KeyS'] },
  { name: 'left', keys: ['ArrowLeft', 'KeyA'] },
  { name: 'right', keys: ['ArrowRight', 'KeyD'] },
  { name: 'drift', keys: ['Space'] },
  { name: 'item', keys: ['KeyE'] },
];

function hasWebGL() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch { return false; }
}

const firstId: number = CHARACTERS[0]?.id ?? 0;

export default function HauntedKart() {
  const [webgl] = useState(hasWebGL);
  const [phase, setPhase] = useState<Phase>('title');
  const [selectedId, setSelectedId] = useState<number>(firstId);
  const raceRef = useRef(createRace(firstId));
  const [raceVersion, setRaceVersion] = useState(0);
  const touchRef = useRef<Input>({ accelerate: false, brake: false, left: false, right: false, drift: false, item: false });
  const pausedRef = useRef(false);
  const [paused, setPaused] = useState(false);
  const [ready, setReady] = useState(false);
  const [help, setHelp] = useState(false);
  const [muted, setMuted] = useState(audio.muted);
  const [results, setResults] = useState<RaceResult[]>([]);
  const helpWasPaused = useRef(false);

  const clearInputs = useCallback(() => {
    Object.keys(touchRef.current).forEach(key => { touchRef.current[key as keyof Input] = false; });
    // Browsers do not deliver keyup after changing tabs. Release drei's key
    // mappings explicitly so an abandoned press cannot steer the next race.
    keyMap.forEach(action => action.keys.forEach(code => {
      window.dispatchEvent(new KeyboardEvent('keyup', { code, key: code, bubbles: true }));
    }));
  }, []);
  const setPause = useCallback((v: boolean) => {
    if (v) { clearInputs(); audio.setEngine(0, false); }
    pausedRef.current = v; setPaused(v);
  }, [clearInputs]);
  const newRace = useCallback((id: number) => { clearInputs(); raceRef.current = createRace(id); setRaceVersion(v => v + 1); }, [clearInputs]);
  const startRace = (id: number) => { audio.start(); setPause(false); newRace(id); setPhase('race'); };
  const toMenu = () => { setPause(false); newRace(selectedId); setPhase('title'); };
  const onFinish = useCallback(() => { setResults([...raceRef.current.results]); audio.blip(660, 0.5, 'triangle'); setPhase('results'); }, []);
  const onDemoEnd = useCallback(() => newRace(CHARACTERS[Math.floor(Math.random() * CHARACTERS.length)].id), [newRace]);
  const openHelp = () => {
    helpWasPaused.current = pausedRef.current;
    if (phase === 'race') setPause(true);
    setHelp(true);
  };
  const closeHelp = useCallback(() => {
    setHelp(false);
    if (phase === 'race' && !helpWasPaused.current) setPause(false);
  }, [phase, setPause]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
      if (e.repeat) return;
      if (e.code === 'Escape' && help) closeHelp();
      else if ((e.code === 'Escape' || e.code === 'KeyP') && phase === 'race' && !help) setPause(!pausedRef.current);
    };
    const onBlur = () => { clearInputs(); if (phase === 'race') setPause(true); };
    const onVisibility = () => { if (document.hidden) onBlur(); };
    window.addEventListener('keydown', onKey);
    window.addEventListener('blur', onBlur);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [phase, help, setPause, clearInputs, closeHelp]);

  const toggleMute = () => { audio.start(); audio.setMuted(!muted); setMuted(!muted); };

  if (!webgl) {
    return (
      <div className="min-h-[100dvh] night-bg grid place-items-center p-6 text-center">
        <div className="panel rounded-3xl p-8 max-w-md">
          <h1 className="logo-text text-6xl mb-3">Haunted Kart</h1>
          <p className="text-purple-100">Seu navegador ou dispositivo não suporta WebGL, necessário para exibir o mundo 3D do jogo.</p>
          <p className="text-purple-300 text-sm mt-3">Tente atualizar o navegador, ativar a aceleração de hardware ou abrir em outro dispositivo.</p>
        </div>
      </div>
    );
  }

  return (
    <KeyboardControls map={keyMap}>
      <div className="relative w-full h-[100dvh] overflow-hidden night-bg noise no-select">
        <Canvas dpr={[1, 1.5]} gl={{ antialias: true, powerPreference: 'high-performance' }} camera={{ fov: 60, near: 0.1, far: 700, position: [0, 40, 60] }} onCreated={() => setReady(true)}>
          <Suspense fallback={null}>
            <Scene phase={phase} raceRef={raceRef} raceVersion={raceVersion} selectedId={selectedId} touchRef={touchRef} pausedRef={pausedRef} onFinish={onFinish} onDemoEnd={onDemoEnd} />
          </Suspense>
        </Canvas>
        <div className="vignette" />

        {!ready && (
          <div className="absolute inset-0 z-50 night-bg grid place-items-center">
            <div className="text-center">
              <div className="logo-text text-6xl floaty">Haunted Kart</div>
              <p className="text-purple-200 mt-3 text-sm tracking-widest uppercase">Acordando os monstros...</p>
            </div>
          </div>
        )}

        <TopBar muted={muted} onMute={toggleMute} onHelp={openHelp}>
          {phase === 'race' && <PauseButton onClick={() => setPause(true)} />}
        </TopBar>

        {phase === 'title' && <TitleScreen onPlay={() => { audio.start(); setPhase('select'); }} onHelp={openHelp} />}
        {phase === 'select' && <SelectScreen selectedId={selectedId} onSelect={id => { setSelectedId(id); audio.blip(520, 0.08, 'triangle', 0.1); }} onRace={() => startRace(selectedId)} onBack={() => setPhase('title')} />}
        {phase === 'race' && (
          <>
            <HUD key={raceVersion} raceRef={raceRef} pausedRef={pausedRef} />
            <TouchControls touchRef={touchRef} />
          </>
        )}
        {phase === 'results' && <ResultsScreen results={results} playerId={selectedId} onAgain={() => startRace(selectedId)} onChange={() => setPhase('select')} onMenu={toMenu} />}
        {paused && phase === 'race' && <PauseOverlay onResume={() => setPause(false)} onRestart={() => startRace(selectedId)} onMenu={toMenu} />}
        {help && <Instructions onClose={closeHelp} />}
      </div>
    </KeyboardControls>
  );
}
