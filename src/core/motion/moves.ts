import { Matrix4, Quaternion, Vector3 } from 'three';
import { JOINT_COUNT, MAX_SPEED_RAD } from '../../config/robotSpec';
import { MDESC, type MdescName, JOINT_ACCEL_FACTOR, LINEAR_ACCEL, ANGULAR_ACCEL, MOVEL_POS_TOL, MOVEL_ROT_TOL } from '../../config/motionSpec';
import { fk, createFK } from '../kinematics/chain';
import { solvePose } from '../kinematics/ikDls';

// Program motions. Both advance on a normalised path parameter s ∈ [0, 1]
// following a trapezoidal profile; the executor scales time for speed
// override, pause ramps and the manual TCP cap.

export type MoveStatus = { done: boolean; fault?: string };

export interface Move {
  readonly kind: 'movej' | 'movel';
  /** Advance by dt (already time-scaled); writes the new joint vector into q. */
  step(dt: number, q: Float64Array): MoveStatus;
  /** Remaining progress 0…1 (for UI). */
  readonly progress: number;
}

/** Trapezoidal profile on s ∈ [0,1] with peak rate vs (1/s) and accel as (1/s²). */
class Profile {
  readonly T: number;
  private tAcc: number;
  private vPeak: number;
  t = 0;
  constructor(vs: number, private as: number) {
    // Triangular if 1 < vs²/as.
    if (vs * vs / as > 1) { this.vPeak = Math.sqrt(as); this.tAcc = this.vPeak / as; this.T = 2 * this.tAcc; }
    else { this.vPeak = vs; this.tAcc = vs / as; this.T = this.tAcc + 1 / vs; }
  }
  /** Position at time t. */
  at(t: number) {
    const { tAcc, vPeak, as, T } = this;
    if (t <= 0) return 0;
    if (t >= T) return 1;
    if (t < tAcc) return 0.5 * as * t * t;
    if (t > T - tAcc) { const r = T - t; return 1 - 0.5 * as * r * r; }
    return 0.5 * as * tAcc * tAcc + vPeak * (t - tAcc);
  }
  get s() { return this.at(this.t); }
}

export class MoveJ implements Move {
  readonly kind = 'movej';
  private q0: Float64Array;
  private dq: Float64Array;
  private prof: Profile;

  constructor(q0: ArrayLike<number>, readonly target: ArrayLike<number>, mdesc: MdescName) {
    this.q0 = Float64Array.from(q0);
    this.dq = Float64Array.from(target, (v, i) => v - q0[i]);
    // The slowest joint (relative to its own speed) sets the duration; all arrive together.
    let vs = Infinity, as = Infinity;
    for (let i = 0; i < JOINT_COUNT; i++) {
      const d = Math.abs(this.dq[i]);
      if (d < 1e-9) continue;
      const vmax = MAX_SPEED_RAD[i] * MDESC[mdesc].joint;
      vs = Math.min(vs, vmax / d);
      as = Math.min(as, (vmax * JOINT_ACCEL_FACTOR) / d);
    }
    if (!Number.isFinite(vs)) { vs = 1e3; as = 1e4; }
    this.prof = new Profile(vs, as);
  }

  get duration() { return this.prof.T; }
  get progress() { return Math.min(1, this.prof.t / this.prof.T); }

  step(dt: number, q: Float64Array): MoveStatus {
    this.prof.t = Math.min(this.prof.T, this.prof.t + dt);
    const s = this.prof.s;
    for (let i = 0; i < JOINT_COUNT; i++) q[i] = this.q0[i] + this.dq[i] * s;
    return { done: this.prof.t >= this.prof.T };
  }
}

const p0 = new Vector3(), p1 = new Vector3(), pt = new Vector3(), sc = new Vector3();
const r0 = new Quaternion(), r1 = new Quaternion(), rt = new Quaternion();
const target = new Matrix4();
const fkr = createFK();

export class MoveL implements Move {
  readonly kind = 'movel';
  private from = new Matrix4();
  private prof: Profile;
  private failed = false;

  /** `goal` is the TCP pose in the robot base frame. */
  constructor(q0: ArrayLike<number>, readonly goal: Matrix4, mdesc: MdescName) {
    fk(q0, fkr);
    this.from.copy(fkr.tcp);
    this.from.decompose(p0, r0, sc);
    goal.decompose(p1, r1, sc);
    const L = p0.distanceTo(p1);
    const th = r0.angleTo(r1);
    const d = MDESC[mdesc];
    const vs = Math.min(L > 1e-6 ? d.linear / L : Infinity, th > 1e-6 ? d.angular / th : Infinity);
    const as = Math.min(L > 1e-6 ? LINEAR_ACCEL / L : Infinity, th > 1e-6 ? ANGULAR_ACCEL / th : Infinity);
    this.prof = Number.isFinite(vs) ? new Profile(vs, as) : new Profile(1e3, 1e4);
  }

  get duration() { return this.prof.T; }
  get progress() { return Math.min(1, this.prof.t / this.prof.T); }

  step(dt: number, q: Float64Array): MoveStatus {
    if (this.failed) return { done: true, fault: 'movel aborted.' };
    this.prof.t = Math.min(this.prof.T, this.prof.t + dt);
    const s = this.prof.s;
    this.from.decompose(p0, r0, sc);
    this.goal.decompose(p1, r1, sc);
    pt.lerpVectors(p0, p1, s);
    rt.slerpQuaternions(r0, r1, s);
    target.compose(pt, rt, sc.set(1, 1, 1));
    const last = this.prof.t >= this.prof.T;
    const sol = solvePose(q, target, { maxIter: last ? 60 : 12, posTol: 1e-5, rotTol: 1e-4 });
    // A big joint step in one tick means the IK changed branch (singularity / out of reach).
    let jump = 0;
    for (let i = 0; i < JOINT_COUNT; i++) jump = Math.max(jump, Math.abs(sol.q[i] - q[i]) / MAX_SPEED_RAD[i]);
    if (sol.posErr > MOVEL_POS_TOL || sol.rotErr > MOVEL_ROT_TOL || jump > Math.max(dt, 1 / 90) * 1.5) {
      this.failed = true;
      return {
        done: true,
        fault: `movel failed at ${(s * 100).toFixed(0)}% of the path: the straight line ${sol.posErr > MOVEL_POS_TOL ? 'leaves the reachable workspace' : 'passes too close to a singularity or a joint limit'}.`,
      };
    }
    q.set(sol.q);
    return { done: last };
  }
}
