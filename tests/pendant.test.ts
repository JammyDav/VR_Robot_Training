import { describe, it, expect } from 'vitest';
import { Controller } from '../src/core/Controller';
import { PendantLogic } from '../src/input/PendantLogic';
import { emptyInput } from '../src/input/PendantInput';
import { rad } from '../src/config/robotSpec';

const DT = 1 / 90;

function rig() {
  const ctl = new Controller();
  const logic = new PendantLogic(ctl, { recordPoint: () => ctl.recordPoint(), moveToPoint: (h) => ctl.moveToPoint(h) });
  const inp = emptyInput();
  const frame = (n = 1) => { for (let i = 0; i < n; i++) { logic.update(DT, inp); ctl.update(DT); } };
  return { ctl, inp, frame };
}

describe('pendant: points', () => {
  it('A records a point in Joint mode with an auto name', () => {
    const { ctl, inp, frame } = rig();
    inp.a = true; frame(); inp.a = false; frame();
    expect(ctl.points.points.map((p) => p.name)).toEqual(['p01']);
    inp.a = true; frame(); inp.a = false; frame();
    expect(ctl.points.points.map((p) => p.name)).toEqual(['p01', 'p02']);
  });

  it('Point mode: hold A with the enabling device moves to the selected point; releasing stops it', () => {
    const { ctl, inp, frame } = rig();
    const target = [rad(40), rad(20), rad(80), 0, rad(70), 0];
    ctl.robot.setJoints(target);
    ctl.recordPoint();
    ctl.robot.setJoints([0, 0, rad(90), 0, rad(90), 0]);
    // Cycle jog mode to Point.
    while (ctl.jogMode !== 'point') { inp.x = true; frame(); inp.x = false; frame(); }
    // Without the enabling device: no motion.
    inp.a = true; frame(30);
    expect(ctl.robot.q[0]).toBe(0);
    // With it: moves; let go of A part-way and it holds.
    inp.enable = 0.5; frame(20);
    inp.a = false; frame(5);
    const mid = ctl.robot.q[0];
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(rad(40));
    frame(30);
    expect(ctl.robot.q[0]).toBeCloseTo(mid, 9);
    // Hold again until it arrives.
    inp.a = true; frame(600);
    target.forEach((v, i) => expect(ctl.robot.q[i]).toBeCloseTo(v, 6));
  });

  it('renaming to a name already in use bumps the old holder to an auto name', () => {
    const { ctl } = rig();
    ctl.recordPoint(); ctl.recordPoint();
    ctl.points.rename(0, 'pSafe');
    ctl.points.rename(1, 'pSafe');
    expect(ctl.points.points.map((p) => p.name)).toEqual(['p01', 'pSafe']);
  });
});
