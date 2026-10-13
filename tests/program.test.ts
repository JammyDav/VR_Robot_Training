import { describe, it, expect } from 'vitest';
import { Vector3 } from 'three';
import { MoveJ, MoveL } from '../src/core/motion/moves';
import { fk } from '../src/core/kinematics/chain';
import { Program, generateVal3 } from '../src/core/program/program';
import { rad } from '../src/config/robotSpec';

describe('motion', () => {
  it('movej: all joints arrive together (synchronised)', () => {
    const q0 = [0, 0, rad(90), 0, rad(90), 0];
    const q1 = [rad(60), rad(20), rad(70), rad(-30), rad(40), rad(90)];
    const m = new MoveJ(q0, q1, 'mNomSpeed');
    const q = Float64Array.from(q0);
    let done = false;
    let maxSpread = 0;
    while (!done) {
      done = m.step(1 / 240, q).done;
      // Fraction of travel completed must be identical for every moving joint.
      const f = q1.map((v, i) => (q[i] - q0[i]) / (v - q0[i]));
      maxSpread = Math.max(maxSpread, Math.max(...f) - Math.min(...f));
    }
    expect(maxSpread).toBeLessThan(1e-9);
    q1.forEach((v, i) => expect(q[i]).toBeCloseTo(v, 9));
  });

  it('movel: the TCP stays on the straight line', () => {
    const q0 = [rad(20), rad(20), rad(100), 0, rad(60), 0];
    const start = fk(q0).tcp.clone();
    const goal = start.clone().setPosition(new Vector3().setFromMatrixPosition(start).add(new Vector3(0.12, -0.08, -0.1)));
    const m = new MoveL(q0, goal, 'mSlow');
    const q = Float64Array.from(q0);
    const a = new Vector3().setFromMatrixPosition(start), b = new Vector3().setFromMatrixPosition(goal);
    const dir = b.clone().sub(a).normalize();
    let worst = 0, done = false, fault: string | undefined;
    while (!done) {
      const st = m.step(1 / 240, q);
      done = st.done; fault = st.fault;
      const p = new Vector3().setFromMatrixPosition(fk(q).tcp).sub(a);
      worst = Math.max(worst, p.clone().sub(dir.clone().multiplyScalar(p.dot(dir))).length());
    }
    expect(fault).toBeUndefined();
    expect(worst * 1000).toBeLessThan(0.5);
    expect(new Vector3().setFromMatrixPosition(fk(q).tcp).distanceTo(b) * 1000).toBeLessThan(0.05);
  });

  it('movel aborts with a fault when the line leaves the workspace', () => {
    const q0 = [0, 0, rad(90), 0, rad(90), 0];
    const start = fk(q0).tcp.clone();
    const goal = start.clone().setPosition(new Vector3().setFromMatrixPosition(start).add(new Vector3(0.6, 0, 0)));
    const m = new MoveL(q0, goal, 'mNomSpeed');
    const q = Float64Array.from(q0);
    let st = { done: false } as { done: boolean; fault?: string };
    for (let i = 0; i < 5000 && !st.done; i++) st = m.step(1 / 90, q);
    expect(st.fault).toMatch(/movel failed/);
  });
});

describe('VAL3-flavoured code generation', () => {
  it('renders the sequence with movej/movel/appro/waitEndMove/open/close/delay', () => {
    const p = new Program();
    const add = (k: Parameters<Program['add']>[0], point = '', patch = {}) => { const s = p.add(k, point); p.update(s.id, patch); };
    add('movej', 'pSafe');
    add('appro', 'pDispenser', { offset: 100, motion: 'J' });
    add('movel', 'pDispenser');
    add('close');
    add('wait', '', { seconds: 0.4 });
    add('appro', 'pDispenser', { offset: 50, motion: 'L', speed: 'mSlow' });
    const { lines, stepLine } = generateVal3(p.steps);
    expect(lines).toEqual([
      'begin',
      '  // Plate transfer: dispenser → reader',
      '  movej(pSafe, tGripper, mNomSpeed)',
      '  movej(appro(pDispenser, trAppro), tGripper, mNomSpeed)',
      '  movel(pDispenser, tGripper, mSlow)',
      '  waitEndMove()',
      '  close(tGripper)',
      '  waitEndMove()',
      '  delay(0.4)',
      '  movel(appro(pDispenser, {0,0,-50,0,0,0}), tGripper, mSlow)',
      'end',
    ]);
    expect(stepLine).toEqual([2, 3, 4, 6, 8, 9]);
  });
});
