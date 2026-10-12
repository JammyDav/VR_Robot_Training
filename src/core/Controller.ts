import { Euler, Quaternion, Vector3 } from 'three';
import { JOINT_COUNT } from '../config/robotSpec';
import { Robot } from './robot/Robot';
import { JogEngine, type JogCommand, type JogInfo } from './motion/jog';
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

export interface ControllerEvents extends Record<string, unknown> {
  enable: { state: EnableState };
  estop: { active: boolean };
  mode: { mode: WorkingMode };
  jogMode: { mode: JogMode };
  rotation: { on: boolean };
  speed: { override: number };
  denied: { reason: string };
}

/**
 * The cell controller: working mode, jog mode, enabling device, E-stop and
 * speed override. All motion requests pass through here, so the deadman and
 * E-stop gate every input layer identically (XR, desktop, pendant panel).
 */
export class Controller {
  readonly robot = new Robot();
  readonly jog = new JogEngine();
  readonly events = new Emitter<ControllerEvents>();

  mode: WorkingMode = 'manual';
  jogMode: JogMode = 'joint';
  /** Frame/Tool sticks drive rotations instead of translations. */
  rotation = false;
  /** Selected axis for joint jog. */
  jointAxis = 0;
  speedOverride = 0.1;
  enable: EnableState = 'released';
  enableLevel = 0;
  estop = false;
  fault: string | null = null;

  /** The jog command requested this frame by the input layer. */
  command: JogCommand = { kind: 'none' };
  jogInfo: JogInfo = this.jog.info;

  private panicLatched = false;
  private qdCmd = new Float64Array(JOINT_COUNT);

  // --- Enabling device --------------------------------------------------------
  /** Analogue enabling-device position, 0 (released) … 1 (fully squeezed). */
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
    return !this.estop && !this.fault && this.mode === 'manual' && this.enable === 'enabled';
  }

  // --- Modes --------------------------------------------------------------------
  setMode(mode: WorkingMode) {
    if (mode === this.mode) return;
    this.stopMotion();
    this.mode = mode;
    this.events.emit('mode', { mode });
  }
  cycleMode() {
    this.setMode(WORKING_MODES[(WORKING_MODES.indexOf(this.mode) + 1) % WORKING_MODES.length]);
  }

  setJogMode(mode: JogMode) {
    if (mode === this.jogMode) return;
    this.jogMode = mode;
    this.events.emit('jogMode', { mode });
  }
  cycleJogMode() {
    this.setJogMode(JOG_MODES[(JOG_MODES.indexOf(this.jogMode) + 1) % JOG_MODES.length]);
  }

  toggleRotation() {
    if (this.jogMode !== 'frame' && this.jogMode !== 'tool') return;
    this.rotation = !this.rotation;
    this.events.emit('rotation', { on: this.rotation });
  }

  selectAxis(step: 1 | -1) {
    this.jointAxis = (this.jointAxis + step + JOINT_COUNT) % JOINT_COUNT;
  }

  stepSpeed(dir: 1 | -1) {
    const i = SPEED_STEPS.findIndex((s) => Math.abs(s - this.speedOverride) < 1e-9);
    const next = Math.min(SPEED_STEPS.length - 1, Math.max(0, (i < 0 ? 2 : i) + dir));
    if (SPEED_STEPS[next] !== this.speedOverride) {
      this.speedOverride = SPEED_STEPS[next];
      this.events.emit('speed', { override: this.speedOverride });
    }
  }

  // --- E-stop -------------------------------------------------------------------
  triggerEstop() {
    if (this.estop) return;
    this.estop = true;
    this.command = { kind: 'none' };
    this.jog.reset();
    this.robot.halt();
    this.events.emit('estop', { active: true });
  }

  /** Explicit reset. Refused while the enabling device is held. */
  resetEstop(): boolean {
    if (!this.estop) return true;
    if (this.enable !== 'released') {
      this.events.emit('denied', { reason: 'Release the enabling device before resetting the emergency stop.' });
      return false;
    }
    this.estop = false;
    this.events.emit('estop', { active: false });
    return true;
  }

  toggleGripper() {
    if (this.estop) { this.events.emit('denied', { reason: 'Emergency stop active.' }); return; }
    if (this.mode !== 'manual') { this.events.emit('denied', { reason: 'Gripper control is available in Manual mode.' }); return; }
    this.robot.gripper.toggle();
  }

  stopMotion() {
    this.command = { kind: 'none' };
    this.jog.reset();
    this.robot.halt();
  }

  get beacon(): BeaconState {
    if (this.estop || this.fault) return 'fault';
    return this.mode === 'local' ? 'run' : 'manual';
  }

  // --- Step -----------------------------------------------------------------------
  update(dt: number) {
    if (this.estop) {
      this.robot.halt();
    } else {
      // The deadman gates everything: without it the jog ramps down to a stop.
      const cmd: JogCommand = this.canJog ? this.command : { kind: 'none' };
      // Panic squeeze: immediate stop. Plain release: the jog brakes on its short stop ramp.
      if (this.enable === 'panic') this.jog.reset();
      this.jogInfo = this.jog.compute(dt, this.robot, cmd, this.speedOverride, this.qdCmd);
      this.robot.integrate(dt, this.qdCmd);
    }
    this.robot.stepGripper(dt);
  }

  /** TCP pose in the robot base frame: position in mm, VAL3-style Rx, Ry, Rz in degrees. */
  tcpPose() {
    this.robot.fk.tcp.decompose(p, qt, s);
    e.setFromQuaternion(qt, 'XYZ');
    return { x: p.x * 1000, y: p.y * 1000, z: p.z * 1000, rx: deg(e.x), ry: deg(e.y), rz: deg(e.z) };
  }
}

const p = new Vector3();
const qt = new Quaternion();
const s = new Vector3();
const e = new Euler();
const deg = (r: number) => (r * 180) / Math.PI;
