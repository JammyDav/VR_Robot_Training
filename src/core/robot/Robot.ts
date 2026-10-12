import { Vector3, Quaternion, Matrix4 } from 'three';
import { JOINT_COUNT, LIMITS_RAD, MAX_SPEED_RAD, JOG_JOINT_FRACTION, HOME_DEG, rad } from '../../config/robotSpec';
import { fk, createFK, type FKResult } from '../kinematics/chain';
import { BASE_TO_WORLD } from '../frames';
import { Gripper } from './Gripper';
import { Emitter } from '../events';

export interface RobotEvents extends Record<string, unknown> {
  jointLimit: { axis: number; side: -1 | 1 };
  gripper: { state: 'open' | 'closed' };
}

/** Joint acceleration used for jog ramps and stops, as a multiple of each joint's jog speed per second. */
const JOG_RAMP = 6;

/**
 * Single source of truth for the arm: joint positions and velocities, the
 * gripper, and cached forward kinematics. Input layers command it; the scene reads it.
 */
export class Robot {
  readonly q = new Float64Array(JOINT_COUNT);
  readonly qd = new Float64Array(JOINT_COUNT);
  readonly gripper = new Gripper();
  readonly events = new Emitter<RobotEvents>();

  /** Speed override, 0.01–1. */
  speedOverride = 0.25;

  /** Joint jog command: selected axis and direction (−1, 0, +1). */
  jogAxis = 0;
  jogDir: -1 | 0 | 1 = 0;

  private fkCache: FKResult = createFK();
  private fkDirty = true;
  private atLimit = new Int8Array(JOINT_COUNT);

  constructor() {
    HOME_DEG.forEach((d, i) => (this.q[i] = rad(d)));
  }

  /** Forward kinematics in the robot base frame (cached per step). */
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

  jogSpeed(axis: number) {
    return MAX_SPEED_RAD[axis] * JOG_JOINT_FRACTION * this.speedOverride;
  }

  step(dt: number) {
    for (let i = 0; i < JOINT_COUNT; i++) {
      const vmax = this.jogSpeed(i);
      const target = i === this.jogAxis ? this.jogDir * vmax : 0;
      const a = Math.max(vmax, MAX_SPEED_RAD[i] * 0.02) * JOG_RAMP;
      let v = approach(this.qd[i], target, a * dt);

      // Brake ahead of the joint limit so the arm stops on it rather than through it.
      const [lo, hi] = LIMITS_RAD[i];
      const room = v > 0 ? hi - this.q[i] : this.q[i] - lo;
      const vStop = Math.sqrt(Math.max(0, 2 * a * room));
      if (Math.abs(v) > vStop) v = Math.sign(v) * vStop;

      this.qd[i] = v;
      if (v !== 0) {
        const next = this.q[i] + v * dt;
        const clamped = Math.min(hi, Math.max(lo, next));
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

    this.gripper.step(dt);
    const done = this.gripper.justFinished;
    if (done === 'open' || done === 'closed') this.events.emit('gripper', { state: done });
  }

  /** Immediate halt of all commanded motion. */
  stop() {
    this.jogDir = 0;
    this.qd.fill(0);
  }
}

const tmpM = new Matrix4();
const tmpS = new Vector3();

function approach(v: number, target: number, maxDelta: number) {
  if (v < target) return Math.min(target, v + maxDelta);
  if (v > target) return Math.max(target, v - maxDelta);
  return v;
}

export function clampJoint(i: number, v: number) {
  const [lo, hi] = LIMITS_RAD[i];
  return Math.min(hi, Math.max(lo, v));
}
