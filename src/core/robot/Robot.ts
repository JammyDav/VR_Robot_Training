import { Vector3, Quaternion, Matrix4 } from 'three';
import { JOINT_COUNT, LIMITS_RAD, MAX_SPEED_RAD, HOME_DEG, rad } from '../../config/robotSpec';
import { fk, createFK, type FKResult } from '../kinematics/chain';
import { BASE_TO_WORLD } from '../frames';
import { Gripper } from './Gripper';
import { Emitter } from '../events';

export interface RobotEvents extends Record<string, unknown> {
  jointLimit: { axis: number; side: -1 | 1 };
  gripper: { state: 'open' | 'closed' };
}

/** Deceleration available for braking onto a joint limit, as a multiple of max joint speed per second. */
const LIMIT_DECEL = 4;

/**
 * Single source of truth for the arm's physical state: joint positions and
 * velocities, the gripper, and cached forward kinematics. It integrates
 * commanded joint rates; deciding those rates is the controller's job.
 */
export class Robot {
  readonly q = new Float64Array(JOINT_COUNT);
  readonly qd = new Float64Array(JOINT_COUNT);
  readonly gripper = new Gripper();
  readonly events = new Emitter<RobotEvents>();

  private fkCache: FKResult = createFK();
  private fkDirty = true;
  private atLimit = new Int8Array(JOINT_COUNT);

  constructor() {
    HOME_DEG.forEach((d, i) => (this.q[i] = rad(d)));
  }

  /** Forward kinematics in the robot base frame (cached until joints change). */
  get fk(): FKResult {
    if (this.fkDirty) { fk(this.q, this.fkCache); this.fkDirty = false; }
    return this.fkCache;
  }

  setJoints(q: ArrayLike<number>) {
    for (let i = 0; i < JOINT_COUNT; i++) this.q[i] = clampJoint(i, q[i]);
    this.fkDirty = true;
  }

  /** TCP pose in world space. */
  tcpWorld(pos = new Vector3(), quat = new Quaternion()) {
    tmpM.multiplyMatrices(BASE_TO_WORLD, this.fk.tcp);
    tmpM.decompose(pos, quat, tmpS);
    return { pos, quat };
  }

  /**
   * Advance by dt with commanded joint rates. Each joint brakes ahead of its
   * limit so it stops on it rather than through it.
   */
  integrate(dt: number, qdCmd: ArrayLike<number>) {
    for (let i = 0; i < JOINT_COUNT; i++) {
      let v = qdCmd[i];
      const [lo, hi] = LIMITS_RAD[i];
      const a = MAX_SPEED_RAD[i] * LIMIT_DECEL;
      const room = v > 0 ? hi - this.q[i] : this.q[i] - lo;
      const vStop = Math.sqrt(Math.max(0, 2 * a * room));
      if (Math.abs(v) > vStop) v = Math.sign(v) * vStop;
      this.qd[i] = v;
      if (v === 0) { if (this.atLimit[i] && Math.abs(qdCmd[i]) < 1e-9) this.atLimit[i] = 0; continue; }
      const clamped = Math.min(hi, Math.max(lo, this.q[i] + v * dt));
      this.q[i] = clamped;
      this.fkDirty = true;
      const side = clamped >= hi - 1e-6 ? 1 : clamped <= lo + 1e-6 ? -1 : 0;
      if (side !== 0 && this.atLimit[i] !== side) {
        this.qd[i] = 0;
        this.events.emit('jointLimit', { axis: i, side: side as -1 | 1 });
      }
      this.atLimit[i] = side;
    }
  }

  stepGripper(dt: number) {
    this.gripper.step(dt);
    const done = this.gripper.justFinished;
    if (done === 'open' || done === 'closed') this.events.emit('gripper', { state: done });
  }

  /** Immediate halt (held stop). */
  halt() {
    this.qd.fill(0);
  }
}

const tmpM = new Matrix4();
const tmpS = new Vector3();

export function clampJoint(i: number, v: number) {
  const [lo, hi] = LIMITS_RAD[i];
  return Math.min(hi, Math.max(lo, v));
}
