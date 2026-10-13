import { Euler, Matrix4, Quaternion, Vector3 } from 'three';
import { fk } from '../kinematics/chain';
import { Emitter } from '../events';

/** Names the learner can pick when renaming a taught point. */
export const SUGGESTED_NAMES = ['pSafe', 'pHome', 'pApproDispenser', 'pDispenser', 'pApproReader', 'pReader'] as const;

export interface TaughtPoint {
  name: string;
  /** Joint values (rad) at teach time: the point's configuration. */
  q: number[];
  /** Derived Cartesian pose of the TCP in the robot base ("world") frame, tool tGripper. */
  pose: { x: number; y: number; z: number; rx: number; ry: number; rz: number }; // mm, deg
  tool: 'tGripper';
  frame: 'world';
}

export interface PointEvents extends Record<string, unknown> {
  changed: Record<string, never>;
  recorded: { name: string };
  renamed: { from: string; to: string };
}

const p = new Vector3(), q = new Quaternion(), s = new Vector3(), e = new Euler();
const DEG = 180 / Math.PI;

export function poseOf(qj: ArrayLike<number>): TaughtPoint['pose'] {
  fk(qj).tcp.decompose(p, q, s);
  e.setFromQuaternion(q, 'XYZ');
  return { x: p.x * 1000, y: p.y * 1000, z: p.z * 1000, rx: e.x * DEG, ry: e.y * DEG, rz: e.z * DEG };
}

/** TCP pose matrix (base frame) of a taught point. */
export function poseMatrix(pt: TaughtPoint, out = new Matrix4()) {
  return out.copy(fk(pt.q).tcp);
}

export class PointStore {
  readonly events = new Emitter<PointEvents>();
  points: TaughtPoint[] = [];
  selected = -1;

  get(name: string) { return this.points.find((x) => x.name === name) ?? null; }
  get current() { return this.points[this.selected] ?? null; }

  private nextAutoName() {
    for (let i = 1; ; i++) {
      const n = `p${String(i).padStart(2, '0')}`;
      if (!this.get(n)) return n;
    }
  }

  record(qj: ArrayLike<number>): TaughtPoint {
    const pt: TaughtPoint = { name: this.nextAutoName(), q: Array.from(qj), pose: poseOf(qj), tool: 'tGripper', frame: 'world' };
    this.points.push(pt);
    this.selected = this.points.length - 1;
    this.events.emit('recorded', { name: pt.name });
    this.events.emit('changed', {});
    return pt;
  }

  /** Overwrite a point with the current pose ("re-teach"). */
  reteach(index: number, qj: ArrayLike<number>) {
    const pt = this.points[index];
    if (!pt) return;
    pt.q = Array.from(qj);
    pt.pose = poseOf(qj);
    this.events.emit('recorded', { name: pt.name });
    this.events.emit('changed', {});
  }

  /** Rename; if another point already has the name, it gets a fresh auto name. */
  rename(index: number, name: string) {
    const pt = this.points[index];
    if (!pt || pt.name === name) return;
    const clash = this.get(name);
    const from = pt.name;
    if (clash) clash.name = this.nextAutoName();
    pt.name = name;
    this.events.emit('renamed', { from, to: name });
    this.events.emit('changed', {});
  }

  remove(index: number) {
    if (!this.points[index]) return;
    this.points.splice(index, 1);
    this.selected = Math.min(this.selected, this.points.length - 1);
    this.events.emit('changed', {});
  }

  select(step: 1 | -1) {
    if (!this.points.length) { this.selected = -1; return; }
    this.selected = (Math.max(0, this.selected) + step + this.points.length) % this.points.length;
  }

  load(points: TaughtPoint[]) {
    this.points = points.filter((x) => x && typeof x.name === 'string' && Array.isArray(x.q) && x.q.length === 6)
      .map((x) => ({ ...x, pose: poseOf(x.q), tool: 'tGripper' as const, frame: 'world' as const }));
    this.selected = this.points.length ? 0 : -1;
    this.events.emit('changed', {});
  }
}
