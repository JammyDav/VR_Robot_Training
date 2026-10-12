import { describe, it, expect } from 'vitest';
import { Vector3, Quaternion } from 'three';
import { fk } from '../src/core/kinematics/chain';
import { jacobian, L_CHAR } from '../src/core/kinematics/jacobian';
import { solvePose, dlsTwist } from '../src/core/kinematics/ikDls';
import { LIMITS_RAD, rad } from '../src/config/robotSpec';

let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

function randomPose() {
  // Stay clear of the wrist singularity and the outer joint limits.
  return LIMITS_RAD.map(([lo, hi], i) => {
    if (i === 4) return (rnd() < 0.5 ? -1 : 1) * rad(20 + rnd() * 90);
    return lo * 0.7 + (hi - lo) * 0.7 * rnd();
  });
}

describe('inverse kinematics (DLS)', () => {
  it('pose solver recovers FK targets from a nearby start', () => {
    let worst = 0;
    for (let n = 0; n < 120; n++) {
      const q = randomPose();
      const target = fk(q).tcp.clone();
      const q0 = q.map((v) => v + rad((rnd() - 0.5) * 10));
      const sol = solvePose(q0, target, { maxIter: 100 });
      expect(sol.ok).toBe(true);
      const p = new Vector3().setFromMatrixPosition(fk(sol.q).tcp);
      worst = Math.max(worst, p.distanceTo(new Vector3().setFromMatrixPosition(target)));
    }
    expect(worst).toBeLessThan(1e-4); // 0.1 mm
  });

  it('twist solve is accurate away from singularities', () => {
    const q = [0.3, 0.2, 1.5, 0.1, 1.2, 0.2];
    const twist = [0.1, -0.05, 0.08, 0.2, -0.1, 0.3];
    const dq = new Float64Array(6);
    dlsTwist(q, twist, dq);
    const J = new Float64Array(36);
    jacobian(q, J);
    for (let r = 0; r < 6; r++) {
      let s = 0;
      for (let c = 0; c < 6; c++) s += J[r * 6 + c] * dq[c];
      const want = r < 3 ? twist[r] : twist[r] * L_CHAR;
      expect(Math.abs(s - want)).toBeLessThan(2e-3);
    }
  });

  it('reports and damps at the wrist singularity instead of exploding', () => {
    const q = [0, 0, rad(90), 0, 0, 0]; // J5 = 0: J4 and J6 aligned
    const dq = new Float64Array(6);
    const info = dlsTwist(q, [0, 0, 0, 0, 0, 0.5], dq);
    expect(info.nearSingular).toBe(true);
    for (const v of dq) expect(Number.isFinite(v)).toBe(true);
    expect(Math.max(...Array.from(dq, Math.abs))).toBeLessThan(10);
  });

  it('pose solver keeps orientation within tolerance', () => {
    const q = [0.5, 0.3, 1.3, -0.4, 0.9, 0.6];
    const target = fk(q).tcp.clone();
    const sol = solvePose(q.map((v) => v + 0.05), target);
    const a = new Quaternion().setFromRotationMatrix(fk(sol.q).tcp);
    const b = new Quaternion().setFromRotationMatrix(target);
    expect(a.angleTo(b)).toBeLessThan(1e-3);
  });
});
