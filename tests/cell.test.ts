import { describe, it, expect } from 'vitest';
import { Quaternion } from 'three';
import { Controller } from '../src/core/Controller';
import { readerSeat, dispenserSeat, TRAY_IN } from '../src/core/cell/geometry';
import { teachIdeal, buildProgram, runToEnd, pos, DT } from './helpers';

const angle = (a: import('three').Matrix4, b: import('three').Matrix4) =>
  new Quaternion().setFromRotationMatrix(a).angleTo(new Quaternion().setFromRotationMatrix(b));

describe('plate transfer program', () => {
  it('a correctly taught program moves the plate flush into the reader, then validates', () => {
    const c = new Controller();
    teachIdeal(c);
    buildProgram(c);
    c.setMode('test');
    c.speedOverride = 1;
    runToEnd(c, 0.5);
    expect(c.fault).toBeNull();
    expect(c.runState).toBe('done');
    const plate = c.cell.plates[0];
    expect(plate.owner).toBe('tray');
    expect(pos(plate.pose).distanceTo(pos(readerSeat(TRAY_IN)))).toBeLessThan(1e-9); // flush
    expect(angle(plate.pose, readerSeat(TRAY_IN))).toBeLessThan(1e-9);
    expect(c.cell.reader.state).toBe('done');
    expect(c.validated).toBe(true);
  });

  it('once validated, runs in Local at 100 % without the enabling device', () => {
    const c = new Controller();
    teachIdeal(c);
    buildProgram(c);
    c.setMode('test');
    runToEnd(c, 0.5);
    expect(c.validated).toBe(true);
    c.cell.reset();
    c.setMode('local');
    c.speedOverride = 1;
    const t = runToEnd(c, 0);
    expect(c.fault).toBeNull();
    expect(c.runState).toBe('done');
    expect(c.cell.plates[0].owner).toBe('tray');
    expect(t).toBeLessThan(60);
  });

  it('Manual test pauses without the enabling device', () => {
    const c = new Controller();
    teachIdeal(c);
    buildProgram(c);
    c.setMode('test');
    c.robot.setJoints([0.4, 0.2, 1.5, 0, 1.2, 0]); // away from pSafe so step 1 must move
    const q0 = Array.from(c.robot.q);
    c.runProgram();
    for (let i = 0; i < 180; i++) { c.setEnableLevel(0); c.update(DT); }
    expect(Array.from(c.robot.q)).toEqual(q0);
    expect(c.runState).toBe('running'); // held, not aborted
  });

  it('editing the program clears validation', () => {
    const c = new Controller();
    teachIdeal(c);
    buildProgram(c);
    c.setMode('test');
    runToEnd(c, 0.5);
    expect(c.validated).toBe(true);
    c.program.add('wait', '');
    expect(c.validated).toBe(false);
  });
});

describe('faults', () => {
  it('a reader point mis-taught by 5 mm misseats the plate and faults', () => {
    const c = new Controller();
    teachIdeal(c, { dispenser: 0, reader: 5 });
    buildProgram(c);
    c.setMode('test');
    runToEnd(c, 0.5);
    expect(c.fault).toMatch(/misseated in the reader tray/);
    expect(c.runState).toBe('faulted');
    const plate = c.cell.plates[0];
    expect(plate.owner).toBe('rest');
    expect(plate.misseat).toBe('reader');
    expect(c.beacon).toBe('fault');
  });

  it('a 2 mm mis-teach is within tolerance and still seats flush', () => {
    const c = new Controller();
    teachIdeal(c, { dispenser: 0, reader: 2 });
    buildProgram(c);
    c.setMode('test');
    runToEnd(c, 0.5);
    expect(c.fault).toBeNull();
    expect(c.cell.plates[0].owner).toBe('tray');
  });

  it('closing on a misaligned plate faults', () => {
    const c = new Controller();
    teachIdeal(c, { dispenser: 6, reader: 0 });
    buildProgram(c);
    c.setMode('test');
    runToEnd(c, 0.5);
    expect(c.fault).toMatch(/misaligned plate/);
  });

  it('releasing a plate in mid-air drops it to the bench and faults', () => {
    const c = new Controller();
    teachIdeal(c);
    buildProgram(c, [
      ['movej', { point: 'pSafe' }], ['dispense'],
      ['appro', { point: 'pDispenser', offset: 100, motion: 'J' }], ['movel', { point: 'pDispenser' }], ['close'],
      ['appro', { point: 'pDispenser', offset: 100, motion: 'L' }], ['open'],
    ]);
    c.setMode('test');
    runToEnd(c, 0.5);
    expect(c.fault).toMatch(/released outside a nest/);
    for (let i = 0; i < 90; i++) c.update(DT);
    const plate = c.cell.plates[0];
    expect(plate.owner).toBe('rest');
    // It landed back on the dispenser stage/nest area surface, not floating.
    expect(pos(plate.pose).y).toBeLessThan(pos(dispenserSeat()).y + 0.001);
  });

  it('retracting the tray with the gripper inside it is refused with a fault', () => {
    const c = new Controller();
    teachIdeal(c);
    buildProgram(c, [['trayOut'], ['appro', { point: 'pReader', offset: 100, motion: 'J' }], ['movel', { point: 'pReader' }], ['trayIn']]);
    c.setMode('test');
    runToEnd(c, 0.5);
    expect(c.fault).toMatch(/Tray retract refused/);
    expect(c.cell.tray.target).toBe('out');
  });

  it('driving the gripper into the bench is a collision fault', () => {
    const c = new Controller();
    teachIdeal(c);
    // Teach a point 30 mm below the dispenser grip pose.
    const q = c.points.get('pDispenser')!.q;
    c.robot.setJoints(q);
    let t = 0;
    while (!c.fault && t < 3) { c.setEnableLevel(0.5); c.command = { kind: 'cartesian', frame: 'base', lin: [0, 0, -1], ang: [0, 0, 0] }; c.update(DT); t += DT; }
    expect(c.fault).toMatch(/Collision/);
    // Reset with the enabling device released, then the arm can be jogged clear.
    c.setEnableLevel(0); c.update(DT);
    expect(c.reset()).toBe(true);
    for (let i = 0; i < 90; i++) { c.setEnableLevel(0.5); c.command = { kind: 'cartesian', frame: 'base', lin: [0, 0, 1], ang: [0, 0, 0] }; c.update(DT); }
    expect(c.fault).toBeNull();
    expect(c.recovering).toBe(false);
  });
});
