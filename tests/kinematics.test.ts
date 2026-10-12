import { describe, it, expect } from 'vitest';
import { Matrix4, Vector3 } from 'three';
import { fk, TOOL_OFFSET } from '../src/core/kinematics/chain';
import { buildJointTree, applyJoints } from '../src/scene/robotTree';
import { BASE_TO_WORLD } from '../src/core/frames';
import { TX2_60, LIMITS_RAD, rad } from '../src/config/robotSpec';
import { Robot } from '../src/core/robot/Robot';

const pos = (m: Matrix4) => new Vector3().setFromMatrixPosition(m);
const L = TX2_60;

describe('forward kinematics', () => {
  it('zero pose is the vertical candle', () => {
    const r = fk([0, 0, 0, 0, 0, 0]);
    const p = pos(r.tcp);
    expect(p.x).toBeCloseTo(0, 9);
    expect(p.y).toBeCloseTo(L.elbowOffset, 9);
    expect(p.z).toBeCloseTo(L.baseHeight + L.upperArm + L.forearm + L.flange + TOOL_OFFSET.z, 9);
  });

  it('ready pose {0,0,90,0,90,0}: forearm horizontal, tool pointing down', () => {
    const r = fk([0, 0, rad(90), 0, rad(90), 0]);
    const wrist = pos(r.joints[4]);
    expect(wrist.x).toBeCloseTo(L.forearm, 9);
    expect(wrist.z).toBeCloseTo(L.baseHeight + L.upperArm, 9);
    const toolZ = new Vector3().setFromMatrixColumn(r.tcp, 2);
    expect(toolZ.z).toBeCloseTo(-1, 9);
    const tcp = pos(r.tcp);
    expect(tcp.z).toBeCloseTo(L.baseHeight + L.upperArm - L.flange - TOOL_OFFSET.z, 9);
  });

  it('max reach J1→flange equals the datasheet 670 mm', () => {
    // Arm straight out horizontally: J2 = 90°, J3 = 0, J5 = 0.
    const r = fk([0, rad(90), 0, 0, 0, 0]);
    const flange = pos(r.flange);
    expect(Math.hypot(flange.x, flange.y) * 1000).toBeCloseTo(670, 0);
  });

  it('scene-graph joint tree matches analytic FK for random poses', () => {
    const tree = buildJointTree();
    const out = new Matrix4();
    let seed = 42;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let n = 0; n < 200; n++) {
      const q = LIMITS_RAD.map(([lo, hi]) => lo + (hi - lo) * rnd());
      applyJoints(tree, q);
      tree.root.updateMatrixWorld(true);
      const graph = pos(tree.tcp.matrixWorld);
      const analytic = pos(out.multiplyMatrices(BASE_TO_WORLD, fk(q).tcp));
      expect(graph.distanceTo(analytic)).toBeLessThan(1e-9);
    }
  });
});

describe('robot joint jog', () => {
  it('stops on the joint limit without overshoot and reports it', () => {
    const r = new Robot();
    const hits: number[] = [];
    r.events.on('jointLimit', (e) => hits.push(e.axis));
    r.speedOverride = 1;
    r.jogAxis = 0;
    r.jogDir = 1;
    for (let i = 0; i < 900; i++) r.step(1 / 90);
    expect(r.q[0]).toBeCloseTo(LIMITS_RAD[0][1], 9);
    expect(hits).toEqual([0]);
  });

  it('only the selected axis moves', () => {
    const r = new Robot();
    const q0 = Array.from(r.q);
    r.jogAxis = 2;
    r.jogDir = -1;
    for (let i = 0; i < 90; i++) r.step(1 / 90);
    q0.forEach((v, i) => (i === 2 ? expect(r.q[i]).toBeLessThan(v) : expect(r.q[i]).toBe(v)));
  });

  it('gripper travel takes ~0.4 s', () => {
    const r = new Robot();
    r.gripper.close();
    let t = 0;
    while (r.gripper.state !== 'closed' && t < 2) { r.step(1 / 240); t += 1 / 240; }
    expect(t).toBeGreaterThan(0.38);
    expect(t).toBeLessThan(0.42);
  });
});
