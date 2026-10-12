import type { XRRig } from '../xr/xrSession';

type Hand = 'left' | 'right';

/** Short haptic pulse on a Touch Plus controller (no-op on desktop). */
export function pulse(rig: XRRig, hand: Hand, intensity: number, ms: number) {
  const src = rig.controllers[hand]?.userData.inputSource as XRInputSource | undefined;
  const act = src?.gamepad?.hapticActuators?.[0] as (GamepadHapticActuator & { pulse?: (v: number, d: number) => Promise<boolean> }) | undefined;
  try { act?.pulse?.(Math.min(1, Math.max(0, intensity)), ms); } catch { /* unsupported */ }
}

export const HAPTIC = {
  click: [0.35, 18],
  gripper: [0.5, 40],
  modeChange: [0.25, 25],
  limit: [0.6, 60],
  fault: [1.0, 220],
} as const;
