/**
 * Normalised pendant input, produced each frame by either the XR adapter
 * (Touch Plus controllers) or the desktop adapter (keyboard). PendantLogic is
 * the only consumer, so both input paths behave identically.
 *
 * Sticks: x right = +1, y up/forward = +1.
 */
export interface PendantInput {
  /** Left grip as the three-position enabling device, 0 … 1. */
  enable: number;
  ls: { x: number; y: number };
  rs: { x: number; y: number };
  /** Left controller. */
  x: boolean;
  y: boolean;
  lTrigger: boolean;
  /** Right controller. */
  a: boolean;
  b: boolean;
  rTrigger: boolean;
}

export function emptyInput(): PendantInput {
  return { enable: 0, ls: { x: 0, y: 0 }, rs: { x: 0, y: 0 }, x: false, y: false, lTrigger: false, a: false, b: false, rTrigger: false };
}
