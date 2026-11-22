import type { RaceEvent, RaceState } from './engine';

export interface AudioSettings { music: number; effects: number; muted: boolean }
type MusicScene = 'menu' | 'race' | 'results';
const bound = (v: number) => Math.max(0, Math.min(1, v));
function loadSettings(): AudioSettings {
  try {
    const saved = JSON.parse(localStorage.getItem('hk-audio') || '{}');
    return {
      music: typeof saved.music === 'number' ? bound(saved.music) : 0.55,
      effects: typeof saved.effects === 'number' ? bound(saved.effects) : 0.8,
      muted: typeof saved.muted === 'boolean' ? saved.muted : localStorage.getItem('hk-muted') === '1',
    };
  } catch { return { music: 0.55, effects: 0.8, muted: false }; }
}
const hz = (note: number) => 440 * 2 ** ((note - 69) / 12);
// Original minor-key phrases composed for Haunted Kart. No recordings or samples.
const MENU = [74, 0, 77, 76, 74, 69, 70, 0, 73, 0, 76, 74, 73, 68, 69, 0];
const RACE = [74, 77, 81, 77, 76, 74, 69, 72, 74, 77, 82, 81, 77, 76, 73, 69];

class GameAudio {
  ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private effectsBus: GainNode | null = null;
  private engineGain: GainNode | null = null;
  private engineOsc: OscillatorNode | null = null;
  private engineOvertone: OscillatorNode | null = null;
  private driftGain: GainNode | null = null;
  private driftFilter: BiquadFilterNode | null = null;
  private noise: AudioBuffer | null = null;
  private analyser: AnalyserNode | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private nextBeat = 0;
  private step = 0;
  private scene: MusicScene = 'menu';
  private paused = false;
  private hidden = false;
  private lastRace: RaceState | null = null;
  private cursor = 0;
  private lastEngineUpdate = -1;
  private musicNotes = 0;
  private sounds = 0;
  private eventCounts: Record<string, number> = {};
  private signatures: number[] = [0, 0, 0, 0, 0, 0];
  private voices = 0;
  private listeners = new Set<() => void>();
  settings: AudioSettings = loadSettings();
  get muted() { return this.settings.muted; }
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  snapshot = () => this.settings;

  start() {
    if (this.ctx) { void this.ctx.resume().catch(() => {}); return; }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    try {
      const ctx = new AC();
      this.ctx = ctx;
      this.master = ctx.createGain();
      this.musicBus = ctx.createGain();
      this.effectsBus = ctx.createGain();
      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -10; limiter.knee.value = 12; limiter.ratio.value = 8;
      this.analyser = ctx.createAnalyser(); this.analyser.fftSize = 256;
      this.musicBus.connect(this.master);
      this.effectsBus.connect(this.master);
      this.master.connect(limiter).connect(this.analyser).connect(ctx.destination);
      this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      this.engineGain = ctx.createGain(); this.engineGain.gain.value = 0;
      const engineFilter = ctx.createBiquadFilter(); engineFilter.type = 'lowpass'; engineFilter.frequency.value = 650;
      this.engineOsc = ctx.createOscillator(); this.engineOsc.type = 'sawtooth'; this.engineOsc.frequency.value = 45;
      this.engineOvertone = ctx.createOscillator(); this.engineOvertone.type = 'triangle'; this.engineOvertone.frequency.value = 90;
      this.engineOsc.connect(engineFilter); this.engineOvertone.connect(engineFilter);
      engineFilter.connect(this.engineGain).connect(this.effectsBus);
      this.engineOsc.start(); this.engineOvertone.start();
      const drift = ctx.createBufferSource(); drift.buffer = this.noise; drift.loop = true;
      this.driftFilter = ctx.createBiquadFilter(); this.driftFilter.type = 'bandpass'; this.driftFilter.frequency.value = 1800; this.driftFilter.Q.value = 2;
      this.driftGain = ctx.createGain(); this.driftGain.gain.value = 0;
      drift.connect(this.driftFilter).connect(this.driftGain).connect(this.effectsBus); drift.start();
      this.applySettings();
      this.nextBeat = ctx.currentTime + 0.06;
      this.timer = setInterval(() => this.scheduleMusic(), 80);
      this.scheduleMusic();
      void ctx.resume().catch(() => {});
    } catch {
      // Audio failure must not prevent racing (unsupported or denied audio device).
      this.ctx = null;
    }
  }

  setVolume(kind: 'music' | 'effects', value: number) {
    this.settings = { ...this.settings, [kind]: bound(Number.isFinite(value) ? value : 0) };
    this.persist();
  }
  setMuted(muted: boolean) { this.settings = { ...this.settings, muted }; this.persist(); }
  private persist() {
    try {
      localStorage.setItem('hk-audio', JSON.stringify(this.settings));
      localStorage.setItem('hk-muted', this.settings.muted ? '1' : '0');
    } catch { /* Preferences still work when storage is unavailable. */ }
    this.applySettings();
    this.listeners.forEach(fn => fn());
  }
  private applySettings() {
    if (!this.ctx || !this.master || !this.musicBus || !this.effectsBus) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.settings.muted || this.hidden ? 0 : 0.7, t, 0.035);
    this.musicBus.gain.setTargetAtTime(this.settings.music * (this.paused ? 0.38 : 1), t, 0.12);
    this.effectsBus.gain.setTargetAtTime(this.settings.effects, t, 0.035);
  }
  setScene(scene: MusicScene) {
    if (scene === this.scene) return;
    this.scene = scene; this.step = 0;
    if (this.ctx) this.nextBeat = this.ctx.currentTime + 0.1;
  }
  setPaused(paused: boolean) {
    this.paused = paused;
    if (paused) this.setEngine(0, false);
    this.applySettings();
  }
  setHidden(hidden: boolean) {
    this.hidden = hidden; this.applySettings();
    if (!this.ctx) return;
    if (hidden) void this.ctx.suspend().catch(() => {});
    else { this.nextBeat = this.ctx.currentTime + 0.1; void this.ctx.resume().catch(() => {}); }
  }

  private tone(frequency: number, duration: number, type: OscillatorType = 'sine', volume = 0.12,
    delay = 0, endFrequency?: number, music = false) {
    const ctx = this.ctx, bus = music ? this.musicBus : this.effectsBus;
    if (!ctx || !bus || this.voices >= 48) return;
    const t = ctx.currentTime + Math.max(0, delay);
    const osc = ctx.createOscillator(), gain = ctx.createGain();
    osc.type = type; osc.frequency.setValueAtTime(Math.max(20, frequency), t);
    if (endFrequency) osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), t + duration);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), t + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(0.025, duration));
    osc.connect(gain).connect(bus);
    this.voices++;
    osc.onended = () => { osc.disconnect(); gain.disconnect(); this.voices--; };
    osc.start(t); osc.stop(t + duration + 0.03);
    if (music) this.musicNotes++; else this.sounds++;
  }
  private hiss(duration: number, frequency: number, volume = 0.13, delay = 0, endFrequency?: number, music = false) {
    const ctx = this.ctx, bus = music ? this.musicBus : this.effectsBus;
    if (!ctx || !bus || !this.noise || this.voices >= 48) return;
    const t = ctx.currentTime + delay, source = ctx.createBufferSource();
    source.buffer = this.noise; source.loop = true;
    const filter = ctx.createBiquadFilter(); filter.type = 'bandpass'; filter.frequency.setValueAtTime(frequency, t); filter.Q.value = 1.4;
    if (endFrequency) filter.frequency.exponentialRampToValueAtTime(endFrequency, t + duration);
    const gain = ctx.createGain(); gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(volume, t + 0.025); gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    source.connect(filter).connect(gain).connect(bus);
    this.voices++;
    source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect(); this.voices--; };
    source.start(t); source.stop(t + duration + 0.03);
    if (!music) this.sounds++;
  }
  private scheduleMusic() {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running' || this.hidden) return;
    if (this.nextBeat < ctx.currentTime - 0.2) this.nextBeat = ctx.currentTime + 0.03;
    const racing = this.scene === 'race';
    const interval = 60 / (racing ? 132 : 84) / 2;
    while (this.nextBeat < ctx.currentTime + 0.18) {
      const delay = this.nextBeat - ctx.currentTime, s = this.step % 64;
      const root = [38, 41, 43, 37][Math.floor(s / 16)];
      const phrase = (racing ? RACE : MENU)[s % 16];
      if (phrase) {
        this.tone(hz(phrase + root - 38), racing ? 0.25 : 0.7, racing ? 'triangle' : 'sine', racing ? 0.105 : 0.14, delay, undefined, true);
        if (!racing) this.tone(hz(phrase + root - 26), 0.45, 'sine', 0.035, delay, undefined, true);
      }
      if (s % (racing ? 2 : 4) === 0) this.tone(hz(root), interval * 1.5, 'triangle', 0.13, delay, undefined, true);
      if (racing) {
        if (s % 4 === 0) this.tone(100, 0.15, 'sine', 0.18, delay, 35, true);
        this.hiss(0.045, s % 4 === 2 ? 1700 : 6500, s % 4 === 2 ? 0.07 : 0.025, Math.max(0, delay), undefined, true);
      }
      this.step++; this.nextBeat += interval;
    }
  }

  setEngine(speed: number, active: boolean, drift = 0) {
    if (!this.ctx || !this.engineOsc || !this.engineGain) return;
    const t = this.ctx.currentTime;
    if (t - this.lastEngineUpdate < 0.025 && active) return;
    this.lastEngineUpdate = t;
    const normalized = Math.min(1.5, Math.abs(speed) / 31);
    this.engineOsc.frequency.setTargetAtTime(43 + normalized * 115, t, 0.07);
    this.engineOvertone?.frequency.setTargetAtTime(86 + normalized * 230, t, 0.07);
    this.engineGain.gain.setTargetAtTime(active ? 0.028 + normalized * 0.055 : 0, t, 0.06);
    this.driftGain?.gain.setTargetAtTime(active && drift > 0 ? 0.04 + Math.min(drift, 2) * 0.025 : 0, t, 0.04);
    this.driftFilter?.frequency.setTargetAtTime(1300 + Math.min(drift, 2) * 450, t, 0.1);
  }
  blip(freq: number, dur = 0.18, type: OscillatorType = 'square', vol = 0.1) { this.tone(freq, dur, type, vol); }
  selectMonster(id: number) {
    this.start();
    this.signatures[id]++;
    if (id === 0) { this.tone(450, 0.7, 'sine', 0.19, 0, 850); this.tone(457, 0.8, 'sine', 0.08, 0.05, 280); }
    if (id === 1) { this.tone(115, 0.65, 'sawtooth', 0.1, 0, 65); this.tone(118, 0.6, 'triangle', 0.12, 0.04, 62); }
    if (id === 2) { for (let i = 0; i < 4; i++) this.hiss(0.12, 2400 - i * 250, 0.12, i * 0.1); }
    if (id === 3) { for (let i = 0; i < 5; i++) { this.tone(150 + i * 240, 0.08, 'sawtooth', 0.07, i * 0.065, 80); this.hiss(0.055, 4000, 0.1, i * 0.065); } }
    if (id === 4) { this.hiss(0.7, 5500, 0.21, 0, 1500); this.tone(330, 0.35, 'triangle', 0.04); }
    if (id === 5) { this.tone(210, 0.5, 'sawtooth', 0.075, 0, 510); this.tone(510, 0.65, 'sine', 0.17, 0.35, 270); }
  }
  private effect(event: RaceEvent) {
    const { type, value = 0, item } = event;
    const key = type === 'use' ? `use:${item}` : type;
    this.eventCounts[key] = (this.eventCounts[key] ?? 0) + 1;
    if (type === 'countdown') this.tone(value ? 440 : 880, value ? 0.16 : 0.45, 'square', 0.09);
    if (type === 'pickup') [660, 880, 1320].forEach((f, i) => this.tone(f, 0.17, 'sine', 0.15, i * 0.06));
    if (type === 'boost' || type === 'launch') { this.hiss(0.65, 450, 0.28, 0, 4200); this.tone(220, 0.45, 'triangle', 0.08, 0, 880); }
    if (type === 'tier') this.tone(value === 2 ? 1174 : 784, 0.22, 'sine', 0.1);
    if (type === 'hit' || type === 'wall' || type === 'stumble') {
      this.hiss(type === 'wall' ? 0.16 : 0.4, 550, 0.18);
      this.tone(130, 0.28, 'sawtooth', 0.13, 0, 40);
    }
    if (type === 'shield') [1046, 1568].forEach((f, i) => this.tone(f, 0.35, 'sine', 0.14, i * 0.06));
    if (type === 'use') {
      if (item === 'bats') for (let i = 0; i < 5; i++) { this.hiss(0.12, 1900 + i * 350, 0.1, i * 0.08); this.tone(1600 + i * 130, 0.08, 'sine', 0.045, i * 0.08); }
      if (item === 'pumpkin') { this.tone(190, 0.35, 'triangle', 0.25, 0, 45); this.hiss(0.3, 650, 0.25); }
      if (item === 'ghost') this.tone(330, 0.6, 'sine', 0.14, 0, 1320);
      if (item === 'bones') [784, 1046, 1568, 2093].forEach((f, i) => this.tone(f, 0.32, 'sine', 0.12, i * 0.06));
      if (item === 'slime') for (let i = 0; i < 5; i++) this.tone(180 + i * 55, 0.14, 'sine', 0.14, i * 0.07, 70);
    }
    if (type === 'lap' || type === 'finalLap' || type === 'finish') {
      const notes = type === 'finish' ? [74, 77, 81, 86, 81, 86] : type === 'finalLap' ? [74, 77, 81, 84, 86] : [74, 77, 81];
      notes.forEach((n, i) => this.tone(hz(n), type === 'finish' ? 0.45 : 0.22, 'triangle', 0.17, i * 0.13));
    }
  }
  sync(race: RaceState, paused: boolean) {
    if (this.lastRace !== race) { this.lastRace = race; this.cursor = 0; }
    if (paused) { this.setEngine(0, false); return; }
    for (const event of race.events) if (event.seq > this.cursor) { this.effect(event); this.cursor = event.seq; }
    const player = race.racers[0];
    this.setEngine(player.speed, race.countdown === 0 && player.finishTime === null && !race.finished, player.drifting ? player.driftCharge : 0);
  }
  /** Read-only diagnostics for autoplay, mixer and signal regression checks. */
  diagnostics() {
    const samples = new Float32Array(256);
    this.analyser?.getFloatTimeDomainData(samples);
    const rms = Math.sqrt(samples.reduce((sum, x) => sum + x * x, 0) / samples.length);
    return { started: !!this.ctx, state: this.ctx?.state, scene: this.scene, musicNotes: this.musicNotes,
      sounds: this.sounds, voices: this.voices, rms, settings: this.settings, eventCounts: { ...this.eventCounts }, signatures: [...this.signatures],
      musicGain: this.musicBus?.gain.value, effectsGain: this.effectsBus?.gain.value, enginePitch: this.engineOsc?.frequency.value };
  }
  dispose() {
    if (this.timer) clearInterval(this.timer);
    if (this.ctx) void this.ctx.close().catch(() => {});
  }
}
export const audio = new GameAudio();
if (import.meta.hot) import.meta.hot.dispose(() => audio.dispose());
