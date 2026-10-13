import { Matrix4, Quaternion, Vector3 } from 'three';
import { Emitter } from '../events';
import { PLATE, SEAT_TOLERANCE } from '../../config/plate';
import { CELL_TIMING } from '../../config/motionSpec';
import { DISPENSER } from '../../config/cellLayout';
import {
  dispenserSeat, readerSeat, TRAY_IN, TRAY_OUT, TCP_TO_PLATE, PLATE_GRIP_DEPTH,
  trayZone, landingHeight, DISPENSER_SEAT_Y,
} from './geometry';
import { GRIPPER } from '../../config/toolSpec';

export type PlateOwner = 'presenting' | 'dispenser' | 'tray' | 'gripper' | 'rest' | 'falling';
export type PlateVariant = 'clear' | 'white' | 'black';
export type Where = 'dispenser' | 'reader';

export interface Plate {
  id: number;
  owner: PlateOwner;
  /** World pose of the plate frame (bottom centre, X long side, Y up). */
  pose: Matrix4;
  /** Held: TCP → plate transform (keeps any grip error). */
  grip: Matrix4;
  /** Animation state for presenting / falling. */
  anim: { t: number; from: Matrix4; to: Matrix4; dur: number } | null;
  /** Set when resting misseated in or near a nest. */
  misseat: Where | null;
}

export interface CellEvents extends Record<string, unknown> {
  fault: { message: string };
  dispensed: Record<string, never>;
  gripped: { from: Where | 'elsewhere' };
  released: { where: Where | null; seated: boolean };
  tray: { state: 'in' | 'out' | 'moving' };
  readStart: Record<string, never>;
  readDone: Record<string, never>;
}

const MAX_PLATES = 3;
const NEAR_H = 0.04;
const NEAR_V = 0.03;
const DEG = Math.PI / 180;

const v = new Vector3(), v2 = new Vector3(), s = new Vector3();
const qa = new Quaternion(), qb = new Quaternion();
const m = new Matrix4(), m2 = new Matrix4();

/**
 * Cell state that isn't the robot: plates and where they are, the dispenser,
 * the reader tray and its read cycle. Pure logic in world space; the scene mirrors it.
 */
export class Cell {
  readonly events = new Emitter<CellEvents>();
  plates: Plate[] = [];
  variant: PlateVariant = 'clear';
  dispenser = { state: 'idle' as 'idle' | 'dispensing' | 'presenting', t: 0 };
  tray = { x: TRAY_IN, target: 'in' as 'in' | 'out' };
  reader = { state: 'idle' as 'idle' | 'reading' | 'done', t: 0 };
  private nextId = 1;
  private pendingGrip: { plate: Plate; grip: Matrix4 } | null = null;

  reset() {
    this.plates = [];
    this.dispenser = { state: 'idle', t: 0 };
    this.tray = { x: TRAY_IN, target: 'in' };
    this.reader = { state: 'idle', t: 0 };
    this.pendingGrip = null;
  }

  // The tray extends toward −X (toward the arm), so compare by target, not by sign.
  get trayState(): 'in' | 'out' | 'moving' {
    const goal = this.tray.target === 'out' ? TRAY_OUT : TRAY_IN;
    if (Math.abs(this.tray.x - goal) < 1e-6) return this.tray.target;
    return 'moving';
  }

  held(): Plate | null { return this.plates.find((p) => p.owner === 'gripper') ?? null; }
  plateAt(where: Where): Plate | null {
    return this.plates.find((p) => (where === 'dispenser' ? p.owner === 'dispenser' || p.owner === 'presenting' : p.owner === 'tray')) ?? null;
  }
  get dispenserBusy() { return this.dispenser.state !== 'idle'; }

  // --- Dispenser ------------------------------------------------------------------
  /** Start a dispense. Returns false if the nest is occupied (nothing to do). */
  dispense(): boolean {
    if (this.dispenserBusy) return true;
    if (this.nestBlocked('dispenser')) return false;
    this.dispenser = { state: 'dispensing', t: 0 };
    return true;
  }

  private nestBlocked(where: Where) {
    if (this.plateAt(where)) return true;
    return this.plates.some((p) => p.misseat === where);
  }

  // --- Reader tray ------------------------------------------------------------------
  trayOut() {
    if (this.tray.target === 'out') return true;
    this.tray.target = 'out';
    if (this.reader.state !== 'reading') this.reader = { state: 'idle', t: 0 };
    this.events.emit('tray', { state: 'moving' });
    return true;
  }

  /** Retract the tray. Refused (with a fault) if the gripper is inside the tray zone. */
  trayIn(tcpWorld: Matrix4): boolean {
    if (this.tray.target === 'in') return true;
    const z = trayZone();
    v.setFromMatrixPosition(tcpWorld);
    const held = this.held();
    const inZone = (p: Vector3) => p.x >= z.min.x && p.x <= z.max.x && p.y >= z.min.y && p.y <= z.max.y && p.z >= z.min.z && p.z <= z.max.z;
    if (inZone(v) || (held && inZone(v2.setFromMatrixPosition(held.pose)))) {
      this.events.emit('fault', { message: 'Tray retract refused: the gripper is still inside the reader tray.' });
      return false;
    }
    this.tray.target = 'in';
    this.events.emit('tray', { state: 'moving' });
    return true;
  }

  // --- Gripper interaction --------------------------------------------------------------
  /**
   * Called as the gripper starts to close. Returns the half-gap at which the jaws
   * stop (a plate between them), or null for an empty close. A plate between the
   * jaws but out of tolerance raises a fault.
   */
  onGripperClose(tcpWorld: Matrix4): { stopAt: number | null; fault?: string } {
    this.pendingGrip = null;
    const inv = m.copy(tcpWorld).invert();
    for (const p of this.plates) {
      if (p.owner === 'gripper' || p.owner === 'falling' || p.owner === 'presenting') continue;
      const rel = m2.multiplyMatrices(inv, p.pose); // plate in TCP frame
      v.setFromMatrixPosition(rel);
      // Plate occupies tool z ∈ [v.z − h, v.z] (its up is −tool Z); fingers occupy [−L, 0].
      const overlapZ = v.z > -GRIPPER.fingerLength && v.z - PLATE.height < 0;
      const overlapXY = Math.abs(v.x) < PLATE.length / 2 + GRIPPER.fingerBlade[0] / 2 && Math.abs(v.y) < GRIPPER.openHalfGap;
      if (!overlapZ || !overlapXY) continue;
      const posErr = v.distanceTo(v2.set(0, 0, PLATE_GRIP_DEPTH));
      const angErr = gripAngleError(rel);
      if (posErr <= SEAT_TOLERANCE.position && angErr <= SEAT_TOLERANCE.angleDeg * DEG) {
        // Jaws self-centre across the plate; keep along-length / height / yaw error.
        const grip = rel.clone();
        grip.elements[13] = 0;
        this.pendingGrip = { plate: p, grip };
        return { stopAt: PLATE.width / 2 + 0.0004 };
      }
      return {
        stopAt: Math.abs(v.y) + PLATE.width / 2,
        fault: `Gripper closed on a misaligned plate (offset ${(posErr * 1000).toFixed(1)} mm, angle ${(angErr / DEG).toFixed(1)}°). Tolerance is ±${SEAT_TOLERANCE.position * 1000} mm / ±${SEAT_TOLERANCE.angleDeg}°.`,
      };
    }
    return { stopAt: null };
  }

  /** Called when the jaws finish closing. */
  onGripperClosed() {
    const g = this.pendingGrip;
    this.pendingGrip = null;
    if (!g) return;
    const from: Where | 'elsewhere' = g.plate.owner === 'dispenser' ? 'dispenser' : g.plate.owner === 'tray' ? 'reader' : 'elsewhere';
    g.plate.owner = 'gripper';
    g.plate.grip.copy(g.grip);
    g.plate.misseat = null;
    if (from === 'reader') this.reader = { state: 'idle', t: 0 };
    this.events.emit('gripped', { from });
  }

  /** Called as the gripper starts to open: release the held plate, seat it or not. */
  onGripperOpen() {
    this.pendingGrip = null;
    const p = this.held();
    if (!p) return;
    const seats: Array<{ where: Where; seat: Matrix4 }> = [];
    if (!this.nestBlocked('dispenser')) seats.push({ where: 'dispenser', seat: dispenserSeat() });
    if (this.trayState === 'out' && !this.nestBlocked('reader')) seats.push({ where: 'reader', seat: readerSeat(this.tray.x) });
    for (const { where, seat } of seats) {
      p.pose.decompose(v, qa, s);
      v2.setFromMatrixPosition(seat);
      const dx = v.x - v2.x, dz = v.z - v2.z, dy = v.y - v2.y;
      const horiz = Math.hypot(dx, dz);
      if (horiz > NEAR_H || dy > NEAR_V || dy < -0.01) continue;
      qb.setFromRotationMatrix(seat);
      const ang = qa.angleTo(qb);
      const ok = horiz <= SEAT_TOLERANCE.position && dy <= SEAT_TOLERANCE.position && dy >= -0.002 && ang <= SEAT_TOLERANCE.angleDeg * DEG;
      if (ok) {
        p.owner = where === 'dispenser' ? 'dispenser' : 'tray';
        p.pose.copy(seat); // drops flush into the locators
        p.misseat = null;
        this.events.emit('released', { where, seated: true });
        return;
      }
      // Visible misseat: resting offset, riding up on a locator, tilted.
      const yaw = yawOf(qa) - yawOf(qb);
      p.owner = 'rest';
      p.misseat = where;
      p.pose.copy(seat).multiply(m.makeTranslation(dx, 0.0045, dz)).multiply(m2.makeRotationY(yaw)).multiply(m.makeRotationX(3.5 * DEG));
      this.events.emit('released', { where, seated: false });
      const label = where === 'dispenser' ? 'the dispenser nest' : 'the reader tray';
      this.events.emit('fault', {
        message: `Plate misseated in ${label}: offset ${(Math.hypot(horiz, Math.max(0, dy)) * 1000).toFixed(1)} mm, angle ${(ang / DEG).toFixed(1)}° (tolerance ±${SEAT_TOLERANCE.position * 1000} mm / ±${SEAT_TOLERANCE.angleDeg}°).`,
      });
      return;
    }
    // Not near any available nest: it drops.
    this.dropPlate(p);
    this.events.emit('released', { where: null, seated: false });
    this.events.emit('fault', { message: 'Plate released outside a nest. It has dropped.' });
  }

  private dropPlate(p: Plate) {
    p.pose.decompose(v, qa, s);
    const yaw = yawOf(qa);
    const y = landingHeight(v.x, v.z);
    const to = new Matrix4().makeRotationY(yaw).setPosition(v.x, y, v.z);
    p.owner = 'falling';
    p.misseat = null;
    p.anim = { t: 0, from: p.pose.clone(), to, dur: CELL_TIMING.drop };
  }

  // --- Step -------------------------------------------------------------------------
  update(dt: number, tcpWorld: Matrix4) {
    // Dispenser.
    const d = this.dispenser;
    if (d.state === 'dispensing') {
      d.t += dt;
      if (d.t >= CELL_TIMING.dispense) {
        const seat = dispenserSeat();
        const inside = new Matrix4().makeTranslation(DISPENSER.x + DISPENSER.width / 2 - PLATE.length / 2 - 0.01, DISPENSER_SEAT_Y + 0.006, DISPENSER.z);
        if (this.plates.length >= MAX_PLATES) this.plates.splice(this.plates.findIndex((p) => p.owner !== 'gripper'), 1);
        this.plates.push({
          id: this.nextId++, owner: 'presenting', pose: inside.clone(), grip: new Matrix4(), misseat: null,
          anim: { t: 0, from: inside, to: seat.clone(), dur: CELL_TIMING.present },
        });
        this.dispenser = { state: 'presenting', t: 0 };
      }
    }

    // Tray.
    const speed = Math.abs(TRAY_OUT - TRAY_IN) / CELL_TIMING.trayTravel;
    const before = this.trayState;
    const goal = this.tray.target === 'out' ? TRAY_OUT : TRAY_IN;
    const dx = goal - this.tray.x;
    this.tray.x = Math.abs(dx) <= speed * dt ? goal : this.tray.x + Math.sign(dx) * speed * dt;
    const after = this.trayState;
    if (after !== before && after !== 'moving') {
      this.events.emit('tray', { state: after });
      if (after === 'in' && this.plateAt('reader')) {
        this.reader = { state: 'reading', t: 0 };
        this.events.emit('readStart', {});
      }
    }

    // Reader.
    if (this.reader.state === 'reading') {
      this.reader.t += dt;
      if (this.reader.t >= CELL_TIMING.read) {
        this.reader = { state: 'done', t: 0 };
        this.events.emit('readDone', {});
      }
    }

    // Plates.
    for (const p of this.plates) {
      switch (p.owner) {
        case 'gripper':
          p.pose.multiplyMatrices(tcpWorld, p.grip);
          break;
        case 'tray':
          readerSeat(this.tray.x, p.pose);
          break;
        case 'presenting':
        case 'falling': {
          const a = p.anim!;
          a.t += dt;
          const k = Math.min(1, a.t / a.dur);
          const e = p.owner === 'falling' ? k * k : k * k * (3 - 2 * k);
          lerpPose(a.from, a.to, e, p.pose);
          if (k >= 1) {
            if (p.owner === 'presenting') {
              p.owner = 'dispenser';
              this.dispenser = { state: 'idle', t: 0 };
              this.events.emit('dispensed', {});
            } else p.owner = 'rest';
            p.anim = null;
          }
          break;
        }
      }
    }
  }
}

/** Angle between a plate-in-TCP transform and the ideal grip, ignoring a 180° flip about the plate's vertical. */
function gripAngleError(rel: Matrix4) {
  qa.setFromRotationMatrix(rel);
  qb.setFromRotationMatrix(TCP_TO_PLATE);
  const a = qa.angleTo(qb);
  qb.multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI));
  return Math.min(a, qa.angleTo(qb));
}

function yawOf(q: Quaternion) {
  v.set(1, 0, 0).applyQuaternion(q);
  return Math.atan2(-v.z, v.x);
}

const pa = new Vector3(), pb = new Vector3(), qx = new Quaternion(), qy = new Quaternion();
function lerpPose(a: Matrix4, b: Matrix4, t: number, out: Matrix4) {
  a.decompose(pa, qx, s);
  b.decompose(pb, qy, s);
  pa.lerp(pb, t);
  qx.slerp(qy, t);
  return out.compose(pa, qx, s.set(1, 1, 1));
}
