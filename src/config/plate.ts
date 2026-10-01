// ANSI/SLAS 1-2004 microplate footprint, standard-height 96-well. Metres.
export const PLATE = {
  length: 0.12776, // X, long side
  width: 0.08548, // Z, short side
  height: 0.01435,
  wellPitch: 0.009,
  wellDiameter: 0.0069,
  rows: 8,
  cols: 12,
  a1OffsetX: 0.01438, // A1 centre from left edge
  a1OffsetY: 0.01124, // A1 centre from top edge
  chamfer: 0.004, // A1 corner chamfer (visual)
  skirtHeight: 0.0063, // flange height above the base
  skirtInset: 0.0012,
} as const;

/** Seating tolerance before a release is treated as a misseat. */
export const SEAT_TOLERANCE = { position: 0.003, angleDeg: 3 } as const;
