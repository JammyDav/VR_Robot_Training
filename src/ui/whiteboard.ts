import * as THREE from 'three';
import { Panel, setText, type Button } from './kit/Panel';
import { CHALLENGES, type Challenges, type ChallengeId } from '../core/challenges';
import { BRAND } from '../config/brand';
import type { Text } from 'troika-three-text';

// Whiteboard challenge list: hand-written-looking (Kalam) but legible. Each
// item has a marker-drawn box; completing it draws a two-stroke tick.

const LIST_W = 0.92;
const LIST_H = 0.8;
const PITCH = 0.064;
const BOX = 0.026;
const STROKE = 0.0032;
const INK = 0x262b2c;
const INK_DONE = BRAND.cbreGreen;
const TICK_TIME = 0.45;

export interface WhiteboardSound {
  cycle(): void;
  label(): string;
}

export class ChallengeBoard {
  readonly list = new Panel(LIST_W, LIST_H, 0xfcfcfa, 80);
  readonly controls = new Panel(0.5, 0.075, 0xfcfcfa);
  private items: Array<{ id: ChallengeId; text: Text; t: number }> = [];
  private counter: Text;
  private strokes: THREE.InstancedMesh;
  private resetBtn: Button;
  private soundBtn: Button;
  private armedUntil = 0;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private z = new THREE.Vector3(0, 0, 1);
  private tmpS = new THREE.Vector3();
  private tmpP = new THREE.Vector3();

  constructor(private ch: Challenges, mount: THREE.Object3D, sound: WhiteboardSound) {
    const L = this.list;
    L.position.set(0, -0.135, 0.001);
    mount.add(L);

    CHALLENGES.forEach((c, i) => {
      const y = -0.01 - i * PITCH;
      // Marker box: four thin strokes, slightly uneven.
      const j = (k: number) => ((Math.sin(i * 7.1 + k * 3.3) * 0.5) * 0.0012);
      L.addRect(0.004, y + j(1), BOX, STROKE, INK);
      L.addRect(0.004, y - BOX + STROKE + j(2), BOX + 0.001, STROKE, INK);
      L.addRect(0.004 + j(3), y, STROKE, BOX, INK);
      L.addRect(0.004 + BOX - STROKE, y + j(4), STROKE, BOX, INK);
      const text = L.addText({
        text: `${c.id}. ${c.text}`, size: 0.0242, font: 'marker', color: INK, maxWidth: LIST_W - 0.05, lineHeight: 1.08,
        position: [0.045, y + 0.004, 0],
      });
      this.items.push({ id: c.id, text, t: ch.isDone(c.id) ? TICK_TIME : -1 });
    });
    this.counter = L.addText({ text: '', size: 0.026, font: 'markerBold', color: INK_DONE, position: [0.004, -0.01 - CHALLENGES.length * PITCH - 0.004, 0] });

    // Tick strokes: two quads per item, origin at the stroke's start.
    const quad = new THREE.PlaneGeometry(1, 1).translate(0.5, 0, 0);
    this.strokes = new THREE.InstancedMesh(quad, new THREE.MeshBasicMaterial({ color: INK_DONE, toneMapped: false }), CHALLENGES.length * 2);
    this.strokes.position.z = 0.0009;
    this.strokes.frustumCulled = false;
    L.add(this.strokes);

    // Lower-right corner: sound level and the guarded board reset.
    const C = this.controls;
    C.position.set(1.18, -0.99, 0.001);
    mount.add(C);
    this.soundBtn = C.addButton({ id: 'sound', label: '', x: 0, y: -0.005, w: 0.2, h: 0.065, size: 0.024, onClick: () => sound.cycle() });
    this.resetBtn = C.addButton({ id: 'resetBoard', label: 'Reset board', x: 0.215, y: -0.005, w: 0.285, h: 0.065, size: 0.024, onClick: () => this.onReset() });
    this.sound = sound;

    ch.events.on('completed', (e) => { const it = this.items.find((x) => x.id === e.id); if (it) it.t = 0; });
    ch.events.on('reset', () => this.items.forEach((x) => { x.t = -1; }));
  }
  private sound: WhiteboardSound;

  private onReset() {
    const now = performance.now();
    if (now < this.armedUntil) { this.armedUntil = 0; this.ch.reset(); }
    else this.armedUntil = now + 4000;
  }

  update(dt: number) {
    this.items.forEach((it, i) => {
      const done = this.ch.isDone(it.id);
      if (done && it.t < TICK_TIME) it.t = Math.min(TICK_TIME, Math.max(0, it.t) + dt);
      setText(it.text, it.text.text, done ? INK_DONE : INK);
      // Tick: short down-stroke, then the long up-stroke.
      const p = done ? Math.max(0, it.t) / TICK_TIME : 0;
      const a = Math.min(1, p / 0.35), b = Math.max(0, (p - 0.35) / 0.65);
      const y = -0.01 - i * PITCH;
      const x0 = 0.004 + BOX * 0.15, y0 = y - BOX * 0.55;
      const x1 = x0 + 0.011, y1 = y - BOX * 0.95;
      this.setStroke(i * 2, x0, y0, x1, y1, a);
      this.setStroke(i * 2 + 1, x1, y1, x1 + 0.03, y + 0.012, b);
    });
    this.strokes.instanceMatrix.needsUpdate = true;
    setText(this.counter, `${this.ch.count} of ${CHALLENGES.length} complete`);
    const armed = performance.now() < this.armedUntil;
    this.resetBtn.setLabel(armed ? 'Tap again to clear' : 'Reset board');
    this.resetBtn.setBaseColor(armed ? 0xfbefd8 : 0xe6eaea);
    this.soundBtn.setLabel(this.sound.label());
  }

  private setStroke(i: number, x0: number, y0: number, x1: number, y1: number, k: number) {
    const len = Math.hypot(x1 - x0, y1 - y0) * k;
    this.q.setFromAxisAngle(this.z, Math.atan2(y1 - y0, x1 - x0));
    this.m.compose(this.tmpP.set(x0, y0, 0), this.q, this.tmpS.set(Math.max(len, 1e-6), k > 0 ? STROKE * 1.3 : 1e-6, 1));
    this.strokes.setMatrixAt(i, this.m);
  }
}
