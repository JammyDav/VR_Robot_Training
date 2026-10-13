import type { MdescName } from '../../config/motionSpec';
import { Emitter } from '../events';

// The program is a list of steps. The visual sequence and the VAL3-flavoured
// code are both generated from it; nothing is ever parsed back from text.

export type Step =
  | { id: number; kind: 'movej'; point: string; speed: MdescName }
  | { id: number; kind: 'movel'; point: string; speed: MdescName }
  | { id: number; kind: 'appro'; point: string; offset: number; motion: 'J' | 'L'; speed: MdescName }
  | { id: number; kind: 'open' }
  | { id: number; kind: 'close' }
  | { id: number; kind: 'wait'; seconds: number }
  | { id: number; kind: 'dispense' }
  | { id: number; kind: 'trayOut' }
  | { id: number; kind: 'trayIn' }
  | { id: number; kind: 'waitRead' };

export type StepKind = Step['kind'];

export const STEP_PALETTE: Array<{ kind: StepKind; label: string }> = [
  { kind: 'movej', label: 'MoveJ' },
  { kind: 'movel', label: 'MoveL' },
  { kind: 'appro', label: 'Approach' },
  { kind: 'open', label: 'Gripper open' },
  { kind: 'close', label: 'Gripper close' },
  { kind: 'wait', label: 'Wait' },
  { kind: 'dispense', label: 'Dispense plate' },
  { kind: 'trayOut', label: 'Tray extend' },
  { kind: 'trayIn', label: 'Tray retract' },
  { kind: 'waitRead', label: 'Wait for read' },
];

export const APPRO_OFFSETS = [50, 100, 150, 200] as const;
export const WAIT_SECONDS = [0.5, 1, 2, 5] as const;

export interface ProgramEvents extends Record<string, unknown> {
  changed: Record<string, never>;
}

export const PROGRAM_TITLE = 'Plate transfer: dispenser → reader';

export class Program {
  readonly events = new Emitter<ProgramEvents>();
  steps: Step[] = [];
  private nextId = 1;

  add(kind: StepKind, defaultPoint: string, at = this.steps.length): Step {
    const id = this.nextId++;
    let st: Step;
    switch (kind) {
      case 'movej': st = { id, kind, point: defaultPoint, speed: 'mNomSpeed' }; break;
      case 'movel': st = { id, kind, point: defaultPoint, speed: 'mSlow' }; break;
      case 'appro': st = { id, kind, point: defaultPoint, offset: 100, motion: 'J', speed: 'mNomSpeed' }; break;
      case 'wait': st = { id, kind, seconds: 1 }; break;
      default: st = { id, kind } as Step;
    }
    this.steps.splice(at, 0, st);
    this.changed();
    return st;
  }

  remove(id: number) { this.steps = this.steps.filter((s) => s.id !== id); this.changed(); }

  move(id: number, dir: -1 | 1) {
    const i = this.steps.findIndex((s) => s.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= this.steps.length) return;
    [this.steps[i], this.steps[j]] = [this.steps[j], this.steps[i]];
    this.changed();
  }

  update(id: number, patch: Partial<Step>) {
    const st = this.steps.find((s) => s.id === id);
    if (!st) return;
    Object.assign(st, patch);
    this.changed();
  }

  clear() { this.steps = []; this.changed(); }

  load(steps: Step[]) {
    this.steps = steps.map((s) => ({ ...s, id: this.nextId++ }));
    this.changed();
  }

  /** Points referenced by the program. */
  pointsUsed(): string[] {
    const set = new Set<string>();
    for (const s of this.steps) if ('point' in s && s.point) set.add(s.point);
    return [...set];
  }

  /** Plain JSON for export / storage (ids stripped). */
  toJSON() { return this.steps.map(({ id: _id, ...rest }) => rest); }

  private changed() { this.events.emit('changed', {}); }
}

// --- Labels and VAL3-flavoured code generation ----------------------------------

export function stepLabel(s: Step): string {
  switch (s.kind) {
    case 'movej': return `MoveJ to ${s.point || '—'}`;
    case 'movel': return `MoveL to ${s.point || '—'}`;
    case 'appro': return `Approach ${s.point || '—'} by ${s.offset} mm (${s.motion === 'J' ? 'MoveJ' : 'MoveL'})`;
    case 'open': return 'Gripper open';
    case 'close': return 'Gripper close';
    case 'wait': return `Wait ${s.seconds} s`;
    case 'dispense': return 'Dispense plate';
    case 'trayOut': return 'Reader tray extend';
    case 'trayIn': return 'Reader tray retract';
    case 'waitRead': return 'Wait for read';
  }
}

const trsfName = (offset: number) => (offset === 100 ? 'trAppro' : `{0,0,-${offset},0,0,0}`);

/**
 * VAL3-flavoured listing. Returns lines plus, for each step, the line index it
 * maps to (for highlighting while the program runs).
 */
export function generateVal3(steps: Step[]): { lines: string[]; stepLine: number[] } {
  const lines: string[] = ['begin', `  // ${PROGRAM_TITLE}`];
  const stepLine: number[] = [];
  const pt = (n: string) => n || 'pUndefined';
  for (const s of steps) {
    switch (s.kind) {
      case 'movej':
        stepLine.push(lines.length);
        lines.push(`  movej(${pt(s.point)}, tGripper, ${s.speed})`);
        break;
      case 'movel':
        stepLine.push(lines.length);
        lines.push(`  movel(${pt(s.point)}, tGripper, ${s.speed})`);
        break;
      case 'appro':
        stepLine.push(lines.length);
        lines.push(`  move${s.motion === 'J' ? 'j' : 'l'}(appro(${pt(s.point)}, ${trsfName(s.offset)}), tGripper, ${s.speed})`);
        break;
      case 'open':
      case 'close':
        lines.push('  waitEndMove()');
        stepLine.push(lines.length);
        lines.push(`  ${s.kind}(tGripper)`);
        break;
      case 'wait':
        lines.push('  waitEndMove()');
        stepLine.push(lines.length);
        lines.push(`  delay(${s.seconds})`);
        break;
      case 'dispense':
        stepLine.push(lines.length);
        lines.push('  call dispensePlate()');
        break;
      case 'trayOut':
        lines.push('  waitEndMove()');
        stepLine.push(lines.length);
        lines.push('  dioTrayExtend = true');
        break;
      case 'trayIn':
        lines.push('  waitEndMove()');
        stepLine.push(lines.length);
        lines.push('  dioTrayExtend = false');
        break;
      case 'waitRead':
        stepLine.push(lines.length);
        lines.push('  wait(dioReadDone == true)');
        break;
    }
  }
  lines.push('end');
  return { lines, stepLine };
}
