import { solvePose } from '../kinematics/ikDls';
import { dispenserSeat, readerSeat, gripPoseBase, TRAY_OUT } from './geometry';
import { HOME_DEG, rad } from '../../config/robotSpec';
import type { Controller } from '../Controller';
import type { StepKind } from '../program/program';

// Reference points and program: correctly taught from the nest geometry.
// Used by `?demo` (to try execution without teaching) and by the tests.

const SEED_DISPENSER = [90, 35, 95, 0, 50, 0];
const SEED_READER = [-90, 35, 95, 0, 50, 0];

function ik(goal: ReturnType<typeof gripPoseBase>, seedDeg: number[]) {
  const sol = solvePose(seedDeg.map(rad), goal, { maxIter: 300 });
  if (!sol.ok) throw new Error(`IK failed: ${sol.posErr} m, ${sol.rotErr} rad`);
  return Array.from(sol.q);
}

/** Ideal points, optionally offset along world X (mm) to simulate a mis-teach. */
export function idealPoints(offsetMm = { dispenser: 0, reader: 0 }) {
  const dSeat = dispenserSeat();
  dSeat.elements[12] += offsetMm.dispenser / 1000;
  const rSeat = readerSeat(TRAY_OUT);
  rSeat.elements[12] += offsetMm.reader / 1000;
  return {
    pSafe: HOME_DEG.map(rad),
    pDispenser: ik(gripPoseBase(dSeat), SEED_DISPENSER),
    pReader: ik(gripPoseBase(rSeat), SEED_READER),
  };
}

export type StepSpec = [StepKind, Partial<{ point: string; offset: number; motion: 'J' | 'L' }>?];

/**
 * Reference transfer: vertical approach and departure at both nests, folding
 * through pSafe in between (a 180° J1 swing with the arm stretched out reaches
 * past the guarding).
 */
export const REFERENCE_PROGRAM: StepSpec[] = [
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

export function teachPoints(ctl: Controller, pts: Record<string, number[]>) {
  for (const [name, q] of Object.entries(pts)) {
    ctl.robot.setJoints(q);
    const pt = ctl.points.record(ctl.robot.q);
    ctl.points.rename(ctl.points.points.indexOf(pt), name);
  }
}

export function loadProgram(ctl: Controller, steps: StepSpec[] = REFERENCE_PROGRAM) {
  ctl.program.clear();
  for (const [kind, patch] of steps) {
    const st = ctl.program.add(kind, patch?.point ?? '');
    if (patch) ctl.program.update(st.id, patch as never);
  }
}

/** Replace points and program with the reference set, arm at pSafe. */
export function loadDemo(ctl: Controller) {
  ctl.points.load([]);
  const pts = idealPoints();
  teachPoints(ctl, pts);
  loadProgram(ctl);
  ctl.robot.setJoints(pts.pSafe);
  ctl.points.selected = 0;
}
