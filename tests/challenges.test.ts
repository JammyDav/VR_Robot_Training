import { describe, it, expect } from 'vitest';
import { Controller } from '../src/core/Controller';
import { Challenges } from '../src/core/challenges';
import { teachIdeal, buildProgram, runToEnd, DT } from './helpers';
import type { JogCommand } from '../src/core/motion/jog';
import { persistenceEvents } from '../src/core/persistence';

function setup() {
  const ctl = new Controller();
  const ch = new Challenges(ctl);
  const step = (n: number, cmd: JogCommand = { kind: 'none' }, enable = 0.5) => {
    for (let i = 0; i < n; i++) { ctl.setEnableLevel(enable); ctl.command = cmd; ctl.update(DT); ch.update(DT); }
  };
  return { ctl, ch, step };
}

describe('challenges', () => {
  it('1: jog J1 30° each way (needs the enabling device)', () => {
    const { ctl, ch, step } = setup();
    ctl.speedOverride = 1;
    step(120, { kind: 'joint', axis: 0, rate: 1 }, 0); // no deadman: nothing
    expect(ch.isDone(1)).toBe(false);
    step(110, { kind: 'joint', axis: 0, rate: 1 });
    step(20);
    step(110, { kind: 'joint', axis: 0, rate: -1 });
    step(110, { kind: 'joint', axis: 0, rate: -1 });
    expect(ch.isDone(1)).toBe(true);
  });

  it('2: Tool jog 100 mm straight down and back up', () => {
    const { ctl, ch, step } = setup();
    ctl.setJogMode('tool');
    ctl.speedOverride = 0.5;
    step(90, { kind: 'cartesian', frame: 'tool', lin: [0, 0, 1], ang: [0, 0, 0] }); // tool +Z is down here
    step(20);
    expect(ch.isDone(2)).toBe(false);
    step(90, { kind: 'cartesian', frame: 'tool', lin: [0, 0, -1], ang: [0, 0, 0] });
    step(20);
    expect(ch.isDone(2)).toBe(true);
  });

  it('3, 4, 11, 12: speed 10→5 %, gripper, E-stop + reset, export', () => {
    const { ctl, ch, step } = setup();
    ctl.stepSpeed(1); ctl.stepSpeed(-1); // 10 → 25 → 10
    expect(ch.isDone(3)).toBe(false);
    ctl.stepSpeed(-1); // 10 → 5
    expect(ch.isDone(3)).toBe(true);
    ctl.toggleGripper(); step(45); ctl.toggleGripper(); step(45);
    expect(ch.isDone(4)).toBe(true);
    ctl.triggerEstop(); step(2, { kind: 'none' }, 0);
    ctl.reset();
    expect(ch.isDone(11)).toBe(true);
    persistenceEvents.emit('exported', { bytes: 1 });
    expect(ch.isDone(12)).toBe(true);
  });

  it('5–10 from a correctly taught program, then a Local run at 100 %', () => {
    const { ctl, ch } = setup();
    teachIdeal(ctl);
    expect([5, 6, 7].every((i) => ch.isDone(i as never))).toBe(true);
    buildProgram(ctl);
    ctl.setMode('test');
    const tick = () => ch.update(DT);
    // Run with the challenge tracker ticking each step.
    ctl.runProgram();
    for (let t = 0; ctl.runner.active && t < 200; t += DT) { ctl.setEnableLevel(0.5); ctl.update(DT); tick(); }
    expect(ch.isDone(8)).toBe(true);
    expect(ch.isDone(9)).toBe(true);
    expect(ch.isDone(10)).toBe(false);
    ctl.cell.reset();
    ctl.setMode('local');
    ctl.speedOverride = 1;
    ctl.runProgram();
    for (let t = 0; ctl.runner.active && t < 200; t += DT) { ctl.setEnableLevel(0); ctl.update(DT); tick(); }
    expect(ch.isDone(10)).toBe(true);
  });

  it('9 is not awarded when the arm comes at the plate from the side', () => {
    const { ctl, ch } = setup();
    teachIdeal(ctl);
    // No approach points: MoveJ straight onto the grip points.
    buildProgram(ctl, [
      ['movej', { point: 'pSafe' }], ['dispense'], ['trayOut'],
      ['movej', { point: 'pDispenser' }], ['close'],
      ['appro', { point: 'pDispenser', offset: 100, motion: 'L' }], ['movej', { point: 'pSafe' }],
      ['movej', { point: 'pReader' }], ['open'],
      ['appro', { point: 'pReader', offset: 100, motion: 'L' }], ['movej', { point: 'pSafe' }],
    ]);
    ctl.setMode('test');
    ctl.runProgram();
    for (let t = 0; ctl.runner.active && t < 200; t += DT) { ctl.setEnableLevel(0.5); ctl.update(DT); ch.update(DT); }
    expect(ctl.fault).toBeNull(); // the run itself succeeds; only the approach rule fails
    expect(ch.isDone(8)).toBe(true);
    expect(ch.isDone(9)).toBe(false);
  });

  it('reset clears progress', () => {
    const { ctl, ch } = setup();
    ctl.stepSpeed(-1);
    expect(ch.count).toBe(1);
    ch.reset();
    expect(ch.count).toBe(0);
  });
});

void runToEnd;

describe('example content earns no credit', () => {
  it('Load example: points and program do not complete 5–10 until the learner re-teaches / edits', async () => {
    const { loadDemo } = await import('../src/core/cell/demo');
    const { ctl, ch } = setup();
    loadDemo(ctl);
    expect([5, 6, 7].some((i) => ch.isDone(i as never))).toBe(false);
    ctl.setMode('test');
    ctl.runProgram();
    for (let t = 0; ctl.runner.active && t < 200; t += DT) { ctl.setEnableLevel(0.5); ctl.update(DT); ch.update(DT); }
    expect(ctl.runState).toBe('done');
    expect(ch.isDone(8)).toBe(false);
    // Re-teaching pDispenser at the same (correct) pose is the learner's own teach.
    const i = ctl.points.points.findIndex((p) => p.name === 'pDispenser');
    ctl.points.reteach(i, ctl.points.points[i].q);
    expect(ch.isDone(6)).toBe(true);
  });
});
