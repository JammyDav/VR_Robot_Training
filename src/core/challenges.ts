import { Matrix4, Quaternion, Vector3 } from 'three';
import type { Controller } from './Controller';
import { Emitter } from './events';
import { persistenceEvents } from './persistence';
import { gripPoseBase, dispenserSeat, readerSeat, TRAY_OUT, STATIC_BOXES } from './cell/geometry';
import { fk } from './kinematics/chain';
import { BASE_TO_WORLD } from './frames';
import { SEAT_TOLERANCE } from '../config/plate';
import { BENCH } from '../config/cellLayout';

// Whiteboard challenges. Each completion condition is detected from live
// state and events; nothing is self-reported. Progress persists.

export const CHALLENGES = [
  { id: 1, text: 'Enable the arm and jog J1 at least 30° in each direction.' },
  { id: 2, text: 'Switch to Tool jog and move the TCP 100 mm straight down, then back up.' },
  { id: 3, text: 'Set the speed to 10%, then reduce it to 5%.' },
  { id: 4, text: 'Open and close the gripper.' },
  { id: 5, text: 'Teach pSafe: a pose clear of both instruments.' },
  { id: 6, text: 'Teach pDispenser so a plate seats correctly in the nest.' },
  { id: 7, text: 'Teach pReader so a plate seats correctly on the extended tray.' },
  { id: 8, text: 'Build and run a program that moves a plate from dispenser to reader without a fault.' },
  { id: 9, text: 'Add approach points so the arm never descends on a plate from the side.' },
  { id: 10, text: 'Run the full cycle at 100% in Local with no faults.' },
  { id: 11, text: 'Trigger and reset an emergency stop safely.' },
  { id: 12, text: 'Export your program.' },
] as const;

export type ChallengeId = (typeof CHALLENGES)[number]['id'];

const KEY = 'tx260.challenges.v1';
const DEG = Math.PI / 180;

export interface ChallengeEvents extends Record<string, unknown> {
  completed: { id: ChallengeId };
  reset: Record<string, never>;
}

const v = new Vector3(), v2 = new Vector3(), s = new Vector3();
const qa = new Quaternion(), qb = new Quaternion(), flip = new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), Math.PI);
const m = new Matrix4();

/** Pose error between a taught joint vector and an ideal TCP pose (base frame), allowing a 180° flip about tool Z. */
export function teachError(q: ArrayLike<number>, ideal: Matrix4) {
  fk(q).tcp.decompose(v, qa, s);
  ideal.decompose(v2, qb, s);
  const pos = v.distanceTo(v2);
  const ang = Math.min(qa.angleTo(qb), qa.angleTo(qb.clone().multiply(flip)));
  return { pos, ang };
}

export class Challenges {
  readonly events = new Emitter<ChallengeEvents>();
  readonly done = new Map<ChallengeId, number>();

  // Tracking state.
  private j1 = { pos: 0, neg: 0, last: 0 };
  private tool: { start: Vector3; maxDown: number; drift: number; idle: number } | null = null;
  private lastSpeed: number;
  private gripSeen = new Set<string>();
  private estopSeen = false;
  private run = { active: false, fromDispenser: false, intoReader: false, read: false, vertical: true, mode: 'test' as string, override: 1 };
  private trail: Array<{ p: Vector3 }> = [];

  constructor(private ctl: Controller) {
    this.load();
    this.lastSpeed = ctl.speedOverride;
    this.j1.last = ctl.robot.q[0];
    const ev = ctl.events, cell = ctl.cell.events;

    ev.on('speed', (e) => {
      if (Math.abs(this.lastSpeed - 0.1) < 1e-9 && Math.abs(e.override - 0.05) < 1e-9) this.complete(3);
      this.lastSpeed = e.override;
    });
    ctl.robot.events.on('gripper', (e) => {
      this.gripSeen.add(e.state);
      if (this.gripSeen.has('open') && this.gripSeen.has('closed')) this.complete(4);
    });
    ev.on('estop', (e) => {
      if (e.active) this.estopSeen = true;
      else if (this.estopSeen) this.complete(11);
    });
    persistenceEvents.on('exported', () => this.complete(12));

    // Points: re-check whenever they change.
    const checkPoints = () => this.checkPoints();
    ctl.points.events.on('changed', checkPoints);
    ctl.points.events.on('recorded', checkPoints);

    // Program runs.
    ev.on('runStarted', (e) => {
      // The unedited example program doesn't count: the learner must build (or modify) their own.
      this.run = { active: !ctl.program.fromExample, fromDispenser: false, intoReader: false, read: false, vertical: true, mode: e.mode, override: ctl.speedOverride };
    });
    cell.on('gripped', (e) => {
      if (!this.run.active) return;
      if (e.from === 'dispenser') this.run.fromDispenser = true;
      if (!this.verticalApproach()) this.run.vertical = false;
    });
    cell.on('released', (e) => {
      if (!this.run.active) return;
      if (e.where === 'reader' && e.seated && this.run.fromDispenser) this.run.intoReader = true;
      if (e.where && !this.verticalApproach()) this.run.vertical = false;
    });
    cell.on('readDone', () => { if (this.run.active) this.run.read = true; });
    ev.on('speed', (e) => { if (this.run.active) this.run.override = Math.min(this.run.override, e.override); });
    ev.on('runFinished', (e) => {
      const r = this.run;
      this.run = { ...r, active: false };
      if (!e.ok || !r.fromDispenser || !r.intoReader) return;
      this.complete(8);
      if (r.vertical) this.complete(9);
      if (r.mode === 'local' && e.mode === 'local' && r.override >= 1 && e.override >= 1 && r.read) this.complete(10);
    });
    this.checkPoints(); // points loaded from storage before we subscribed
  }

  isDone(id: ChallengeId) { return this.done.has(id); }
  get count() { return this.done.size; }

  reset() {
    this.done.clear();
    this.j1 = { pos: 0, neg: 0, last: this.ctl.robot.q[0] };
    this.tool = null;
    this.gripSeen.clear();
    this.estopSeen = false;
    this.save();
    this.events.emit('reset', {});
    this.checkPoints();
  }

  private complete(id: ChallengeId) {
    if (this.done.has(id)) return;
    this.done.set(id, Date.now());
    this.save();
    this.events.emit('completed', { id });
  }

  update(dt: number) {
    const c = this.ctl;
    const q0 = c.robot.q[0];
    const d = q0 - this.j1.last;
    this.j1.last = q0;

    // TCP trail (world) for the approach check: last ~3 s.
    const tcp = new Vector3().setFromMatrixPosition(m.multiplyMatrices(BASE_TO_WORLD, c.robot.fk.tcp));
    this.trail.push({ p: tcp });
    if (this.trail.length > 270) this.trail.shift();

    // 1: joint jog on J1, 30° each way.
    if (!this.done.has(1) && c.enable === 'enabled' && c.jogMode === 'joint' && c.jointAxis === 0 && !c.runner.active) {
      if (d > 0) this.j1.pos += d; else this.j1.neg -= d;
      if (this.j1.pos >= 30 * DEG && this.j1.neg >= 30 * DEG) this.complete(1);
    }

    // 2: Tool jog straight down ≥ 100 mm and back up.
    if (!this.done.has(2)) {
      const active = c.enable === 'enabled' && c.jogMode === 'tool' && !c.rotation && c.mode === 'manual';
      if (!active) this.tool = null;
      else {
        const moving = Math.abs(c.robot.qd.reduce((a, b) => a + Math.abs(b), 0)) > 1e-4;
        if (!this.tool) this.tool = { start: tcp.clone(), maxDown: 0, drift: 0, idle: 0 };
        const t = this.tool;
        t.idle = moving ? 0 : t.idle + dt;
        if (t.idle > 3 && t.maxDown < 0.01) { this.tool = { start: tcp.clone(), maxDown: 0, drift: 0, idle: 0 }; }
        else {
          t.maxDown = Math.max(t.maxDown, t.start.y - tcp.y);
          t.drift = Math.max(t.drift, Math.hypot(tcp.x - t.start.x, tcp.z - t.start.z));
          if (t.drift > 0.015) this.tool = { start: tcp.clone(), maxDown: 0, drift: 0, idle: 0 }; // not straight: start again from here
          else if (t.maxDown >= 0.1 && tcp.y >= t.start.y - 0.01) this.complete(2);
        }
      }
    }
  }

  /** The last 30 mm into the current TCP position was (near) vertical. */
  private verticalApproach(): boolean {
    const n = this.trail.length;
    if (!n) return true;
    const end = this.trail[n - 1].p;
    for (let i = n - 1; i >= 0; i--) {
      const p = this.trail[i].p;
      const up = p.y - end.y;
      if (up > 0.03) break;
      if (up < 0.002) continue;
      if (Math.hypot(p.x - end.x, p.z - end.z) > 0.003) return false;
    }
    return true;
  }

  private checkPoints() {
    const pts = this.ctl.points;
    const own = (n: string) => (pts.example.has(n) ? null : pts.get(n));
    const safe = own('pSafe');
    if (safe && !this.done.has(5)) {
      const p = v.setFromMatrixPosition(m.multiplyMatrices(BASE_TO_WORLD, fk(safe.q).tcp)).clone();
      const instruments = STATIC_BOXES.filter((b) => b.name === 'the dispenser' || b.name === 'the plate reader');
      const clear = instruments.every((b) => {
        const dx = Math.max(b.min.x - p.x, 0, p.x - b.max.x);
        const dy = Math.max(b.min.y - p.y, 0, p.y - b.max.y);
        const dz = Math.max(b.min.z - p.z, 0, p.z - b.max.z);
        return Math.hypot(dx, dy, dz) >= 0.1;
      });
      if (clear && p.y >= BENCH.topY + 0.15) this.complete(5);
    }
    const tol = (e: { pos: number; ang: number }) => e.pos <= SEAT_TOLERANCE.position && e.ang <= SEAT_TOLERANCE.angleDeg * DEG;
    const disp = own('pDispenser');
    if (disp && tol(teachError(disp.q, gripPoseBase(dispenserSeat())))) this.complete(6);
    const rd = own('pReader');
    if (rd && tol(teachError(rd.q, gripPoseBase(readerSeat(TRAY_OUT))))) this.complete(7);
  }

  private load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return;
      const data = JSON.parse(raw) as Array<[ChallengeId, number]>;
      for (const [id, t] of data) if (CHALLENGES.some((c) => c.id === id)) this.done.set(id, t);
    } catch { /* unavailable */ }
  }
  private save() {
    try { localStorage.setItem(KEY, JSON.stringify([...this.done])); } catch { /* unavailable */ }
  }
}
