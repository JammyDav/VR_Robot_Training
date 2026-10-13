import { Euler, Matrix4, Quaternion, Vector3 } from 'three';
import { JOINT_COUNT, MANUAL_TCP_CAP_MMPS } from '../config/robotSpec';
import { POINT_MOVE_MDESC } from '../config/motionSpec';
import { Robot } from './robot/Robot';
import { JogEngine, type JogCommand, type JogInfo } from './motion/jog';
import { MoveJ, type Move } from './motion/moves';
import { Cell } from './cell/Cell';
import { PointStore } from './program/points';
import { Program } from './program/program';
import { Runner, type RunState } from './program/runner';
import { checkCollision } from './safety/collision';
import { BASE_TO_WORLD } from './frames';
import { Emitter } from './events';

export type WorkingMode = 'manual' | 'test' | 'local';
export type JogMode = 'joint' | 'frame' | 'tool' | 'point';
export type EnableState = 'released' | 'enabled' | 'panic';
export type BeaconState = 'run' | 'manual' | 'fault';

export const WORKING_MODES: readonly WorkingMode[] = ['manual', 'test', 'local'];
export const JOG_MODES: readonly JogMode[] = ['joint', 'frame', 'tool', 'point'];
export const SPEED_STEPS = [0.01, 0.05, 0.1, 0.25, 0.5, 0.75, 1] as const;

/** Three-position enabling device thresholds on the analogue grip. */
export const ENABLE_ON = 0.12;
export const ENABLE_PANIC = 0.9;

/** How quickly program motion slows to a hold / resumes (time-scale per second). */
const HOLD_RAMP = 4;

export interface ControllerEvents extends Record<string, unknown> {
  enable: { state: EnableState };
  estop: { active: boolean };
  fault: { message: string | null };
  mode: { mode: WorkingMode };
  jogMode: { mode: JogMode };
  rotation: { on: boolean };
  speed: { override: number };
  denied: { reason: string };
  validated: { ok: boolean };
  runFinished: { ok: boolean; mode: WorkingMode; override: number; validatedRun: boolean };
  runStarted: { mode: WorkingMode };
  pointReached: { name: string };
}

/**
 * The cell controller: working mode, jog mode, enabling device, E-stop,
 * speed override, program execution, faults and collision. All motion
 * passes through here, so the deadman and E-stop gate every input path alike.
 */
export class Controller {
  readonly robot = new Robot();
  readonly jog = new JogEngine();
  readonly cell = new Cell();
  readonly points = new PointStore();
  readonly program = new Program();
  readonly runner: Runner;
  readonly events = new Emitter<ControllerEvents>();

  mode: WorkingMode = 'manual';
  jogMode: JogMode = 'joint';
  rotation = false;
  jointAxis = 0;
  speedOverride = 0.1;
  enable: EnableState = 'released';
  enableLevel = 0;
  estop = false;
  fault: string | null = null;
  /** After a collision fault is reset, contact is tolerated until the arm is jogged clear. */
  recovering = false;

  command: JogCommand = { kind: 'none' };
  jogInfo: JogInfo = this.jog.info;

  /** Active trajectory (program step or move-to-point) and who owns it. */
  private move: Move | null = null;
  private moveOwner: 'program' | 'point' | null = null;
  private moveScale = 0;
  private tcpPerUnit = 0; // TCP metres per unit of scaled time, last step
  private pointHeld = false;
  private validatedHash: string | null = null;
  private panicLatched = false;
  private qdCmd = new Float64Array(JOINT_COUNT);
  private qPrev = new Float64Array(JOINT_COUNT);
  private qTmp = new Float64Array(JOINT_COUNT);
  private tcpW = new Matrix4();

  constructor() {
    this.runner = new Runner({
      q: () => this.robot.q,
      point: (n) => this.points.get(n),
      startMove: (m) => { this.move = m; this.moveOwner = 'program'; },
      moveActive: () => this.move !== null,
      gripperOpen: () => this.gripperOpen(),
      gripperClose: () => this.gripperClose(),
      gripperMoving: () => this.robot.gripper.moving,
      dispense: () => this.cell.dispense(),
      dispenserReady: () => !this.cell.dispenserBusy && !!this.cell.plateAt('dispenser'),
      trayOut: () => this.cell.trayOut(),
      trayIn: () => this.cell.trayIn(this.tcpWorld()),
      trayState: () => this.cell.trayState,
      readerState: () => this.cell.reader.state,
      fault: (m) => this.setFault(m),
      faulted: () => !!this.fault || this.estop,
      mayProceed: () => this.programMayMove(),
    });
    this.cell.events.on('fault', (e) => this.setFault(e.message));
    this.runner.events.on('finished', (e) => this.onRunFinished(e.ok));
    this.program.events.on('changed', () => this.events.emit('validated', { ok: this.validated }));
    this.points.events.on('changed', () => this.events.emit('validated', { ok: this.validated }));
  }

  // --- Enabling device --------------------------------------------------------
  setEnableLevel(level: number) {
    this.enableLevel = level;
    let next: EnableState;
    if (level < ENABLE_ON) { next = 'released'; this.panicLatched = false; }
    else if (level > ENABLE_PANIC || this.panicLatched) { next = 'panic'; this.panicLatched = true; }
    else next = 'enabled';
    if (next !== this.enable) {
      this.enable = next;
      this.events.emit('enable', { state: next });
    }
  }

  get canJog() {
    return !this.estop && !this.fault && this.mode === 'manual' && this.enable === 'enabled' && !this.runner.active;
  }

  // --- Modes --------------------------------------------------------------------
  setMode(mode: WorkingMode) {
    if (mode === this.mode) return;
    this.stopMotion();
    this.runner.abort();
    this.mode = mode;
    this.events.emit('mode', { mode });
  }
  cycleMode() { this.setMode(WORKING_MODES[(WORKING_MODES.indexOf(this.mode) + 1) % WORKING_MODES.length]); }

  setJogMode(mode: JogMode) {
    if (mode === this.jogMode) return;
    this.jogMode = mode;
    if (mode === 'point' && this.points.selected < 0 && this.points.points.length) this.points.selected = 0;
    this.events.emit('jogMode', { mode });
  }
  cycleJogMode() { this.setJogMode(JOG_MODES[(JOG_MODES.indexOf(this.jogMode) + 1) % JOG_MODES.length]); }

  toggleRotation() {
    if (this.jogMode !== 'frame' && this.jogMode !== 'tool') return;
    this.rotation = !this.rotation;
    this.events.emit('rotation', { on: this.rotation });
  }

  selectAxis(step: 1 | -1) { this.jointAxis = (this.jointAxis + step + JOINT_COUNT) % JOINT_COUNT; }

  stepSpeed(dir: 1 | -1) {
    const i = SPEED_STEPS.findIndex((s) => Math.abs(s - this.speedOverride) < 1e-9);
    const next = Math.min(SPEED_STEPS.length - 1, Math.max(0, (i < 0 ? 2 : i) + dir));
    if (SPEED_STEPS[next] !== this.speedOverride) {
      this.speedOverride = SPEED_STEPS[next];
      this.events.emit('speed', { override: this.speedOverride });
    }
  }

  // --- E-stop, faults, reset ------------------------------------------------------
  triggerEstop() {
    if (this.estop) return;
    this.estop = true;
    this.stopMotion();
    this.runner.abort();
    this.robot.gripper.halt();
    this.events.emit('estop', { active: true });
  }

  setFault(message: string) {
    if (this.fault) return; // first fault wins; keep the cause visible
    this.fault = message;
    this.stopMotion();
    this.robot.gripper.halt();
    this.runner.onFault();
    this.events.emit('fault', { message });
  }

  /** RESET key: clears the E-stop and any fault. Refused while the enabling device is held. */
  reset(): boolean {
    if (!this.estop && !this.fault) return true;
    if (this.enable !== 'released') {
      this.events.emit('denied', { reason: 'Release the enabling device before resetting.' });
      return false;
    }
    const wasCollision = this.fault?.startsWith('Collision') ?? false;
    if (this.estop) { this.estop = false; this.events.emit('estop', { active: false }); }
    if (this.fault) { this.fault = null; this.events.emit('fault', { message: null }); }
    this.recovering = wasCollision;
    return true;
  }
  /** Back-compat name used by input layers. */
  resetEstop() { return this.reset(); }

  stopMotion() {
    this.command = { kind: 'none' };
    this.jog.reset();
    this.move = null;
    this.moveOwner = null;
    this.moveScale = 0;
    this.robot.halt();
  }

  // --- Gripper ------------------------------------------------------------------
  gripperClose() {
    const g = this.robot.gripper;
    if (!g.isOpen) return;
    const r = this.cell.onGripperClose(this.tcpWorld());
    g.stopAt = r.stopAt;
    g.close();
    if (r.fault) this.setFault(r.fault);
  }
  gripperOpen() {
    const g = this.robot.gripper;
    if (g.isOpen) return;
    g.stopAt = null;
    g.open();
    this.cell.onGripperOpen();
  }
  /** Manual user toggle (pendant key, ray on the gripper). */
  toggleGripper() {
    if (this.estop) { this.events.emit('denied', { reason: 'Emergency stop active.' }); return; }
    if (this.fault) { this.events.emit('denied', { reason: 'Clear the fault first (RESET).' }); return; }
    if (this.mode !== 'manual') { this.events.emit('denied', { reason: 'Gripper control is available in Manual mode.' }); return; }
    if (this.robot.gripper.isOpen) this.gripperClose(); else this.gripperOpen();
  }

  // --- Points and Point jog -------------------------------------------------------
  recordPoint() {
    if (this.mode !== 'manual') { this.events.emit('denied', { reason: 'Teach points in Manual mode.' }); return null; }
    return this.points.record(this.robot.q);
  }

  /** Point mode: hold A (with the enabling device) to move to the selected point. */
  moveToPoint(active: boolean) {
    this.pointHeld = active;
    if (!active) {
      if (this.moveOwner === 'point') { this.move = null; this.moveOwner = null; this.robot.halt(); }
      return;
    }
    if (this.moveOwner === 'point' || !this.canJog) return;
    const pt = this.points.current;
    if (!pt) return;
    this.move = new MoveJ(this.robot.q, pt.q, POINT_MOVE_MDESC);
    this.moveOwner = 'point';
    this.moveScale = 0;
  }

  // --- Program ----------------------------------------------------------------------
  private programHash() {
    const used = this.program.pointsUsed().map((n) => [n, this.points.get(n)?.q.map((v) => v.toFixed(5))]);
    return JSON.stringify([this.program.toJSON(), used]);
  }
  get validated() { return this.validatedHash !== null && this.validatedHash === this.programHash(); }

  private programMayMove() {
    if (this.estop || this.fault) return false;
    if (this.mode === 'test') return this.enable === 'enabled';
    if (this.mode === 'local') return this.enable === 'enabled' || (this.validated && this.enable !== 'panic');
    return false;
  }

  runProgram(): boolean {
    if (this.runner.state === 'paused') { this.runner.resume(); return true; }
    if (this.runner.active) return true;
    const why = this.cannotRun();
    if (why) { this.events.emit('denied', { reason: why }); return false; }
    this.runStartMode = this.mode;
    this.runner.start(this.program.steps);
    this.events.emit('runStarted', { mode: this.mode });
    return true;
  }
  stepProgram() {
    const why = this.runner.active ? null : this.cannotRun();
    if (why) { this.events.emit('denied', { reason: why }); return; }
    if (!this.runner.active) this.runStartMode = this.mode;
    this.runner.step(this.program.steps);
  }
  pauseProgram() { this.runner.pause(); }
  abortProgram() {
    this.runner.abort();
    if (this.moveOwner === 'program') { this.move = null; this.moveOwner = null; this.robot.halt(); }
  }
  private runStartMode: WorkingMode = 'test';

  private cannotRun(): string | null {
    if (this.estop) return 'Emergency stop active.';
    if (this.fault) return 'Clear the fault first (RESET).';
    if (this.mode === 'manual') return 'Switch to Manual test (with the enabling device) or Local to run.';
    if (!this.program.steps.length) return 'The program is empty.';
    return null;
  }

  private onRunFinished(ok: boolean) {
    if (this.moveOwner === 'program') { this.move = null; this.moveOwner = null; }
    if (ok && this.runStartMode === 'test' && this.mode === 'test') {
      this.validatedHash = this.programHash();
      this.events.emit('validated', { ok: true });
    }
    this.events.emit('runFinished', { ok, mode: this.mode, override: this.speedOverride, validatedRun: this.validated });
  }

  get runState(): RunState { return this.runner.state; }

  get beacon(): BeaconState {
    if (this.estop || this.fault) return 'fault';
    return this.mode === 'local' ? 'run' : 'manual';
  }

  // --- Step -----------------------------------------------------------------------
  update(dt: number) {
    this.qPrev.set(this.robot.q);
    if (this.estop) {
      this.robot.halt();
    } else if (this.move) {
      this.stepMove(dt);
    } else {
      const cmd: JogCommand = this.canJog ? this.command : { kind: 'none' };
      if (this.enable === 'panic') this.jog.reset();
      this.jogInfo = this.jog.compute(dt, this.robot, cmd, this.speedOverride, this.qdCmd);
      this.robot.integrate(dt, this.qdCmd);
    }

    // Gripper and the cell.
    const g = this.robot.gripper;
    this.robot.stepGripper(dt);
    if (g.justFinished === 'closed') this.cell.onGripperClosed();
    this.cell.update(dt, this.tcpWorld());
    this.runner.update(dt);

    this.checkCollisions();
  }

  private stepMove(dt: number) {
    const allowed = this.moveOwner === 'point'
      ? this.canJog && this.pointHeld
      : this.programMayMove() && this.runner.state === 'running';
    // Smooth hold / resume instead of an instantaneous stop.
    this.moveScale = Math.max(0, Math.min(1, this.moveScale + (allowed ? 1 : -1) * HOLD_RAMP * dt));
    let dts = dt * this.speedOverride * this.moveScale;
    // Manual and Manual test: hold the TCP at or under 250 mm/s.
    if (this.mode !== 'local' || this.moveOwner === 'point') {
      const cap = MANUAL_TCP_CAP_MMPS / 1000;
      if (this.tcpPerUnit * dts > cap * dt) dts = (cap * dt) / this.tcpPerUnit;
    }
    if (dts <= 0) { this.robot.halt(); return; }
    const before = tmpV.setFromMatrixPosition(this.robot.fk.tcp).clone();
    this.qTmp.set(this.robot.q);
    const st = this.move!.step(dts, this.qTmp);
    this.robot.setJoints(this.qTmp);
    const moved = before.distanceTo(tmpV.setFromMatrixPosition(this.robot.fk.tcp));
    this.tcpPerUnit = moved / dts;
    for (let i = 0; i < JOINT_COUNT; i++) this.robot.qd[i] = (this.robot.q[i] - this.qPrev[i]) / dt;
    if (st.fault) { this.setFault(st.fault); return; }
    if (st.done) {
      if (this.moveOwner === 'point') this.events.emit('pointReached', { name: this.points.current?.name ?? '' });
      this.move = null; this.moveOwner = null; this.robot.halt();
    }
  }

  private checkCollisions() {
    const hit = checkCollision({
      fk: this.robot.fk,
      gripperHalfGap: this.robot.gripper.halfGap,
      trayX: this.cell.tray.x,
      heldPlate: this.cell.held()?.pose ?? null,
    });
    if (!hit) { this.recovering = false; return; }
    if (this.recovering || this.fault || this.estop) return;
    this.setFault(`Collision: the ${hit.link} hit ${hit.obstacle}. Reset, then jog clear.`);
  }

  tcpWorld() { return this.tcpW.multiplyMatrices(BASE_TO_WORLD, this.robot.fk.tcp); }

  /** TCP pose in the robot base frame: position in mm, VAL3-style Rx, Ry, Rz in degrees. */
  tcpPose() {
    this.robot.fk.tcp.decompose(p, qt, s);
    e.setFromQuaternion(qt, 'XYZ');
    return { x: p.x * 1000, y: p.y * 1000, z: p.z * 1000, rx: deg(e.x), ry: deg(e.y), rz: deg(e.z) };
  }
}

const tmpV = new Vector3();
const p = new Vector3();
const qt = new Quaternion();
const s = new Vector3();
const e = new Euler();
const deg = (r: number) => (r * 180) / Math.PI;
