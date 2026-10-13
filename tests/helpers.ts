import { Matrix4, Vector3 } from 'three';
import { Controller } from '../src/core/Controller';
import { HOME_DEG, rad } from '../src/config/robotSpec';
import { idealPoints, teachPoints, loadProgram, REFERENCE_PROGRAM, type StepSpec } from '../src/core/cell/demo';

export const DT = 1 / 90;

/** Teach pSafe / pDispenser / pReader from the nest geometry (optionally mis-taught along X, mm). */
export function teachIdeal(ctl: Controller, offsetMm?: { dispenser: number; reader: number }) {
  teachPoints(ctl, idealPoints(offsetMm));
  ctl.robot.setJoints(HOME_DEG.map(rad));
}

export const TRANSFER = REFERENCE_PROGRAM;

export function buildProgram(ctl: Controller, steps: StepSpec[] = TRANSFER) {
  loadProgram(ctl, steps);
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
