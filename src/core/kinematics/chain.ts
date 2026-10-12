import { Matrix4, Vector3 } from 'three';
import { TX2_60 } from '../../config/robotSpec';
import { TOOL_LENGTH } from '../../config/toolSpec';

// Robot base frame: Z up, X forward (away from the operator), Y to the operator's left.
// Each joint: translate by `offset` in the parent joint frame, then rotate about `axis`.

export type Axis = 'y' | 'z';

export interface JointDef {
  offset: readonly [number, number, number];
  axis: Axis;
}

/** Position of the J4 frame along the forearm (kinematically free; chosen for the visual split). */
export const J4_ALONG_FOREARM = 0.13;

export const CHAIN: readonly JointDef[] = [
  { offset: [0, 0, 0], axis: 'z' }, // J1 — base rotation
  { offset: [0, 0, TX2_60.baseHeight], axis: 'y' }, // J2 — shoulder
  { offset: [0, TX2_60.elbowOffset, TX2_60.upperArm], axis: 'y' }, // J3 — elbow
  { offset: [0, 0, J4_ALONG_FOREARM], axis: 'z' }, // J4 — forearm roll
  { offset: [0, 0, TX2_60.forearm - J4_ALONG_FOREARM], axis: 'y' }, // J5 — wrist pitch (wrist centre)
  { offset: [0, 0, TX2_60.flange], axis: 'z' }, // J6 — flange roll
];

export const TOOL_OFFSET = new Vector3(0, 0, TOOL_LENGTH);

const tmpT = new Matrix4();
const tmpR = new Matrix4();

function jointMatrix(def: JointDef, q: number, out: Matrix4) {
  tmpT.makeTranslation(def.offset[0], def.offset[1], def.offset[2]);
  if (def.axis === 'z') tmpR.makeRotationZ(q);
  else tmpR.makeRotationY(q);
  return out.multiplyMatrices(tmpT, tmpR);
}

export interface FKResult {
  /** World-from-joint-i frames in the robot base frame, i = 0..5 (after each joint's rotation). */
  joints: Matrix4[];
  flange: Matrix4;
  tcp: Matrix4;
}

export function createFK(): FKResult {
  return { joints: CHAIN.map(() => new Matrix4()), flange: new Matrix4(), tcp: new Matrix4() };
}

const local = new Matrix4();
const toolM = new Matrix4();

/** Forward kinematics in the robot base frame. `tool` defaults to the gripper TCP. */
export function fk(q: ArrayLike<number>, out: FKResult = createFK(), tool: Vector3 = TOOL_OFFSET): FKResult {
  let parent: Matrix4 | null = null;
  for (let i = 0; i < CHAIN.length; i++) {
    jointMatrix(CHAIN[i], q[i], local);
    if (parent) out.joints[i].multiplyMatrices(parent, local);
    else out.joints[i].copy(local);
    parent = out.joints[i];
  }
  out.flange.copy(out.joints[5]);
  toolM.makeTranslation(tool.x, tool.y, tool.z);
  out.tcp.multiplyMatrices(out.flange, toolM);
  return out;
}

/** World axis (unit) and origin of joint i, for Jacobians. */
export function jointAxisWorld(fkr: FKResult, i: number, axisOut: Vector3, originOut: Vector3) {
  const m = fkr.joints[i];
  originOut.setFromMatrixPosition(m);
  const e = m.elements;
  if (CHAIN[i].axis === 'z') axisOut.set(e[8], e[9], e[10]);
  else axisOut.set(e[4], e[5], e[6]);
  return axisOut.normalize();
}
