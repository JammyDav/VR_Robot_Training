import type { XRRig } from '../xr/xrSession';
import { emptyInput, type PendantInput } from './PendantInput';

// Touch Plus, WebXR "xr-standard" gamepad mapping:
//   buttons: 0 trigger, 1 squeeze (grip), 3 thumbstick press, 4 X/A, 5 Y/B
//   axes:    2 thumbstick x, 3 thumbstick y (up is negative)

function pad(rig: XRRig, hand: 'left' | 'right'): Gamepad | undefined {
  return (rig.controllers[hand]?.userData.inputSource as XRInputSource | undefined)?.gamepad;
}

const isDown = (g: Gamepad | undefined, i: number) => g?.buttons[i]?.pressed ?? false;

export function readXRInput(rig: XRRig, out: PendantInput = emptyInput()): PendantInput {
  const L = pad(rig, 'left');
  const R = pad(rig, 'right');
  out.enable = L?.buttons[1]?.value ?? 0;
  out.ls.x = L?.axes[2] ?? 0;
  out.ls.y = -(L?.axes[3] ?? 0);
  out.rs.x = R?.axes[2] ?? 0;
  out.rs.y = -(R?.axes[3] ?? 0);
  out.x = isDown(L, 4);
  out.y = isDown(L, 5);
  out.lTrigger = isDown(L, 0);
  out.a = isDown(R, 4);
  out.b = isDown(R, 5);
  out.rTrigger = isDown(R, 0);
  return out;
}

export function xrControllersReady(rig: XRRig) {
  return rig.isPresenting() && !!pad(rig, 'left') && !!pad(rig, 'right');
}
