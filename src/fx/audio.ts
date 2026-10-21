import * as THREE from 'three';

// Synthesised cell audio (Web Audio API, no files). Positional sources use
// equal-power panning (cheap on Quest). Default volume is low.

export type Volume = 'off' | 'low' | 'medium';
const LEVEL: Record<Volume, number> = { off: 0, low: 0.22, medium: 0.5 };
const NEXT: Record<Volume, Volume> = { off: 'low', low: 'medium', medium: 'off' };
const KEY = 'tx260.volume';

interface Loop { gain: GainNode; panner: PannerNode; osc: OscillatorNode[]; filter?: BiquadFilterNode }

export class CellAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private servo: Loop | null = null;
  private tray: Loop | null = null;
  private hum: Loop | null = null;
  private whir: Loop | null = null;
  private noise: AudioBuffer | null = null;
  volume: Volume;

  constructor() {
    let v: Volume = 'low';
    try { const s = localStorage.getItem(KEY) as Volume | null; if (s && s in LEVEL) v = s; } catch { /* default */ }
    this.volume = v;
    // Browsers only allow audio after a user gesture.
    const start = () => this.ensure();
    window.addEventListener('pointerdown', start);
    window.addEventListener('keydown', start);
  }

  cycleVolume() {
    this.volume = NEXT[this.volume];
    try { localStorage.setItem(KEY, this.volume); } catch { /* unavailable */ }
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(LEVEL[this.volume], this.ctx.currentTime, 0.05);
    this.ensure();
  }
  get volumeLabel() { return `Sound: ${this.volume === 'off' ? 'off' : this.volume}`; }

  /** Create / resume the context (call from a gesture; also on XR session start). */
  ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      const ctx = new AC();
      this.ctx = ctx;
      this.master = ctx.createGain();
      this.master.gain.value = LEVEL[this.volume];
      this.master.connect(ctx.destination);
      const len = Math.floor(ctx.sampleRate * 0.2);
      this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.servo = this.loop([['sawtooth', 150], ['sawtooth', 301], ['triangle', 75]], { type: 'bandpass', freq: 900, q: 3 });
      this.tray = this.loop([['square', 92], ['sawtooth', 184]], { type: 'lowpass', freq: 520, q: 0.7 });
      this.hum = this.loop([['sine', 110], ['sine', 220.5]]);
      this.whir = this.loop([['triangle', 310], ['sine', 620]], { type: 'lowpass', freq: 1400, q: 0.5 });
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  private loop(oscs: Array<[OscillatorType, number]>, f?: { type: BiquadFilterType; freq: number; q: number }): Loop {
    const ctx = this.ctx!;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    const panner = ctx.createPanner();
    panner.panningModel = 'equalpower';
    panner.distanceModel = 'inverse';
    panner.refDistance = 1;
    panner.rolloffFactor = 0.8;
    let input: AudioNode = gain;
    let filter: BiquadFilterNode | undefined;
    if (f) {
      filter = ctx.createBiquadFilter();
      filter.type = f.type;
      filter.frequency.value = f.freq;
      filter.Q.value = f.q;
      filter.connect(gain);
      input = filter;
    }
    gain.connect(panner).connect(this.master!);
    const osc = oscs.map(([type, freq]) => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = freq;
      o.connect(input);
      o.start();
      return o;
    });
    return { gain, panner, osc, filter };
  }

  private place(l: Loop | null, p: THREE.Vector3) {
    if (!l || !this.ctx) return;
    const t = this.ctx.currentTime;
    l.panner.positionX.setValueAtTime(p.x, t);
    l.panner.positionY.setValueAtTime(p.y, t);
    l.panner.positionZ.setValueAtTime(p.z, t);
  }

  /** Per-frame: listener pose, continuous sources. */
  update(o: {
    camera: THREE.Camera;
    robotPos: THREE.Vector3; jointSpeed: number; // 0…1 (fraction of max)
    readerPos: THREE.Vector3; trayMoving: boolean; reading: boolean;
    dispenserPos: THREE.Vector3; dispensing: boolean;
  }) {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const t = ctx.currentTime;
    const L = ctx.listener;
    o.camera.matrixWorld.decompose(lp, lq, ls);
    fwd.set(0, 0, -1).applyQuaternion(lq);
    up.set(0, 1, 0).applyQuaternion(lq);
    if (L.positionX) {
      L.positionX.setValueAtTime(lp.x, t); L.positionY.setValueAtTime(lp.y, t); L.positionZ.setValueAtTime(lp.z, t);
      L.forwardX.setValueAtTime(fwd.x, t); L.forwardY.setValueAtTime(fwd.y, t); L.forwardZ.setValueAtTime(fwd.z, t);
      L.upX.setValueAtTime(up.x, t); L.upY.setValueAtTime(up.y, t); L.upZ.setValueAtTime(up.z, t);
    } else {
      (L as unknown as { setPosition(x: number, y: number, z: number): void }).setPosition(lp.x, lp.y, lp.z);
    }

    // Servo whine: pitch and level follow joint speed.
    const sp = Math.min(1, o.jointSpeed);
    this.place(this.servo, o.robotPos);
    if (this.servo) {
      const base = 110 + 520 * sp;
      this.servo.osc[0].frequency.setTargetAtTime(base, t, 0.05);
      this.servo.osc[1].frequency.setTargetAtTime(base * 2.01, t, 0.05);
      this.servo.osc[2].frequency.setTargetAtTime(base * 0.5, t, 0.05);
      this.servo.filter!.frequency.setTargetAtTime(600 + 2200 * sp, t, 0.05);
      this.servo.gain.gain.setTargetAtTime(sp > 0.002 ? 0.025 + 0.11 * Math.sqrt(sp) : 0, t, 0.06);
    }
    this.place(this.tray, o.readerPos);
    this.tray?.gain.gain.setTargetAtTime(o.trayMoving ? 0.07 : 0, t, 0.04);
    this.place(this.hum, o.readerPos);
    this.hum?.gain.gain.setTargetAtTime(o.reading ? 0.035 : 0, t, 0.2);
    this.place(this.whir, o.dispenserPos);
    this.whir?.gain.gain.setTargetAtTime(o.dispensing ? 0.03 : 0, t, 0.15);
  }

  // --- One-shots -------------------------------------------------------------------
  private tone(freq: number, start: number, dur: number, peak: number, type: OscillatorType = 'sine', filterHz?: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, start);
    g.gain.linearRampToValueAtTime(peak, start + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    let node: AudioNode = o;
    if (filterHz) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = filterHz;
      o.connect(f);
      node = f;
    }
    node.connect(g).connect(this.master!);
    o.start(start);
    o.stop(start + dur + 0.02);
  }

  private burst(start: number, dur: number, peak: number, hp: number) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = hp;
    const g = ctx.createGain();
    g.gain.setValueAtTime(peak, start);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    src.connect(f).connect(g).connect(this.master!);
    src.start(start);
    src.stop(start + dur + 0.02);
  }

  private ready() { return !!this.ctx && this.ctx.state === 'running'; }

  gripperClick(closed: boolean) {
    if (!this.ready()) return;
    const t = this.ctx!.currentTime;
    this.burst(t, 0.035, closed ? 0.35 : 0.2, 2200);
    this.tone(closed ? 1900 : 1500, t, 0.06, closed ? 0.12 : 0.07, 'triangle');
  }

  chime() {
    if (!this.ready()) return;
    const t = this.ctx!.currentTime;
    this.tone(659.25, t, 0.7, 0.16);
    this.tone(987.77, t + 0.11, 0.9, 0.13);
    this.tone(1318.5, t + 0.11, 0.6, 0.03);
  }

  fault() {
    if (!this.ready()) return;
    const t = this.ctx!.currentTime;
    this.tone(440, t, 0.24, 0.12, 'square', 1600);
    this.tone(349.2, t + 0.26, 0.34, 0.12, 'square', 1600);
  }

  estop() {
    if (!this.ready()) return;
    const t = this.ctx!.currentTime;
    for (let i = 0; i < 3; i++) this.tone(330, t + i * 0.18, 0.14, 0.13, 'square', 1200);
  }

  click() {
    if (!this.ready()) return;
    this.tone(2600, this.ctx!.currentTime, 0.025, 0.04, 'triangle');
  }
}

const lp = new THREE.Vector3(), ls = new THREE.Vector3(), fwd = new THREE.Vector3(), up = new THREE.Vector3();
const lq = new THREE.Quaternion();
