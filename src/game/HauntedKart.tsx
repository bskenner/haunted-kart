import { Suspense, useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Canvas } from '@react-three/fiber';
import { KeyboardControls } from '@react-three/drei';
import * as THREE from 'three';
import { CHARACTERS, createRace, useItem, type Input, type RaceResult } from './engine';
import { Scene, type Phase } from './scene';
import { HUD, Instructions, PauseButton, PauseOverlay, ResultsScreen, SelectScreen, TitleScreen, TopBar, TouchControls } from './ui';
import { audio } from './audio';
import { KEY_MAP as keyMap } from './controls';
import { loadDifficulty, saveDifficulty, type Difficulty } from './arcade';
import { loadMotorClass, saveMotorClass, type MotorClass } from './motors';

function hasWebGL() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch { return false; }
}

const firstId: number = CHARACTERS[0]?.id ?? 0;

function preferredRenderDpr() {
  if (typeof window === 'undefined') return 1;
  return Math.min(2, Math.max(1, window.devicePixelRatio || 1));
}

export default function HauntedKart() {
  const [webgl] = useState(hasWebGL);
  const [renderDpr, setRenderDpr] = useState(preferredRenderDpr);
  const [phase, setPhase] = useState<Phase>('title');
  const [selectedId, setSelectedId] = useState<number>(firstId);
  const [difficulty, setDifficulty] = useState<Difficulty>(loadDifficulty);
  const [motorClass, setMotorClass] = useState<MotorClass>(loadMotorClass);
  const raceRef = useRef(createRace(firstId));
  const [raceVersion, setRaceVersion] = useState(0);
  const touchRef = useRef<Input>({ accelerate: false, brake: false, left: false, right: false, drift: false, item: false });
  const pausedRef = useRef(false);
  const [paused, setPaused] = useState(false);
  const [ready, setReady] = useState(false);
  const [help, setHelp] = useState(false);
  const { muted } = useSyncExternalStore(audio.subscribe, audio.snapshot);
  const [results, setResults] = useState<RaceResult[]>([]);
  const helpWasPaused = useRef(false);

  useEffect(() => {
    const updateRenderDpr = () => setRenderDpr(preferredRenderDpr());
    window.addEventListener('resize', updateRenderDpr);
    return () => window.removeEventListener('resize', updateRenderDpr);
  }, []);

  const clearInputs = useCallback(() => {
    Object.keys(touchRef.current).forEach(key => { touchRef.current[key as keyof Input] = false; });
    // Browsers do not deliver keyup after changing tabs. Release drei's key
    // mappings explicitly so an abandoned press cannot steer the next race.
    keyMap.forEach(action => action.keys.forEach(code => {
      window.dispatchEvent(new KeyboardEvent('keyup', { code, key: code, bubbles: true }));
    }));
  }, []);
  const setPause = useCallback((v: boolean) => {
    // Clear on both pause and resume: keys used to navigate a pause menu must
    // never become held race controls when the overlay closes.
    clearInputs();
    audio.setPaused(v);
    pausedRef.current = v; setPaused(v);
  }, [clearInputs]);
  const newRace = useCallback((id: number) => { clearInputs(); raceRef.current = createRace(id, difficulty, motorClass); setRaceVersion(v => v + 1); }, [clearInputs, difficulty, motorClass]);
  const chooseDifficulty = (value: Difficulty) => { setDifficulty(value); saveDifficulty(value); };
  const chooseMotor = (value: MotorClass) => { setMotorClass(value); saveMotorClass(value); };
  const startRace = (id: number) => {
    audio.start(); setPause(false); newRace(id); setPhase('race');
    requestAnimationFrame(() => {
      const active = document.activeElement;
      if (active instanceof HTMLElement && /^(BUTTON|SELECT|INPUT)$/.test(active.tagName)) active.blur();
      const canvas = document.querySelector('canvas');
      if (canvas) { canvas.tabIndex = 0; canvas.focus({ preventScroll: true }); }
    });
  };
  const toMenu = useCallback(() => { setPause(false); newRace(selectedId); setPhase('title'); }, [setPause, newRace, selectedId]);
  const onFinish = useCallback(() => { setResults([...raceRef.current.results]); setPhase('results'); }, []);
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
    audio.setScene(phase === 'race' ? 'race' : phase === 'results' ? 'results' : 'menu');
  }, [phase]);
  useEffect(() => {
    const unlock = () => audio.start();
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => { window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock); };
  }, []);
  useEffect(() => {
    if (phase === 'race' && !paused && !help) return;
    const frame = requestAnimationFrame(() => {
      const selector = help ? '[data-menu-surface="help"]' : '[data-menu-surface]';
      const surface = document.querySelector<HTMLElement>(selector);
      const active = document.activeElement;
      if (surface && active instanceof HTMLElement && surface.contains(active)) return;
      const candidates = surface
        ? Array.from(surface.querySelectorAll<HTMLElement>('button:not([disabled]), select:not([disabled]), input:not([disabled])'))
          .filter(el => el.getClientRects().length > 0)
        : [];
      const preferred = surface?.querySelector<HTMLElement>('[data-testid="button-resume"]');
      (preferred ?? candidates[0])?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [phase, paused, help]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target instanceof HTMLElement ? e.target : null;
      const menuOpen = help || phase !== 'race' || pausedRef.current;
      if (e.code === 'Escape' && !e.repeat) {
        if (help) closeHelp();
        else if (phase === 'select') setPhase('title');
        else if (phase === 'results') toMenu();
        else if (phase === 'race' && pausedRef.current) setPause(false);
        else if (phase === 'race') setPause(true);
        return;
      }
      if (e.code === 'KeyP' && !e.repeat && phase === 'race' && !help) {
        setPause(!pausedRef.current);
        return;
      }
      if (!menuOpen) {
        if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
        if (!e.repeat && (e.code === 'Space' || e.code === 'KeyE')) useItem(raceRef.current);
        return;
      }
      if (e.repeat) return;

      if (e.code.startsWith('Arrow')) {
        if (target instanceof HTMLSelectElement) {
          if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
            const direction = e.code === 'ArrowRight' ? 1 : -1;
            const select = target;
            const next = (select.selectedIndex + direction + select.options.length) % select.options.length;
            e.preventDefault();
            if (next !== select.selectedIndex) {
              select.selectedIndex = next;
              select.dispatchEvent(new Event('change', { bubbles: true }));
            }
          }
          return;
        }
        if (target instanceof HTMLInputElement && target.type === 'range') return;
        const characterButton = target?.closest<HTMLElement>('[data-keyboard-character]');
        if (phase === 'select' && characterButton) {
          const buttons = Array.from(document.querySelectorAll<HTMLElement>('[data-keyboard-character]'));
          const index = buttons.indexOf(characterButton);
          const direction = e.code === 'ArrowLeft' || e.code === 'ArrowUp' ? -1 : 1;
          const next = buttons[(index + direction + buttons.length) % buttons.length];
          e.preventDefault();
          next?.focus({ preventScroll: true });
          next?.click();
          return;
        }
        e.preventDefault();
        const surface = document.querySelector<HTMLElement>(help ? '[data-menu-surface="help"]' : '[data-menu-surface]');
        const candidates = surface
          ? Array.from(surface.querySelectorAll<HTMLElement>('button:not([disabled]), select:not([disabled]), input:not([disabled])'))
            .filter(el => el.getClientRects().length > 0)
          : [];
        if (phase !== 'race' && !help) {
          const topbar = document.querySelector<HTMLElement>('[data-menu-topbar]');
          if (topbar) candidates.push(...Array.from(topbar.querySelectorAll<HTMLElement>('button:not([disabled])')).filter(el => el.getClientRects().length > 0));
        }
        if (!candidates.length) return;
        const index = candidates.indexOf(target as HTMLElement);
        const direction = e.code === 'ArrowLeft' || e.code === 'ArrowUp' ? -1 : 1;
        const nextIndex = index < 0 ? 0 : (index + direction + candidates.length) % candidates.length;
        candidates[nextIndex]?.focus({ preventScroll: true });
      } else if (e.code === 'Space' && !(target instanceof HTMLButtonElement) && !(target instanceof HTMLSelectElement)) {
        e.preventDefault();
      }
    };
    const onBlur = () => { clearInputs(); if (phase === 'race') setPause(true); };
    const onVisibility = () => { audio.setHidden(document.hidden); if (document.hidden) onBlur(); };
    window.addEventListener('keydown', onKey);
    window.addEventListener('blur', onBlur);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [phase, help, setPause, clearInputs, closeHelp, toMenu]);

  const toggleMute = () => { audio.start(); audio.setMuted(!muted); };

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
        <Canvas dpr={renderDpr} gl={{ antialias: true, powerPreference: 'high-performance', stencil: false }} camera={{ fov: 60, near: 0.1, far: 500, position: [0, 40, 60] }} onCreated={({ gl }) => {
          gl.outputColorSpace = THREE.SRGBColorSpace;
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.12;
          gl.domElement.tabIndex = 0;
          setReady(true);
        }}>
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

        {phase === 'title' && <TitleScreen difficulty={difficulty} onDifficulty={chooseDifficulty} motorClass={motorClass} onMotorClass={chooseMotor} onPlay={() => { audio.start(); setPhase('select'); }} onHelp={openHelp} />}
        {phase === 'select' && <SelectScreen difficulty={difficulty} onDifficulty={chooseDifficulty} motorClass={motorClass} onMotorClass={chooseMotor} selectedId={selectedId} onSelect={id => { setSelectedId(id); audio.selectMonster(id); }} onRace={() => startRace(selectedId)} onBack={() => setPhase('title')} />}
        {phase === 'race' && (
          <>
            <HUD key={raceVersion} raceRef={raceRef} pausedRef={pausedRef} />
            <TouchControls touchRef={touchRef} onItem={() => useItem(raceRef.current)} />
          </>
        )}
        {phase === 'results' && <ResultsScreen results={results} motorClass={raceRef.current.motorClass} playerId={selectedId} onAgain={() => startRace(selectedId)} onChange={() => { newRace(selectedId); setPhase('select'); }} onMenu={toMenu} />}
        {paused && phase === 'race' && <PauseOverlay onResume={() => setPause(false)} onRestart={() => startRace(selectedId)} onMenu={toMenu} />}
        {help && <Instructions onClose={closeHelp} />}
      </div>
    </KeyboardControls>
  );
}
