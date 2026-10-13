import { Matrix4, Vector3 } from 'three';
import { Controller } from '../src/core/Controller';
import { solvePose } from '../src/core/kinematics/ikDls';
import { dispenserSeat, readerSeat, gripPoseBase, TRAY_OUT } from '../src/core/cell/geometry';
import { HOME_DEG, rad } from '../src/config/robotSpec';
import type { StepKind } from '../src/core/program/program';

export const DT = 1 / 90;

export function teachAt(ctl: Controller, name: string, q: ArrayLike<number>) {
  ctl.robot.setJoints(q);
  const pt = ctl.points.record(ctl.robot.q);
  ctl.points.rename(ctl.points.points.indexOf(pt), name);
}

/** IK for a TCP pose (base frame) from a seed, asserting success. */
export function ik(goal: Matrix4, seedDeg: number[]) {
  const sol = solvePose(seedDeg.map(rad), goal, { maxIter: 300 });
  if (!sol.ok) throw new Error(`IK failed: ${sol.posErr} m, ${sol.rotErr} rad`);
  return Array.from(sol.q);
}

export const SEED_DISPENSER = [90, 35, 95, 0, 50, 0];
export const SEED_READER = [-90, 35, 95, 0, 50, 0];

/** Ideal points from the nest geometry, optionally offset (mm, world X) to simulate a mis-teach. */
export function idealPoints(offsetMm = { dispenser: 0, reader: 0 }) {
  const dSeat = dispenserSeat().multiply(new Matrix4().makeTranslation(offsetMm.dispenser / 1000, 0, 0));
  const rSeat = readerSeat(TRAY_OUT).multiply(new Matrix4().makeTranslation(offsetMm.reader / 1000, 0, 0));
  const dGrip = gripPoseBase(dSeat);
  const rGrip = gripPoseBase(rSeat);
  const qD = ik(dGrip, SEED_DISPENSER);
  const qR = ik(rGrip, SEED_READER);
  return { pSafe: HOME_DEG.map(rad), pDispenser: qD, pReader: qR };
}

/** Teach the three points into the controller. */
export function teachIdeal(ctl: Controller, offsetMm?: { dispenser: number; reader: number }) {
  const pts = idealPoints(offsetMm);
  teachAt(ctl, 'pSafe', pts.pSafe);
  teachAt(ctl, 'pDispenser', pts.pDispenser);
  teachAt(ctl, 'pReader', pts.pReader);
  ctl.robot.setJoints(pts.pSafe);
}

type S = [StepKind, Partial<{ point: string; offset: number; motion: 'J' | 'L' }>?];

/**
 * The canonical transfer: approach and depart vertically at both nests, and fold
 * through pSafe between them (a 180° J1 swing with the arm stretched out reaches
 * past the guarding).
 */
export const TRANSFER: S[] = [
  ['movej', { point: 'pSafe' }],
  ['dispense'],
  ['trayOut'],
  ['appro', { point: 'pDispenser', offset: 100, motion: 'J' }],
  ['movel', { point: 'pDispenser' }],
  ['close'],
  ['appro', { point: 'pDispenser', offset: 100, motion: 'L' }],
  ['movej', { point: 'pSafe' }],
  ['appro', { point: 'pReader', offset: 100, motion: 'J' }],
  ['movel', { point: 'pReader' }],
  ['open'],
  ['appro', { point: 'pReader', offset: 100, motion: 'L' }],
  ['movej', { point: 'pSafe' }],
  ['trayIn'],
  ['waitRead'],
];

export function buildProgram(ctl: Controller, steps: S[] = TRANSFER) {
  ctl.program.clear();
  for (const [kind, patch] of steps) {
    const st = ctl.program.add(kind, patch?.point ?? '');
    if (patch) ctl.program.update(st.id, patch as never);
  }
}

/** Run until the runner stops (or a timeout). Returns elapsed sim seconds. */
export function runToEnd(ctl: Controller, enable: number, maxSeconds = 240) {
  let t = 0;
  ctl.runProgram();
  while (ctl.runner.active && t < maxSeconds) {
    ctl.setEnableLevel(enable);
    ctl.update(DT);
    t += DT;
  }
  return t;
}

export const pos = (m: Matrix4) => new Vector3().setFromMatrixPosition(m);
