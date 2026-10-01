// World frame: Y up, metres. Origin at floor centre of the room.
// The learner starts on the operator marker (+Z side) facing -Z toward the bench.

export const ROOM = { width: 7, depth: 5, height: 2.8 } as const; // x, z, y
export const HALF_W = ROOM.width / 2;
export const HALF_D = ROOM.depth / 2;

export const BENCH = {
  x: 0,
  z: -0.3,
  width: 2.2, // along X
  depth: 1.0, // along Z
  topY: 0.9,
  topThickness: 0.025,
} as const;

export const PEDESTAL = { size: 0.3, height: 0.08 } as const;
export const ROBOT_BASE = {
  x: BENCH.x,
  y: BENCH.topY + PEDESTAL.height,
  z: BENCH.z,
} as const;

// Instruments sit on the bench either side of the arm. Final nest/tray
// coordinates are tuned against the robot's reach in stage 5.
export const DISPENSER = { x: -0.8, z: BENCH.z, width: 0.4, depth: 0.42, height: 0.32, nestX: -0.47 } as const;
export const READER = { x: 0.82, z: BENCH.z, width: 0.4, depth: 0.42, height: 0.22, trayOutX: 0.5 } as const;

export const GUARD = {
  inset: 0.03, // from bench edge
  height: 0.5, // above bench top
} as const;

export const OPERATOR_SPOT = { x: 0, z: 0.95, facingYaw: 0 } as const; // yaw 0 = looking toward -Z

export const BOARDS = {
  y: 1.62, // centre height
  width: 1.8,
  height: 1.2,
  whiteboardX: -1.12,
  programBoardX: 1.12,
} as const;
