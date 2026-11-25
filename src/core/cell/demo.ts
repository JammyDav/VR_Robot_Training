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

/** Record and name points. `example` marks them as not taught by the learner (no challenge credit). */
export function teachPoints(ctl: Controller, pts: Record<string, number[]>, example = false) {
  for (const [name, q] of Object.entries(pts)) {
    ctl.robot.setJoints(q);
    const pt = ctl.points.record(ctl.robot.q);
    if (example) ctl.points.example.add(pt.name); // the mark follows the rename
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
  teachPoints(ctl, pts, true);
  ctl.program.loadingExample = true;
  loadProgram(ctl);
  ctl.program.loadingExample = false;
  ctl.program.fromExample = true;
  ctl.robot.setJoints(pts.pSafe);
  ctl.points.selected = 0;
}

/**
 * Demo loop: dispenser → reader → read → back to the dispenser, forever.
 * Vertical approach and departure at both nests, folding through pSafe.
 * "Dispense" only presents a plate when the nest is empty, so after the first
 * cycle the same plate shuttles back and forth.
 */
export const DEMO_LOOP_PROGRAM: StepSpec[] = [
  ['movej', { point: 'pSafe' }],
  ['dispense'],
  ['trayOut'],
  // Dispenser → reader.
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
  // Reader → dispenser.
  ['trayOut'],
  ['appro', { point: 'pReader', offset: 100, motion: 'J' }],
  ['movel', { point: 'pReader' }],
  ['close'],
  ['appro', { point: 'pReader', offset: 100, motion: 'L' }],
  ['movej', { point: 'pSafe' }],
  ['appro', { point: 'pDispenser', offset: 100, motion: 'J' }],
  ['movel', { point: 'pDispenser' }],
  ['open'],
  ['appro', { point: 'pDispenser', offset: 100, motion: 'L' }],
  ['movej', { point: 'pSafe' }],
  ['trayIn'],
];

/**
 * Unattended attract / demo mode. Loads the reference points and the loop
 * program, switches to Local, treats the built-in program as validated (so no
 * enabling device is needed), and restarts it after every cycle. If anything
 * faults it resets the cell and starts again after a short pause.
 * Stop it with ABORT or the E-stop; reload the page without ?demo=loop to leave it.
 */
export class DemoLoop {
  private wait = 1.5;
  private stopped = false;

  constructor(private ctl: Controller, speed = 0.5) {
    loadDemo(ctl);
    ctl.program.loadingExample = true;
    loadProgram(ctl, DEMO_LOOP_PROGRAM);
    ctl.program.loadingExample = false;
    ctl.program.fromExample = true;
    ctl.cell.reset();
    ctl.setMode('local');
    ctl.speedOverride = speed;
    ctl.validateForDemo();
    ctl.demoLoop = true;
    // A deliberate ABORT or E-stop ends the loop (the operator took over).
    ctl.runner.events.on('state', (e) => { if (e.state === 'aborted' && !ctl.estop) this.stopped = true; });
    ctl.events.on('estop', (e) => { if (e.active) this.stopped = true; });
  }

  update(dt: number) {
    const c = this.ctl;
    if (this.stopped) { c.demoLoop = false; return; }
    if (c.runner.active) return;
    this.wait -= dt;
    if (this.wait > 0) return;
    if (c.fault) {
      // Unattended recovery: clear the fault, put the cell and arm back, go again.
      c.reset();
      c.cell.reset();
      c.robot.setJoints(c.points.get('pSafe')!.q);
    }
    if (c.mode !== 'local') c.setMode('local');
    if (!c.validated) c.validateForDemo();
    c.runProgram();
    this.wait = 1.5;
  }
}
