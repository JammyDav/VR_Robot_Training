// Parallel two-finger microplate gripper. Tool frame = J6 flange frame:
// +Z out of the flange (approach direction), jaws travel along ±Y, finger
// blades lie along X so they meet the plate's long sides.

export const GRIPPER = {
  adapterThickness: 0.012,
  bodySize: [0.07, 0.12, 0.042] as const, // X, Y (jaw travel), Z
  fingerLength: 0.074, // below the body
  fingerBlade: [0.05, 0.006] as const, // width along X, thickness along Y
  lipDepth: 0.0028, // inward ledge that sits under the plate skirt
  lipHeight: 0.003,
  /** Half-gap between the inner finger faces. */
  openHalfGap: 0.0515,
  closedEmptyHalfGap: 0.034,
  travelTime: 0.4, // s, open ↔ close
} as const;

/** Flange face → TCP (centre between the fingertips), along tool +Z. */
export const TOOL_LENGTH = GRIPPER.adapterThickness + GRIPPER.bodySize[2] + GRIPPER.fingerLength;
