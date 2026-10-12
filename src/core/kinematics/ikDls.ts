import { Matrix4, Quaternion, Vector3 } from 'three';
import { N, solve6, det6, jjt } from './linalg';
import { jacobian, L_CHAR } from './jacobian';
import { createFK } from './chain';
import { LIMITS_RAD } from '../../config/robotSpec';

// Damped least-squares inverse kinematics.
//   dq = Jᵀ (J Jᵀ + λ² I)⁻¹ x
// λ grows smoothly as the manipulability w = √det(J Jᵀ) drops below W0, so the
// solution stays bounded through singularities: the arm slows instead of flipping.

/**
 * Manipulability below which damping (and the singularity warning) kicks in.
 * Calibrated: typical working poses ≈ 3–4e-4; J5 = 15° ≈ 1.2e-4; J5 = 1° ≈ 8e-6.
 */
export const W0 = 1.2e-4;
/** Maximum damping factor at w = 0. */
export const LAMBDA_MAX = 0.06;
const LAMBDA_MIN = 1e-4;
/** Joints within this margin of a limit are frozen if the solution pushes them outward. */
const LIMIT_MARGIN = 0.002;

export interface DlsInfo {
  manipulability: number;
  lambda: number;
  nearSingular: boolean;
  /** Joints removed from the solve because they sit on a limit. */
  blocked: number[];
}

const J = new Float64Array(36);
const Jm = new Float64Array(36);
const A = new Float64Array(36);
const b = new Float64Array(6);
const y = new Float64Array(6);
const fkr = createFK();

export function manipulability(Jac: Float64Array) {
  return Math.sqrt(Math.max(0, det6(jjt(Jac, A))));
}

export function dampingFor(w: number) {
  if (w >= W0) return LAMBDA_MIN;
  const k = 1 - (w / W0) ** 2;
  return Math.max(LAMBDA_MIN, LAMBDA_MAX * Math.sqrt(k));
}

/**
 * One DLS solve for a desired twist. `twist` = [vx, vy, vz, wx, wy, wz] in the base
 * frame (m/s, rad/s). Writes joint rates to `dq`.
 */
export function dlsTwist(q: ArrayLike<number>, twist: ArrayLike<number>, dq: Float64Array): DlsInfo {
  jacobian(q, J, fkr);
  const w = manipulability(J);
  const lambda = dampingFor(w);
  const mask = [true, true, true, true, true, true];
  const blocked: number[] = [];

  for (let pass = 0; pass < 3; pass++) {
    for (let i = 0; i < 36; i++) Jm[i] = mask[i % N] ? J[i] : 0;
    jjt(Jm, A);
    for (let i = 0; i < N; i++) A[i * N + i] += lambda * lambda;
    for (let i = 0; i < 3; i++) b[i] = twist[i];
    for (let i = 3; i < 6; i++) b[i] = twist[i] * L_CHAR;
    if (!solve6(A, b, y)) { dq.fill(0); break; }
    for (let c = 0; c < N; c++) {
      let s = 0;
      for (let r = 0; r < N; r++) s += Jm[r * N + c] * y[r];
      dq[c] = s;
    }
    // Freeze joints that would be driven further into a limit, then re-solve.
    let changed = false;
    for (let i = 0; i < N; i++) {
      if (!mask[i]) continue;
      const [lo, hi] = LIMITS_RAD[i];
      if ((q[i] >= hi - LIMIT_MARGIN && dq[i] > 0) || (q[i] <= lo + LIMIT_MARGIN && dq[i] < 0)) {
        mask[i] = false;
        blocked.push(i);
        changed = true;
      }
    }
    if (!changed) break;
  }
  return { manipulability: w, lambda, nearSingular: w < W0, blocked };
}

// --- Pose solver (used by movel and point teaching) ---------------------------

export interface PoseSolve {
  q: Float64Array;
  ok: boolean;
  posErr: number; // m
  rotErr: number; // rad
  iterations: number;
}

const pCur = new Vector3();
const pTgt = new Vector3();
const qCur = new Quaternion();
const qTgt = new Quaternion();
const qErr = new Quaternion();
const sTmp = new Vector3();
const twist = new Float64Array(6);
const dqTmp = new Float64Array(6);

/** Pose error as a twist (base frame) from current TCP to target TCP. */
export function poseError(cur: Matrix4, target: Matrix4, out: Float64Array) {
  cur.decompose(pCur, qCur, sTmp);
  target.decompose(pTgt, qTgt, sTmp);
  out[0] = pTgt.x - pCur.x;
  out[1] = pTgt.y - pCur.y;
  out[2] = pTgt.z - pCur.z;
  qErr.copy(qTgt).multiply(qCur.invert());
  if (qErr.w < 0) { qErr.x = -qErr.x; qErr.y = -qErr.y; qErr.z = -qErr.z; qErr.w = -qErr.w; }
  const s = Math.sqrt(qErr.x * qErr.x + qErr.y * qErr.y + qErr.z * qErr.z);
  const angle = 2 * Math.atan2(s, qErr.w);
  const k = s > 1e-12 ? angle / s : 2;
  out[3] = qErr.x * k;
  out[4] = qErr.y * k;
  out[5] = qErr.z * k;
  return { pos: Math.hypot(out[0], out[1], out[2]), rot: angle };
}

/**
 * Iterative DLS from `q0` toward a TCP pose in the base frame. Stays on the
 * configuration branch of `q0` (it never jumps), which is what movel needs.
 */
export function solvePose(
  q0: ArrayLike<number>,
  target: Matrix4,
  opts: { maxIter?: number; posTol?: number; rotTol?: number; maxStep?: number } = {},
): PoseSolve {
  const maxIter = opts.maxIter ?? 60;
  const posTol = opts.posTol ?? 1e-5;
  const rotTol = opts.rotTol ?? 1e-4;
  const maxStep = opts.maxStep ?? 0.25; // rad per iteration
  const q = Float64Array.from(q0);
  let err = { pos: Infinity, rot: Infinity };
  let it = 0;
  for (; it < maxIter; it++) {
    jacobian(q, J, fkr);
    err = poseError(fkr.tcp, target, twist);
    if (err.pos < posTol && err.rot < rotTol) break;
    dlsTwist(q, twist, dqTmp);
    let m = 0;
    for (let i = 0; i < N; i++) m = Math.max(m, Math.abs(dqTmp[i]));
    const s = m > maxStep ? maxStep / m : 1;
    for (let i = 0; i < N; i++) {
      const [lo, hi] = LIMITS_RAD[i];
      q[i] = Math.min(hi, Math.max(lo, q[i] + dqTmp[i] * s));
    }
  }
  return { q, ok: err.pos < posTol * 10 && err.rot < rotTol * 10, posErr: err.pos, rotErr: err.rot, iterations: it };
}
