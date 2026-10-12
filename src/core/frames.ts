import { Matrix4, Vector3 } from 'three';
import { ROBOT_BASE } from '../config/cellLayout';

// Robot base frame → world (Y-up) frame.
//   robot +X (forward)  = world −Z (toward the far wall, away from the operator)
//   robot +Y (left)     = world −X (dispenser side)
//   robot +Z (up)       = world +Y
export const BASE_TO_WORLD = new Matrix4().makeBasis(
  new Vector3(0, 0, -1),
  new Vector3(-1, 0, 0),
  new Vector3(0, 1, 0),
).setPosition(ROBOT_BASE.x, ROBOT_BASE.y, ROBOT_BASE.z);

export const WORLD_TO_BASE = BASE_TO_WORLD.clone().invert();
