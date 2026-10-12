import { Matrix3, Vector3 } from 'three';
import { JOINT_COUNT, MAX_SPEED_RAD, JOG_JOINT_FRACTION, MANUAL_TCP_CAP_MMPS } from '../../config/robotSpec';
import { dlsTwist, manipulability, W0, type DlsInfo } from '../kinematics/ikDls';
import { jacobian } from '../kinematics/jacobian';
import { createFK } from '../kinematics/chain';
import type { Robot } from '../robot/Robot';

export type JogCommand =
  | { kind: 'none' }
  | { kind: 'joint'; axis: number; rate: number } // rate −1…1
  | { kind: 'cartesian'; frame: 'base' | 'tool'; lin: [number, number, number]; ang: [number, number, number] }; // each −1…1

/** Cartesian jog rates at 100 % override (manual reduced speed). */
export const JOG_LIN_MAX = MANUAL_TCP_CAP_MMPS / 1000; // m/s
export const JOG_ANG_MAX = (45 * Math.PI) / 180; // rad/s
/** Joint-rate ceiling in manual, as a fraction of each joint's max speed. */
const MANUAL_JOINT_CEIL = 0.25;

const LIN_ACCEL = 1.2; // m/s²
const ANG_ACCEL = 4; // rad/s²
const JOINT_ACCEL_FACTOR = 6; // × jog speed per second
const STOP_GAIN = 3; // braking is this much quicker than ramp-up

export interface JogInfo {
  manipulability: number;
  nearSingular: boolean;
  blocked: number[];
  tcpSpeed: number; // m/s, after capping
  capped: boolean;
}

const fkr = createFK();
const J = new Float64Array(36);
const dq = new Float64Array(JOINT_COUNT);
const rot = new Matrix3();
const tmp = new Vector3();

/**
 * Turns a jog command into joint rates each step. Owns the ramped (smoothed)
 * command so stops are controlled rather than instantaneous.
 */
export class JogEngine {
  private jointRate = new Float64Array(JOINT_COUNT);
  private twist = new Float64Array(6); // ramped, base frame, m/s & rad/s
  info: JogInfo = { manipulability: 1, nearSingular: false, blocked: [], tcpSpeed: 0, capped: false };

  /** Drop all ramped state (used for E-stop and mode changes). */
  reset() {
    this.jointRate.fill(0);
    this.twist.fill(0);
  }

  get active() {
    for (let i = 0; i < JOINT_COUNT; i++) if (this.jointRate[i] !== 0) return true;
    for (let i = 0; i < 6; i++) if (this.twist[i] !== 0) return true;
    return false;
  }

  compute(dt: number, robot: Robot, cmd: JogCommand, override: number, out: Float64Array) {
    out.fill(0);
    this.info.blocked = [];
    this.info.capped = false;

    // --- Joint jog: ramp each joint toward its target rate ---------------------
    for (let i = 0; i < JOINT_COUNT; i++) {
      const vmax = MAX_SPEED_RAD[i] * JOG_JOINT_FRACTION * override;
      const target = cmd.kind === 'joint' && cmd.axis === i ? clamp1(cmd.rate) * vmax : 0;
      const a = MAX_SPEED_RAD[i] * JOG_JOINT_FRACTION * JOINT_ACCEL_FACTOR * (target === 0 ? STOP_GAIN : 1);
      this.jointRate[i] = approach(this.jointRate[i], target, a * dt);
      out[i] = this.jointRate[i];
    }

    // --- Cartesian jog: ramp the twist, then solve DLS ---------------------------
    const target = new Float64Array(6);
    if (cmd.kind === 'cartesian') {
      for (let k = 0; k < 3; k++) {
        target[k] = clamp1(cmd.lin[k]) * JOG_LIN_MAX * override;
        target[k + 3] = clamp1(cmd.ang[k]) * JOG_ANG_MAX * override;
      }
      if (cmd.frame === 'tool') {
        rot.setFromMatrix4(robot.fk.tcp);
        tmp.set(target[0], target[1], target[2]).applyMatrix3(rot);
        target[0] = tmp.x; target[1] = tmp.y; target[2] = tmp.z;
        tmp.set(target[3], target[4], target[5]).applyMatrix3(rot);
        target[3] = tmp.x; target[4] = tmp.y; target[5] = tmp.z;
      }
    }
    let cart = false;
    for (let k = 0; k < 6; k++) {
      const a = (k < 3 ? LIN_ACCEL : ANG_ACCEL) * (target[k] === 0 ? STOP_GAIN : 1);
      this.twist[k] = approach(this.twist[k], target[k], a * dt);
      if (this.twist[k] !== 0) cart = true;
    }

    let info: DlsInfo | null = null;
    if (cart) {
      info = dlsTwist(robot.q, this.twist, dq);
      // Near a singularity, slow down in proportion to how close we are.
      const s = info.nearSingular ? Math.max(0.15, info.manipulability / W0) : 1;
      for (let i = 0; i < JOINT_COUNT; i++) out[i] += dq[i] * s;
      this.info.blocked = info.blocked;
    }

    // --- Manual caps: per-joint ceiling, then the TCP linear speed cap -------------
    let scale = 1;
    for (let i = 0; i < JOINT_COUNT; i++) {
      const ceil = MAX_SPEED_RAD[i] * MANUAL_JOINT_CEIL;
      if (Math.abs(out[i]) > ceil) scale = Math.min(scale, ceil / Math.abs(out[i]));
    }
    jacobian(robot.q, J, fkr);
    let vx = 0, vy = 0, vz = 0;
    for (let i = 0; i < JOINT_COUNT; i++) {
      vx += J[i] * out[i]; vy += J[6 + i] * out[i]; vz += J[12 + i] * out[i];
    }
    const v = Math.hypot(vx, vy, vz) * scale;
    const cap = MANUAL_TCP_CAP_MMPS / 1000;
    if (v > cap) { scale *= cap / v; this.info.capped = true; }
    if (scale < 1) for (let i = 0; i < JOINT_COUNT; i++) out[i] *= scale;
    this.info.tcpSpeed = Math.min(v, cap);

    if (info) {
      this.info.manipulability = info.manipulability;
      this.info.nearSingular = info.nearSingular;
    } else {
      // Keep the singularity readout live even when jogging in joint space.
      this.info.manipulability = manipulability(J);
      this.info.nearSingular = this.info.manipulability < W0;
    }
    return this.info;
  }
}

function clamp1(v: number) { return Math.max(-1, Math.min(1, v)); }
function approach(v: number, target: number, maxDelta: number) {
  if (v < target) return Math.min(target, v + maxDelta);
  if (v > target) return Math.max(target, v - maxDelta);
  return v;
}
