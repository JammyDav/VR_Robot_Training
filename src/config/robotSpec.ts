// TX2-60 (standard arm) specification. Lengths in metres, angles in degrees.
// Source: Stäubli "TX2-60 Range" product data sheet, V17, © 02/2026 (D181.636.04).
// See README "Robot specification verification" for status of each value.

const DEG = Math.PI / 180;

export const TX2_60 = {
  name: 'TX2-60',
  // Datasheet "Load capacity". The sheet gives one figure; some resellers
  // quote 3.5 kg nominal / 4.5 kg max, so the plate states "load capacity".
  loadCapacityKg: 4.5,
  reachMm: 670, // between axis 1 and 6 — datasheet
  repeatabilityMm: 0.02, // ISO 9283 — datasheet
  weightKg: 52.2,

  // Kinematic chain (Stäubli convention: all joints at 0 = arm vertical, "candle").
  // upperArm + forearm = 600 mm = datasheet "max reach axis 1–5"; forearm 310 mm =
  // datasheet "reach between axis 3 and 5"; flange 70 mm = 670 − 600.
  // Base height and elbow offset are from TX60-family drawings (not on the sheet).
  baseHeight: 0.375, // mounting face → J2 axis
  upperArm: 0.29, // J2 → J3
  elbowOffset: 0.02, // lateral offset along the J2/J3 axis direction
  forearm: 0.31, // J3 → wrist centre (J5)
  flange: 0.07, // J5 → J6 flange face

  // Joint limits — datasheet "range of motion".
  limitsDeg: [
    [-180, 180],
    [-127.5, 127.5],
    [-142.5, 142.5],
    [-270, 270],
    [-121, 132.5],
    [-270, 270], // software-configurable up to ±11 250° on the real arm
  ] as const,

  // Maximum joint speeds — datasheet.
  maxSpeedDegS: [435, 410, 540, 995, 1065, 1445] as const,
} as const;

export const JOINT_COUNT = 6;

export const LIMITS_RAD: ReadonlyArray<readonly [number, number]> = TX2_60.limitsDeg.map(
  ([lo, hi]) => [lo * DEG, hi * DEG] as const,
);
export const MAX_SPEED_RAD: ReadonlyArray<number> = TX2_60.maxSpeedDegS.map((v) => v * DEG);

/** Manual-mode TCP speed cap (reduced speed), mm/s. */
export const MANUAL_TCP_CAP_MMPS = 250;

/**
 * Joint-jog rate at 100 % override, as a fraction of each joint's max speed.
 * Keeps manual jogging teachable; the TCP cap is applied on top in stage 3.
 */
export const JOG_JOINT_FRACTION = 0.1;

/** Ready pose: forearm horizontal, tool pointing down. */
export const HOME_DEG = [0, 0, 90, 0, 90, 0] as const;

export const deg = (r: number) => r / DEG;
export const rad = (d: number) => d * DEG;
