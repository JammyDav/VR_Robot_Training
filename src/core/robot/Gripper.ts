import { GRIPPER } from '../../config/toolSpec';

export type GripperState = 'open' | 'closing' | 'closed' | 'opening';

const SPEED = (GRIPPER.openHalfGap - GRIPPER.closedEmptyHalfGap) / GRIPPER.travelTime; // m/s per jaw

/**
 * Jaw kinematics only. Whether something is gripped is decided by the cell
 * (stage 5), which can set `stopAt` to the half-gap of an object between the jaws.
 */
export class Gripper {
  halfGap: number = GRIPPER.openHalfGap;
  state: GripperState = 'open';
  /** Half-gap at which closing jaws meet an object, or null if nothing is between them. */
  stopAt: number | null = null;
  /** Set for one step when the jaws finish travelling. */
  justFinished: GripperState | null = null;

  get isOpen() { return this.state === 'open' || this.state === 'opening'; }
  get moving() { return this.state === 'opening' || this.state === 'closing'; }

  open() { if (this.state !== 'open') this.state = 'opening'; }
  close() { if (this.state !== 'closed') this.state = 'closing'; }
  toggle() { if (this.isOpen) this.close(); else this.open(); }

  /** Freeze the jaws where they are (E-stop / fault). */
  halt() {
    if (this.state === 'closing') this.state = 'closed';
    else if (this.state === 'opening') this.state = 'open';
  }

  step(dt: number) {
    this.justFinished = null;
    if (this.state === 'opening') {
      this.halfGap = Math.min(GRIPPER.openHalfGap, this.halfGap + SPEED * dt);
      if (this.halfGap >= GRIPPER.openHalfGap) { this.state = 'open'; this.justFinished = 'open'; }
    } else if (this.state === 'closing') {
      const floor = this.stopAt ?? GRIPPER.closedEmptyHalfGap;
      this.halfGap = Math.max(floor, this.halfGap - SPEED * dt);
      if (this.halfGap <= floor) { this.state = 'closed'; this.justFinished = 'closed'; }
    }
  }
}
