import { Matrix4 } from 'three';
import type { Step } from './program';
import type { TaughtPoint } from './points';
import { poseMatrix } from './points';
import { MoveJ, MoveL, type Move } from '../motion/moves';
import { solvePose } from '../kinematics/ikDls';
import { Emitter } from '../events';

export type RunState = 'idle' | 'running' | 'paused' | 'done' | 'aborted' | 'faulted';

/** What the runner needs from the controller. Keeps it testable and free of scene code. */
export interface RunnerHost {
  q(): Float64Array;
  point(name: string): TaughtPoint | null;
  startMove(m: Move): void;
  moveActive(): boolean;
  gripperOpen(): void;
  gripperClose(): void;
  gripperMoving(): boolean;
  dispense(): boolean;
  dispenserReady(): boolean;
  trayOut(): void;
  trayIn(): boolean;
  trayState(): 'in' | 'out' | 'moving';
  readerState(): 'idle' | 'reading' | 'done';
  fault(message: string): void;
  faulted(): boolean;
  /** Whether new steps may start (deadman / mode gating). */
  mayProceed(): boolean;
}

export interface RunnerEvents extends Record<string, unknown> {
  state: { state: RunState };
  step: { index: number };
  finished: { ok: boolean };
}

const tmp = new Matrix4();

export class Runner {
  readonly events = new Emitter<RunnerEvents>();
  state: RunState = 'idle';
  index = 0;
  private steps: Step[] = [];
  private phase: 'start' | 'wait' = 'start';
  private timer = 0;
  private singleStep = false;
  /** True while this run has hit no fault (used for validation). */
  clean = true;

  constructor(private host: RunnerHost) {}

  get active() { return this.state === 'running' || this.state === 'paused'; }

  start(steps: Step[]) {
    this.steps = steps.map((s) => ({ ...s }));
    this.index = 0;
    this.phase = 'start';
    this.clean = true;
    this.singleStep = false;
    this.set('running');
    this.events.emit('step', { index: 0 });
  }

  resume() { if (this.state === 'paused') { this.singleStep = false; this.set('running'); } }
  pause() { if (this.state === 'running') this.set('paused'); }

  /** Execute exactly one step, then pause. Starts a run if idle. */
  step(steps: Step[]) {
    if (!this.active) this.start(steps);
    this.singleStep = true;
    this.set('running');
  }

  abort() {
    if (!this.active) return;
    this.set('aborted');
    this.events.emit('finished', { ok: false });
  }

  onFault() {
    if (!this.active) return;
    this.clean = false;
    this.set('faulted');
    this.events.emit('finished', { ok: false });
  }

  get current(): Step | null { return this.steps[this.index] ?? null; }

  update(dt: number) {
    if (this.state !== 'running') return;
    const h = this.host;
    if (h.faulted()) { this.onFault(); return; }
    const st = this.steps[this.index];
    if (!st) { this.set('done'); this.events.emit('finished', { ok: this.clean }); return; }

    if (this.phase === 'start') {
      if (!h.mayProceed()) return; // wait for the enabling device / mode
      const err = this.begin(st);
      if (err) { h.fault(err); this.onFault(); return; }
      this.phase = 'wait';
      this.timer = 0;
    }
    this.timer += dt;
    if (this.finishedWaiting(st)) {
      this.index++;
      this.phase = 'start';
      this.events.emit('step', { index: this.index });
      if (this.index >= this.steps.length) { this.set('done'); this.events.emit('finished', { ok: this.clean }); return; }
      if (this.singleStep) { this.singleStep = false; this.set('paused'); }
    }
  }

  private begin(st: Step): string | null {
    const h = this.host;
    const needPoint = (name: string) => h.point(name);
    switch (st.kind) {
      case 'movej': {
        const p = needPoint(st.point);
        if (!p) return `MoveJ: point "${st.point || '—'}" is not taught.`;
        h.startMove(new MoveJ(h.q(), p.q, st.speed));
        return null;
      }
      case 'movel': {
        const p = needPoint(st.point);
        if (!p) return `MoveL: point "${st.point || '—'}" is not taught.`;
        h.startMove(new MoveL(h.q(), poseMatrix(p, tmp).clone(), st.speed));
        return null;
      }
      case 'appro': {
        const p = needPoint(st.point);
        if (!p) return `Approach: point "${st.point || '—'}" is not taught.`;
        // appro(p, {0,0,−offset}): back off along the tool's approach axis.
        const goal = poseMatrix(p, new Matrix4()).multiply(tmp.makeTranslation(0, 0, -st.offset / 1000));
        if (st.motion === 'L') { h.startMove(new MoveL(h.q(), goal, st.speed)); return null; }
        const sol = solvePose(p.q, goal, { maxIter: 100 });
        if (!sol.ok) return `Approach ${st.point}: the approach point (${st.offset} mm back) is out of reach.`;
        h.startMove(new MoveJ(h.q(), sol.q, st.speed));
        return null;
      }
      case 'open': h.gripperOpen(); return null;
      case 'close': h.gripperClose(); return null;
      case 'wait': return null;
      case 'dispense': h.dispense(); return null;
      case 'trayOut': h.trayOut(); return null;
      case 'trayIn': return h.trayIn() ? null : 'Tray retract refused.';
      case 'waitRead':
        if (h.readerState() === 'idle') return 'Wait for read: no plate is being read. Retract the tray with a plate on it first.';
        return null;
    }
  }

  private finishedWaiting(st: Step): boolean {
    const h = this.host;
    switch (st.kind) {
      case 'movej': case 'movel': case 'appro': return !h.moveActive();
      case 'open': case 'close': return !h.gripperMoving();
      case 'wait': return this.timer >= st.seconds;
      case 'dispense': return h.dispenserReady();
      case 'trayOut': return h.trayState() === 'out';
      case 'trayIn': return h.trayState() === 'in';
      case 'waitRead': return h.readerState() === 'done';
    }
  }

  private set(s: RunState) {
    if (this.state === s) return;
    this.state = s;
    this.events.emit('state', { state: s });
  }
}
