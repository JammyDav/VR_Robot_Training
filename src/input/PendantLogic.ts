import type { Controller } from '../core/Controller';
import type { JogCommand } from '../core/motion/jog';
import type { PendantInput } from './PendantInput';

// SP2-style controller mapping. One place for every binding.
//
//   Left grip (analogue)        enabling device: mid range enables, full squeeze = panic
//   Left X                      cycle jog mode (Joint → Frame → Tool → Point)
//   Hold left Y + right stick ↕ speed override step (no jogging while Y is held)
//   Joint:  left stick ↕ selects the axis, right stick ↔ Move− / Move+
//   Frame/Tool translate: left stick ↕ X, ↔ Y; right stick ↕ Z
//   Frame/Tool rotate:    left stick ↔ Rx, ↕ Ry; right stick ↔ Rz
//   Right B tap (< 0.3 s)       toggle translate / rotate
//   Right B hold (1 s)          emergency stop
//   Right A                     record point (Joint/Frame/Tool) · hold to move to point (Point)
//   Right trigger               ray select: panel keys, boards, and the gripper (point at it)
//   E-stop reset                RESET key on the pendant panel (enabling device released)

export const DEADZONE = 0.15;
const LATCH_ON = 0.7;
const LATCH_OFF = 0.3;
export const B_TAP_MAX = 0.3;
export const B_ESTOP_HOLD = 1.0;

export interface PendantHooks {
  recordPoint?(): void;
  moveToPoint?(active: boolean): void;
}

/** Shapes a stick axis: dead zone, rescale, then a gentle curve for fine control. */
export function shape(v: number) {
  const m = Math.abs(v);
  if (m < DEADZONE) return 0;
  const t = (m - DEADZONE) / (1 - DEADZONE);
  return Math.sign(v) * t * t * 0.4 + Math.sign(v) * t * 0.6;
}

export class PendantLogic {
  private prev: PendantInput | null = null;
  private axisLatch = false;
  private speedLatch = false;
  private bDown = 0; // seconds held
  private bFired = false;
  /** Progress 0…1 of a hold gesture, for UI rings. */
  holdProgress = { estop: 0 };

  constructor(private ctl: Controller, private hooks: PendantHooks = {}) {}

  update(dt: number, inp: PendantInput) {
    const ctl = this.ctl;
    const prev = this.prev;
    const pressed = (k: 'x' | 'y' | 'a' | 'b' | 'rTrigger' | 'lTrigger') => inp[k] && !(prev?.[k] ?? false);

    ctl.setEnableLevel(inp.enable);

    if (pressed('x')) ctl.cycleJogMode();

    // Right B: tap toggles rotation, a 1 s hold is the E-stop shortcut.
    if (inp.b) {
      this.bDown += dt;
      if (!this.bFired && this.bDown >= B_ESTOP_HOLD) { ctl.triggerEstop(); this.bFired = true; }
    } else {
      if (prev?.b && !this.bFired && this.bDown < B_TAP_MAX) ctl.toggleRotation();
      this.bDown = 0;
      this.bFired = false;
    }
    this.holdProgress.estop = inp.b && !this.bFired ? Math.min(1, this.bDown / B_ESTOP_HOLD) : 0;

    // Right A: record a point, or (Point mode) hold to move to the selected point.
    if (!ctl.estop) {
      if (ctl.jogMode === 'point') this.hooks.moveToPoint?.(inp.a);
      else if (pressed('a')) this.hooks.recordPoint?.();
    }

    // Speed override: hold Y, flick the right stick.
    if (inp.y) {
      if (Math.abs(inp.rs.y) > LATCH_ON && !this.speedLatch) {
        this.speedLatch = true;
        ctl.stepSpeed(inp.rs.y > 0 ? 1 : -1);
      } else if (Math.abs(inp.rs.y) < LATCH_OFF) this.speedLatch = false;
      ctl.command = { kind: 'none' };
      this.prev = clone(inp);
      return;
    }
    this.speedLatch = false;

    ctl.command = this.jogCommand(inp);
    this.prev = clone(inp);
  }

  private jogCommand(inp: PendantInput): JogCommand {
    const ctl = this.ctl;
    switch (ctl.jogMode) {
      case 'joint': {
        if (Math.abs(inp.ls.y) > LATCH_ON && !this.axisLatch) {
          this.axisLatch = true;
          ctl.selectAxis(inp.ls.y > 0 ? -1 : 1); // stick up = previous axis (list reads top-down)
        } else if (Math.abs(inp.ls.y) < LATCH_OFF) this.axisLatch = false;
        const rate = shape(inp.rs.x);
        return rate === 0 ? { kind: 'none' } : { kind: 'joint', axis: ctl.jointAxis, rate };
      }
      case 'frame':
      case 'tool': {
        const frame = ctl.jogMode === 'frame' ? 'base' : 'tool';
        const lx = shape(inp.ls.x), ly = shape(inp.ls.y), rx = shape(inp.rs.x), ry = shape(inp.rs.y);
        if (lx === 0 && ly === 0 && rx === 0 && ry === 0) return { kind: 'none' };
        // Robot base: +X away from the operator, +Y to the operator's left, +Z up.
        if (!ctl.rotation) return { kind: 'cartesian', frame, lin: [ly, -lx, ry], ang: [0, 0, 0] };
        return { kind: 'cartesian', frame, lin: [0, 0, 0], ang: [lx, ly, -rx] };
      }
      default:
        return { kind: 'none' };
    }
  }
}

function clone(i: PendantInput): PendantInput {
  return { ...i, ls: { ...i.ls }, rs: { ...i.rs } };
}
