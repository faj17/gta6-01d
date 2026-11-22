// audio.js — every sound in Solmara is procedural WebAudio: no audio files, no
// network. Engine hum pitched by speed, a two-tone police siren, pickup blips,
// a mission-complete jingle and a crash thud. Created lazily on the first user
// gesture so browsers never block the page; M toggles mute.

export class GameAudio {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.engineOsc = null;
    this.engineGain = null;
    this.engineFilter = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.sirenTimer = 0;
    this.sirenHigh = false;
    this.started = false;
  }

  /** Call from a user gesture (button click / keydown). Safe to call repeatedly. */
  ensure() {
    if (this.started) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.started = true;
      this._buildEngine();
      this._buildSiren();
    } catch {
      this.ctx = null;
    }
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
  }

  setMuted(m) {
    this.muted = m;
    if (this.ctx) this.ctx.suspend().catch(() => {});
    if (!m) this.resume();
  }

  _buildEngine() {
    const ctx = this.ctx;
    this.engineOsc = ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 55;
    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 420;
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineOsc.connect(this.engineFilter).connect(this.engineGain).connect(ctx.destination);
    this.engineOsc.start();
  }

  _buildSiren() {
    const ctx = this.ctx;
    this.sirenOsc = ctx.createOscillator();
    this.sirenOsc.type = 'triangle';
    this.sirenOsc.frequency.value = 720;
    this.sirenGain = ctx.createGain();
    this.sirenGain.gain.value = 0;
    this.sirenOsc.connect(this.sirenGain).connect(ctx.destination);
    this.sirenOsc.start();
  }

  /** Per-frame: engine pitch follows speed (0..1), siren wails while wanted. */
  update(dt, speedNorm, wanted, driving) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    if (this.engineGain) {
      const target = driving ? 0.045 + 0.075 * speedNorm : 0.012;
      this.engineGain.gain.setTargetAtTime(target, t, 0.08);
      this.engineOsc.frequency.setTargetAtTime(52 + 165 * speedNorm, t, 0.08);
      this.engineFilter.frequency.setTargetAtTime(380 + 900 * speedNorm, t, 0.1);
    }
    if (this.sirenGain) {
      if (wanted > 0) {
        this.sirenTimer += dt;
        if (this.sirenTimer > 0.42) {
          this.sirenTimer = 0;
          this.sirenHigh = !this.sirenHigh;
          this.sirenOsc.frequency.setTargetAtTime(this.sirenHigh ? 880 : 620, t, 0.02);
        }
        this.sirenGain.gain.setTargetAtTime(0.028, t, 0.1);
      } else {
        this.sirenGain.gain.setTargetAtTime(0, t, 0.15);
      }
    }
  }

  _blip(freq, dur, type, vol, when = 0) {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + when;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(ctx.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  /** Short bright blip when a mission marker is reached. */
  pickup() {
    this._blip(880, 0.12, 'sine', 0.22);
    this._blip(1320, 0.18, 'sine', 0.18, 0.09);
  }

  /** Rising three-note jingle when a mission completes. */
  missionComplete() {
    this._blip(523, 0.16, 'triangle', 0.22);
    this._blip(659, 0.16, 'triangle', 0.22, 0.13);
    this._blip(784, 0.3, 'triangle', 0.24, 0.26);
  }

  /** Low thud for a hard crash. */
  crash(strength) {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const dur = 0.18;
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 320;
    const g = ctx.createGain();
    g.gain.value = Math.min(0.5, 0.12 + strength * 0.5);
    src.connect(filter).connect(g).connect(ctx.destination);
    src.start(t);
  }

  /** Dull click for UI buttons and entering a car. */
  click() { this._blip(660, 0.07, 'square', 0.1); }

  /** Alarm sting when the wanted level rises. */
  wantedUp() {
    this._blip(392, 0.12, 'square', 0.12);
    this._blip(311, 0.2, 'square', 0.12, 0.11);
  }
}
