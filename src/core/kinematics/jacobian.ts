import { Vector3 } from 'three';
import { fk, createFK, jointAxisWorld, type FKResult } from './chain';
import { N } from './linalg';

/**
 * Characteristic length (m) used to make angular and linear rows comparable.
 * Angular rows of the Jacobian (and angular parts of twists) are multiplied by it.
 */
export const L_CHAR = 0.25;

const axis = new Vector3();
const origin = new Vector3();
const tcp = new Vector3();
const r = new Vector3();
const v = new Vector3();

/**
 * Geometric Jacobian at the TCP in the robot base frame, row-major 6×6:
 * rows 0–2 linear velocity, rows 3–5 angular velocity × L_CHAR.
 */
export function jacobian(q: ArrayLike<number>, J: Float64Array, fkr: FKResult = createFK()): FKResult {
  fk(q, fkr);
  tcp.setFromMatrixPosition(fkr.tcp);
  for (let i = 0; i < N; i++) {
    jointAxisWorld(fkr, i, axis, origin);
    r.subVectors(tcp, origin);
    v.crossVectors(axis, r);
    J[0 * N + i] = v.x;
    J[1 * N + i] = v.y;
    J[2 * N + i] = v.z;
    J[3 * N + i] = axis.x * L_CHAR;
    J[4 * N + i] = axis.y * L_CHAR;
    J[5 * N + i] = axis.z * L_CHAR;
  }
  return fkr;
}
