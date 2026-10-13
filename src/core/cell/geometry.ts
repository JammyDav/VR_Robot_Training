import { Matrix4, Vector3 } from 'three';
import { BENCH, DISPENSER, READER, GUARD } from '../../config/cellLayout';
import { PLATE } from '../../config/plate';
import { BASE_TO_WORLD, WORLD_TO_BASE } from '../frames';

// World-frame geometry of the cell: nest seats, tray travel, collision boxes,
// and the gripper ↔ plate transform. Kept in sync with scene/instruments.ts.

/** Height of the dispenser nest datum above the bench (stage 0.02 + datum 0.006). */
export const DISPENSER_SEAT_Y = BENCH.topY + 0.026;
/** Reader tray: carriage top + nest datum (see buildReader). */
export const TRAY_Y = 0.098;
export const READER_SEAT_DY = 0.006; // nest sits 6 mm up on the carriage; its datum top is the seat

/** Seat frame: origin at the plate seat centre (top of datum), X along the long side, Y up. A1 at (−X, −Z). */
export function dispenserSeat(out = new Matrix4()) {
  return out.makeTranslation(DISPENSER.nestX, DISPENSER_SEAT_Y, DISPENSER.z);
}

/** Reader tray seat for a given tray carriage local X (0 = retracted … trayOut = extended). */
export function readerSeat(trayLocalX: number, out = new Matrix4()) {
  return out.makeTranslation(READER.x + trayLocalX, BENCH.topY + TRAY_Y + READER_SEAT_DY, READER.z);
}

export const TRAY_IN = 0.03;
export const TRAY_OUT = READER.trayOutX - READER.x;

/**
 * Plate pose relative to the TCP when held. The fingertips sit just under the
 * skirt ledge, so the plate bottom is PLATE_GRIP_DEPTH beyond the TCP along tool +Z.
 * Plate axes: X = tool X (long side), Y (up) = −tool Z, Z = tool Y.
 */
export const PLATE_GRIP_DEPTH = 0.004;
export const TCP_TO_PLATE = new Matrix4().makeBasis(
  new Vector3(1, 0, 0),
  new Vector3(0, 0, -1),
  new Vector3(0, 1, 0),
).setPosition(0, 0, PLATE_GRIP_DEPTH);
export const PLATE_TO_TCP = TCP_TO_PLATE.clone().invert();

/** Ideal TCP pose (world) to grip a plate sitting in a seat. */
export function gripPoseWorld(seat: Matrix4, out = new Matrix4()) {
  return out.multiplyMatrices(seat, PLATE_TO_TCP);
}
/** Same, in the robot base frame (what a taught point stores). */
export function gripPoseBase(seat: Matrix4, out = new Matrix4()) {
  return out.multiplyMatrices(WORLD_TO_BASE, gripPoseWorld(seat, out));
}
export { BASE_TO_WORLD };

// --- Collision boxes (world AABBs) ------------------------------------------------

export interface Box { name: string; min: Vector3; max: Vector3 }
const box = (name: string, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): Box =>
  ({ name, min: new Vector3(x0, y0, z0), max: new Vector3(x1, y1, z1) });

const bx0 = BENCH.x - BENCH.width / 2, bx1 = BENCH.x + BENCH.width / 2;
const bz0 = BENCH.z - BENCH.depth / 2, bz1 = BENCH.z + BENCH.depth / 2;
const gx = BENCH.width / 2 - GUARD.inset, gz = BENCH.depth / 2 - GUARD.inset, gt = 0.012;

export const STATIC_BOXES: Box[] = [
  box('the bench top', bx0, 0, bz0, bx1, BENCH.topY, bz1),
  box('the dispenser', DISPENSER.x - DISPENSER.width / 2, BENCH.topY, DISPENSER.z - DISPENSER.depth / 2,
    DISPENSER.x + DISPENSER.width / 2, BENCH.topY + DISPENSER.height + 0.15, DISPENSER.z + DISPENSER.depth / 2),
  box('the dispenser stage', DISPENSER.x + DISPENSER.width / 2, BENCH.topY, DISPENSER.z - 0.07,
    DISPENSER.nestX + 0.095, BENCH.topY + 0.02, DISPENSER.z + 0.07),
  box('the plate reader', READER.x - READER.width / 2, BENCH.topY, READER.z - READER.depth / 2,
    READER.x + READER.width / 2, BENCH.topY + READER.height + 0.004, READER.z + READER.depth / 2),
  box('the guarding', BENCH.x - gx - gt, BENCH.topY, BENCH.z - gz, BENCH.x - gx + gt, BENCH.topY + GUARD.height, BENCH.z + gz),
  box('the guarding', BENCH.x + gx - gt, BENCH.topY, BENCH.z - gz, BENCH.x + gx + gt, BENCH.topY + GUARD.height, BENCH.z + gz),
  box('the guarding', BENCH.x - gx, BENCH.topY, BENCH.z - gz - gt, BENCH.x + gx, BENCH.topY + GUARD.height, BENCH.z - gz + gt),
  box('the guarding', BENCH.x - gx, BENCH.topY, BENCH.z + gz - gt, BENCH.x + gx, BENCH.topY + GUARD.height, BENCH.z + gz + gt),
];

/** Reader tray carriage as a box, for a given carriage X. */
export function trayBox(trayLocalX: number): Box {
  const cx = READER.x + trayLocalX;
  return box('the reader tray', cx - 0.075, BENCH.topY + TRAY_Y - 0.008, READER.z - 0.055, cx + 0.075, BENCH.topY + TRAY_Y, READER.z + 0.055);
}

/** Zone above the extended tray: the gripper must not be here while the tray retracts. */
export function trayZone(): Box {
  const cx = READER.x + TRAY_OUT;
  return box('the tray zone', cx - 0.09, BENCH.topY + TRAY_Y - 0.01, READER.z - 0.09, READER.x - READER.width / 2 + 0.005, BENCH.topY + TRAY_Y + 0.09, READER.z + 0.09);
}

/** Surfaces a dropped plate can land on (top Y within an XZ footprint). */
export function landingHeight(x: number, z: number): number {
  for (const b of STATIC_BOXES) {
    if (b.name === 'the guarding' || b.name === 'the bench top') continue;
    if (x >= b.min.x && x <= b.max.x && z >= b.min.z && z <= b.max.z) return b.max.y;
  }
  if (x >= bx0 && x <= bx1 && z >= bz0 && z <= bz1) return BENCH.topY;
  return 0;
}

export const PLATE_HALF = { x: PLATE.length / 2, z: PLATE.width / 2 };
