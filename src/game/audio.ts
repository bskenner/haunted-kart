import type { RaceEvent, RaceState } from './engine';
import { ENGINE_GEAR_CONFIG, ENGINE_GEAR_LIMITS, nextGear, gearRpm } from './engineSound.ts';

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
type EngineGearLayer = {
  oscillator: OscillatorNode;
  overtone: OscillatorNode;
  filter: BiquadFilterNode;
  gain: GainNode;
};

class GameAudio {
  ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private effectsBus: GainNode | null = null;
  private engineGain: GainNode | null = null;
  private engineGears: EngineGearLayer[] = [];
  private currentGear = 0;
  private shiftCount = 0;
  private engineAudible = false;
  private shiftOsc: OscillatorNode | null = null;
  private shiftGain: GainNode | null = null;
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
      const engineOut = ctx.createGain(); engineOut.gain.value = 0;
      this.engineGain = engineOut;
      engineOut.connect(this.effectsBus!);
      this.engineGears = ENGINE_GEAR_CONFIG.map(config => {
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass'; filter.frequency.value = config.cutoff; filter.Q.value = 0.65;
        const gain = ctx.createGain(); gain.gain.value = 0;
        const oscillator = ctx.createOscillator();
        oscillator.type = config.wave; oscillator.frequency.value = config.low;
        const overtone = ctx.createOscillator();
        overtone.type = config.overtone; overtone.frequency.value = config.low * config.ratio;
        oscillator.connect(filter); overtone.connect(filter);
        filter.connect(gain).connect(engineOut);
        oscillator.start(); overtone.start();
        return { oscillator, overtone, filter, gain };
      });
      const shiftFilter = ctx.createBiquadFilter();
      shiftFilter.type = 'bandpass'; shiftFilter.frequency.value = 480; shiftFilter.Q.value = 0.8;
      this.shiftGain = ctx.createGain(); this.shiftGain.gain.value = 0;
      this.shiftOsc = ctx.createOscillator(); this.shiftOsc.type = 'triangle'; this.shiftOsc.frequency.value = 220;
      this.shiftOsc.connect(shiftFilter).connect(this.shiftGain).connect(engineOut);
      this.shiftOsc.start();
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
    if (this.settings.muted || this.hidden || this.paused) {
      this.engineAudible = false;
      this.engineGain?.gain.cancelScheduledValues(t);
      this.engineGain?.gain.setTargetAtTime(0, t, 0.025);
      this.engineGears.forEach(layer => {
        layer.gain.gain.cancelScheduledValues(t);
        layer.gain.gain.setTargetAtTime(0, t, 0.025);
      });
      this.shiftGain?.gain.cancelScheduledValues(t);
      this.shiftGain?.gain.setTargetAtTime(0, t, 0.02);
      this.driftGain?.gain.cancelScheduledValues(t);
      this.driftGain?.gain.setTargetAtTime(0, t, 0.025);
    }
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

  private playShift(upshift: boolean, t: number) {
    if (!this.shiftOsc || !this.shiftGain) return;
    const gain = this.shiftGain.gain;
    gain.cancelScheduledValues(t);
    gain.setValueAtTime(0.0001, t);
    gain.linearRampToValueAtTime(0.046, t + 0.035);
    gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    this.shiftOsc.frequency.cancelScheduledValues(t);
    this.shiftOsc.frequency.setValueAtTime(upshift ? 250 : 185, t);
    this.shiftOsc.frequency.exponentialRampToValueAtTime(upshift ? 590 : 430, t + 0.075);
  }

  setEngine(speed: number, active: boolean, drift = 0, boosted = false, turbo = false) {
    if (!this.ctx || !this.engineGain || this.engineGears.length !== ENGINE_GEAR_CONFIG.length) return;
    const t = this.ctx.currentTime;
    if (t - this.lastEngineUpdate < 0.025 && active) return;
    this.lastEngineUpdate = t;
    const engineSpeed = Math.min(40, Math.abs(speed));
    const audible = active && !this.settings.muted && !this.hidden && !this.paused;
    this.engineAudible = audible;
    const previousGear = this.currentGear;
    this.currentGear = nextGear(engineSpeed, this.currentGear + 1) - 1;
    if (audible && this.currentGear !== previousGear) {
      this.shiftCount++;
      this.playShift(this.currentGear > previousGear, t);
    }

    const rpm = gearRpm(engineSpeed, this.currentGear + 1);
    const pitchBoost = boosted ? 1.035 : turbo ? 1.015 : 1;
    this.engineGears.forEach((layer, index) => {
      const profile = ENGINE_GEAR_CONFIG[index];
      const frequency = (profile.low + (profile.high - profile.low) * rpm) * pitchBoost;
      layer.oscillator.frequency.setTargetAtTime(frequency, t, 0.045);
      layer.overtone.frequency.setTargetAtTime(frequency * profile.ratio, t, 0.045);
      layer.filter.frequency.setTargetAtTime(
        profile.cutoff * (0.84 + rpm * 0.4 + (boosted ? 0.18 : 0)),
        t, 0.08,
      );
      layer.gain.gain.setTargetAtTime(audible && index === this.currentGear ? profile.level : 0, t, index === this.currentGear ? 0.045 : 0.025);
    });
    const intensity = (turbo ? 1.12 : 1) * (boosted ? 1.32 : 1);
    const normalized = engineSpeed / 40;
    this.engineGain.gain.setTargetAtTime(audible ? (0.078 + normalized * 0.038) * intensity : 0, t, 0.055);
    const driftAudible = audible && drift > 0;
    this.driftGain?.gain.setTargetAtTime(driftAudible ? 0.04 + Math.min(drift, 2) * 0.025 : 0, t, 0.04);
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
    if (type === 'hop') this.tone(260, 0.1, 'sine', 0.08, 0, 420);
    if (type === 'bump') this.tone(90, 0.09, 'triangle', 0.1, 0, 55);
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
    if (this.lastRace !== race) {
      this.lastRace = race;
      this.cursor = 0;
      this.currentGear = 0;
      this.lastEngineUpdate = -1;
      this.engineAudible = false;
      this.engineGain?.gain.cancelScheduledValues(this.ctx?.currentTime ?? 0);
      this.engineGain?.gain.setTargetAtTime(0, this.ctx?.currentTime ?? 0, 0.018);
      this.engineGears.forEach(layer => {
        layer.gain.gain.cancelScheduledValues(this.ctx?.currentTime ?? 0);
        layer.gain.gain.setTargetAtTime(0, this.ctx?.currentTime ?? 0, 0.018);
      });
      this.shiftGain?.gain.cancelScheduledValues(this.ctx?.currentTime ?? 0);
      this.shiftGain?.gain.setTargetAtTime(0, this.ctx?.currentTime ?? 0, 0.018);
      this.driftGain?.gain.setTargetAtTime(0, this.ctx?.currentTime ?? 0, 0.018);
    }
    if (paused) { this.setEngine(0, false); return; }
    for (const event of race.events) if (event.seq > this.cursor) { this.effect(event); this.cursor = event.seq; }
    const player = race.racers[0];
    this.setEngine(
      player.speed,
      race.countdown === 0 && player.finishTime === null && !race.finished,
      player.drifting ? player.driftCharge : 0,
      player.boost > 0,
      race.motorClass === 'turbo',
    );
  }
  /** Read-only diagnostics for autoplay, mixer and signal regression checks. */
  diagnostics() {
    const samples = new Float32Array(256);
    this.analyser?.getFloatTimeDomainData(samples);
    const rms = Math.sqrt(samples.reduce((sum, x) => sum + x * x, 0) / samples.length);
    return { started: !!this.ctx, state: this.ctx?.state, scene: this.scene, musicNotes: this.musicNotes,
      sounds: this.sounds, voices: this.voices, rms, settings: this.settings, eventCounts: { ...this.eventCounts }, signatures: [...this.signatures],
      musicGain: this.musicBus?.gain.value, effectsGain: this.effectsBus?.gain.value,
      engineGear: this.currentGear + 1, engineShifts: this.shiftCount,
      engineAudible: this.engineAudible,
      enginePitch: this.engineGears[this.currentGear]?.oscillator.frequency.value,
      engineLevel: this.engineGain?.gain.value,
      engineNodes: this.engineGears.length * 2 + (this.shiftOsc ? 1 : 0) };
  }
  dispose() {
    if (this.timer) clearInterval(this.timer);
    if (this.ctx) void this.ctx.close().catch(() => {});
  }
}
export const audio = new GameAudio();
if (import.meta.hot) import.meta.hot.dispose(() => audio.dispose());
