import { Matrix4, Vector3 } from 'three';
import type { FKResult } from '../kinematics/chain';
import { BASE_TO_WORLD } from '../frames';
import { STATIC_BOXES, trayBox, type Box, PLATE_HALF } from '../cell/geometry';
import { TX2_60 } from '../../config/robotSpec';
import { GRIPPER, TOOL_LENGTH } from '../../config/toolSpec';

// Simple analytical collision: each link is a capsule (segment + radius),
// sampled as spheres and tested against axis-aligned boxes. Conservative
// radii, no physics. Enough to fault on the bench, instruments and guarding.

interface Capsule { name: string; joint: number; a: [number, number, number]; b: [number, number, number]; r: number }

const UA = TX2_60.upperArm;
// Points are in the frame of `joint` (after its rotation).
const CAPSULES: Capsule[] = [
  { name: 'upper arm', joint: 1, a: [0, 0.1, 0], b: [0, 0.1, UA], r: 0.06 },
  { name: 'upper arm', joint: 1, a: [0, 0, 0.06], b: [0, 0, UA - 0.04], r: 0.05 },
  { name: 'forearm', joint: 2, a: [0, 0, -0.04], b: [0, 0, 0.13], r: 0.06 },
  { name: 'forearm', joint: 3, a: [0, 0, 0], b: [0, 0, TX2_60.forearm - 0.13], r: 0.048 },
  { name: 'wrist', joint: 4, a: [0, -0.04, 0], b: [0, 0.04, 0], r: 0.04 },
  { name: 'wrist', joint: 4, a: [0, 0, 0], b: [0, 0, TX2_60.flange], r: 0.036 },
  { name: 'gripper', joint: 5, a: [0, 0, 0.012], b: [0, 0, 0.054], r: 0.066 },
];

const SAMPLES = 5;
const wa = new Vector3(), wb = new Vector3(), p = new Vector3();
const M = new Matrix4();

function sphereHitsBox(c: Vector3, r: number, b: Box) {
  const dx = Math.max(b.min.x - c.x, 0, c.x - b.max.x);
  const dy = Math.max(b.min.y - c.y, 0, c.y - b.max.y);
  const dz = Math.max(b.min.z - c.z, 0, c.z - b.max.z);
  return dx * dx + dy * dy + dz * dz < r * r;
}

function segmentHit(a: Vector3, b: Vector3, r: number, boxes: Box[]): Box | null {
  for (let i = 0; i <= SAMPLES; i++) {
    p.lerpVectors(a, b, i / SAMPLES);
    for (const bx of boxes) if (sphereHitsBox(p, r, bx)) return bx;
  }
  return null;
}

export interface CollisionInput {
  fk: FKResult; // base frame
  gripperHalfGap: number;
  trayX: number;
  /** World pose of a held plate, if any. */
  heldPlate: Matrix4 | null;
}

export interface CollisionHit { link: string; obstacle: string }

/** Returns the first contact found, or null. */
export function checkCollision(inp: CollisionInput): CollisionHit | null {
  const boxes = [...STATIC_BOXES, trayBox(inp.trayX)];
  for (const c of CAPSULES) {
    M.multiplyMatrices(BASE_TO_WORLD, inp.fk.joints[c.joint]);
    wa.set(...c.a).applyMatrix4(M);
    wb.set(...c.b).applyMatrix4(M);
    const hit = segmentHit(wa, wb, c.r, boxes);
    if (hit) return { link: c.name, obstacle: hit.name };
  }
  // Fingers (and so the TCP): thin capsules down each finger to the tip.
  M.multiplyMatrices(BASE_TO_WORLD, inp.fk.joints[5]);
  const z0 = GRIPPER.adapterThickness + GRIPPER.bodySize[2];
  for (const sgn of [1, -1]) {
    const y = sgn * (inp.gripperHalfGap + GRIPPER.fingerBlade[1] / 2);
    wa.set(0, y, z0).applyMatrix4(M);
    wb.set(0, y, TOOL_LENGTH - 0.003).applyMatrix4(M);
    const hit = segmentHit(wa, wb, 0.004, boxes);
    if (hit) return { link: 'gripper finger', obstacle: hit.name };
  }
  // Held plate: bottom corners and centre.
  if (inp.heldPlate) {
    for (const [x, z] of [[0, 0], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      p.set(x * PLATE_HALF.x * 0.95, 0.001, z * PLATE_HALF.z * 0.95).applyMatrix4(inp.heldPlate);
      for (const bx of boxes) if (sphereHitsBox(p, 0.0005, bx)) return { link: 'held plate', obstacle: bx.name };
    }
  }
  return null;
}
