// Procedural WebAudio: ambient drone, engine hum and blips. No external files.
class GameAudio {
  ctx: AudioContext | null = null;
  master: GainNode | null = null;
  engineOsc: OscillatorNode | null = null;
  engineGain: GainNode | null = null;
  muted = typeof localStorage !== 'undefined' && localStorage.getItem('hk-muted') === '1';

  start() {
    if (this.ctx) { void this.ctx.resume(); return; }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    const master = ctx.createGain();
    master.gain.value = this.muted ? 0 : 0.5;
    master.connect(ctx.destination);
    this.master = master;
    // drone
    const droneGain = ctx.createGain();
    droneGain.gain.value = 0.05;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    droneGain.connect(filter).connect(master);
    [55, 82.4, 110.6].forEach((f, i) => {
      const o = ctx.createOscillator();
      o.type = i === 1 ? 'triangle' : 'sawtooth';
      o.frequency.value = f;
      o.detune.value = i * 7;
      o.connect(droneGain);
      o.start();
    });
    // engine
    const eg = ctx.createGain();
    eg.gain.value = 0;
    const ef = ctx.createBiquadFilter();
    ef.type = 'lowpass';
    ef.frequency.value = 700;
    const eo = ctx.createOscillator();
    eo.type = 'sawtooth';
    eo.frequency.value = 60;
    eo.connect(ef).connect(eg).connect(master);
    eo.start();
    this.engineOsc = eo;
    this.engineGain = eg;
  }

  setEngine(speed: number, active: boolean) {
    if (!this.ctx || !this.engineOsc || !this.engineGain) return;
    const t = this.ctx.currentTime;
    this.engineOsc.frequency.setTargetAtTime(48 + Math.abs(speed) * 4.2, t, 0.1);
    this.engineGain.gain.setTargetAtTime(active ? 0.07 : 0, t, 0.2);
  }

  blip(freq: number, dur = 0.18, type: OscillatorType = 'square', vol = 0.15) {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  setMuted(m: boolean) {
    this.muted = m;
    localStorage.setItem('hk-muted', m ? '1' : '0');
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.5, this.ctx.currentTime, 0.05);
  }
}

export const audio = new GameAudio();
