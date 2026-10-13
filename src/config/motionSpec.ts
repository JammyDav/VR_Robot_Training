// Program motion speeds ("mdesc" equivalents) and timings for the cell.

/** VAL3-style motion descriptors. Joint fractions are of each joint's datasheet max speed. */
export const MDESC = {
  mNomSpeed: { joint: 0.6, linear: 0.5, angular: Math.PI, label: 'mNomSpeed' },
  mSlow: { joint: 0.15, linear: 0.1, angular: Math.PI / 4, label: 'mSlow' },
} as const;
export type MdescName = keyof typeof MDESC;

/** Joint acceleration as a multiple of the commanded joint speed, per second. */
export const JOINT_ACCEL_FACTOR = 3;
export const LINEAR_ACCEL = 1.5; // m/s²
export const ANGULAR_ACCEL = 6; // rad/s²

/** movel aborts if the IK solution along the path misses by more than this. */
export const MOVEL_POS_TOL = 0.0008; // m
export const MOVEL_ROT_TOL = (0.5 * Math.PI) / 180; // rad

/** Move-to-point (Point jog mode) uses this descriptor, capped by manual speed. */
export const POINT_MOVE_MDESC: MdescName = 'mNomSpeed';

export const CELL_TIMING = {
  dispense: 2.0, // s internal dispensing before the plate is presented
  present: 0.7, // s plate slides out of the dispenser onto the nest
  trayTravel: 1.6, // s full extend / retract
  read: 4.0, // s plate read once the tray closes
  drop: 0.35, // s plate falls to the bench after a bad release
} as const;
