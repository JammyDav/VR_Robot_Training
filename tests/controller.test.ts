import { describe, it, expect } from 'vitest';
import { Vector3, Quaternion } from 'three';
import { Controller } from '../src/core/Controller';
import type { JogCommand } from '../src/core/motion/jog';
import { LIMITS_RAD, MAX_SPEED_RAD, MANUAL_TCP_CAP_MMPS, rad, deg } from '../src/config/robotSpec';

const DT = 1 / 90;

function run(ctl: Controller, seconds: number, cmd: JogCommand, enable = 0.5, each?: () => void) {
  const n = Math.round(seconds / DT);
  for (let i = 0; i < n; i++) {
    ctl.setEnableLevel(enable);
    ctl.command = cmd;
    ctl.update(DT);
    each?.();
  }
}
const tcp = (c: Controller) => new Vector3().setFromMatrixPosition(c.robot.fk.tcp);
const joint = (axis: number, rate = 1): JogCommand => ({ kind: 'joint', axis, rate });
const frame = (lin: [number, number, number], ang: [number, number, number] = [0, 0, 0], f: 'base' | 'tool' = 'base'): JogCommand =>
  ({ kind: 'cartesian', frame: f, lin, ang });

describe('enabling device (deadman)', () => {
  it('no motion without the enabling device', () => {
    const c = new Controller();
    const q0 = Array.from(c.robot.q);
    run(c, 1, joint(0), 0);
    expect(Array.from(c.robot.q)).toEqual(q0);
  });

  it('mid position enables; full squeeze is a latched panic stop', () => {
    const c = new Controller();
    run(c, 0.5, joint(0), 0.5);
    expect(c.robot.q[0]).toBeGreaterThan(0);
    run(c, 0.05, joint(0), 1.0);
    expect(c.enable).toBe('panic');
    const q = c.robot.q[0];
    run(c, 0.5, joint(0), 0.5); // easing back to mid does NOT re-enable
    expect(c.enable).toBe('panic');
    expect(c.robot.q[0]).toBeCloseTo(q, 6);
    run(c, 0.05, joint(0), 0); // full release clears the latch
    run(c, 0.3, joint(0), 0.5);
    expect(c.enable).toBe('enabled');
    expect(c.robot.q[0]).toBeGreaterThan(q);
  });

  it('releasing mid-jog stops the arm within 0.2 s', () => {
    const c = new Controller();
    c.speedOverride = 1;
    run(c, 1, joint(0));
    run(c, 0.2, joint(0), 0);
    expect(Math.abs(c.robot.qd[0])).toBe(0);
  });
});

describe('emergency stop', () => {
  it('halts immediately and needs an explicit reset with the enabling device released', () => {
    const c = new Controller();
    c.speedOverride = 1;
    run(c, 0.5, joint(0));
    c.triggerEstop();
    const q = Array.from(c.robot.q);
    run(c, 0.5, joint(0));
    expect(Array.from(c.robot.q)).toEqual(q);
    expect(c.beacon).toBe('fault');
    expect(c.resetEstop()).toBe(false); // deadman still held
    run(c, 0.05, { kind: 'none' }, 0);
    expect(c.resetEstop()).toBe(true);
    expect(c.beacon).toBe('manual');
  });
});

describe('speed model', () => {
  it('caps TCP speed at 250 mm/s in manual even at 100 % override', () => {
    const c = new Controller();
    c.speedOverride = 1;
    c.robot.setJoints([0, rad(60), rad(30), 0, rad(60), 0]); // arm stretched out
    let prev = tcp(c);
    let worst = 0;
    run(c, 1.5, joint(0), 0.5, () => {
      const p = tcp(c);
      worst = Math.max(worst, p.distanceTo(prev) / DT);
      prev = p;
    });
    expect(worst * 1000).toBeLessThanOrEqual(MANUAL_TCP_CAP_MMPS + 1);
    expect(worst * 1000).toBeGreaterThan(MANUAL_TCP_CAP_MMPS * 0.9); // and it actually reaches it
  });

  it('override scales jog speed', () => {
    const a = new Controller(); a.speedOverride = 0.1;
    const b = new Controller(); b.speedOverride = 0.5;
    run(a, 1, joint(5)); run(b, 1, joint(5));
    expect(b.robot.q[5] / a.robot.q[5]).toBeCloseTo(5, 0);
  });

  it('modes outside Manual refuse to jog', () => {
    const c = new Controller();
    c.setMode('local');
    const q0 = Array.from(c.robot.q);
    run(c, 0.5, joint(0));
    expect(Array.from(c.robot.q)).toEqual(q0);
  });
});

describe('Cartesian jog', () => {
  it('Frame +X moves the TCP in a straight line without changing orientation', () => {
    const c = new Controller();
    c.speedOverride = 0.5;
    const p0 = tcp(c);
    const r0 = new Quaternion().setFromRotationMatrix(c.robot.fk.tcp);
    run(c, 1, frame([1, 0, 0]));
    const p1 = tcp(c);
    const d = p1.clone().sub(p0);
    expect(d.x).toBeGreaterThan(0.08);
    expect(Math.hypot(d.y, d.z) * 1000).toBeLessThan(1); // < 1 mm off-axis
    const r1 = new Quaternion().setFromRotationMatrix(c.robot.fk.tcp);
    expect(deg(r0.angleTo(r1))).toBeLessThan(0.2);
  });

  it('Tool +Z from the ready pose goes straight down (tool points down), then back up', () => {
    const c = new Controller();
    c.speedOverride = 0.5;
    const p0 = tcp(c);
    run(c, 0.9, frame([0, 0, 1], [0, 0, 0], 'tool'));
    run(c, 0.3, { kind: 'none' });
    const mid = tcp(c);
    expect(p0.z - mid.z).toBeGreaterThan(0.1);
    expect(Math.hypot(mid.x - p0.x, mid.y - p0.y) * 1000).toBeLessThan(1);
    run(c, 0.9, frame([0, 0, -1], [0, 0, 0], 'tool'));
    run(c, 0.3, { kind: 'none' });
    expect(tcp(c).distanceTo(p0) * 1000).toBeLessThan(1);
  });

  it('jogging through the wrist singularity slows and never flips J4/J6', () => {
    const c = new Controller();
    c.speedOverride = 1;
    c.robot.setJoints([0, rad(10), rad(80), 0, rad(6), 0]);
    let flagged = false;
    let worstStep4 = 0, worstStep6 = 0;
    let q4 = c.robot.q[3], q6 = c.robot.q[5];
    let crossingSwing = 0; // J4/J6 travel while |J5| < 3°
    // Tilt through J5 = 0 while asking for a yaw the wrist can't give there.
    run(c, 2.0, frame([0, 0, 0], [0, -0.6, 0.6]), 0.5, () => {
      flagged ||= c.jogInfo.nearSingular;
      worstStep4 = Math.max(worstStep4, Math.abs(c.robot.q[3] - q4));
      worstStep6 = Math.max(worstStep6, Math.abs(c.robot.q[5] - q6));
      if (Math.abs(deg(c.robot.q[4])) < 3) crossingSwing = Math.max(crossingSwing, Math.abs(deg(c.robot.q[3])), Math.abs(deg(c.robot.q[5])));
      q4 = c.robot.q[3]; q6 = c.robot.q[5];
      for (const v of c.robot.q) expect(Number.isFinite(v)).toBe(true);
    });
    expect(flagged).toBe(true);
    // J5 actually passed through the singularity, and J4/J6 barely moved while it did (no ±180° flip).
    expect(deg(c.robot.q[4])).toBeLessThan(-3);
    expect(crossingSwing).toBeLessThan(5);
    // Per-step change bounded by the manual joint ceiling (25 % of max speed): no flips.
    expect(worstStep4).toBeLessThanOrEqual(MAX_SPEED_RAD[3] * 0.25 * DT + 1e-9);
    expect(worstStep6).toBeLessThanOrEqual(MAX_SPEED_RAD[5] * 0.25 * DT + 1e-9);
    for (let i = 0; i < 6; i++) {
      expect(c.robot.q[i]).toBeGreaterThanOrEqual(LIMITS_RAD[i][0]);
      expect(c.robot.q[i]).toBeLessThanOrEqual(LIMITS_RAD[i][1]);
    }
  });
});
