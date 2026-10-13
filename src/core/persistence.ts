import type { Controller } from './Controller';
import type { Step } from './program/program';
import type { TaughtPoint } from './program/points';
import { Emitter } from './events';

// Points and the program persist in localStorage, and export / import as JSON.

const KEY = 'tx260.cell.v1';
export const FORMAT = 'scientific-solutions.tx2-60-trainer';

export interface CellFile {
  format: typeof FORMAT;
  version: 1;
  exportedAt: string;
  points: TaughtPoint[];
  program: Array<Omit<Step, 'id'>>;
}

export const persistenceEvents = new Emitter<{ exported: { bytes: number }; imported: { points: number; steps: number } }>();

function snapshot(ctl: Controller): CellFile {
  return {
    format: FORMAT,
    version: 1,
    exportedAt: new Date().toISOString(),
    points: ctl.points.points,
    program: ctl.program.toJSON(),
  };
}

function apply(ctl: Controller, data: Partial<CellFile>) {
  if (Array.isArray(data.points)) ctl.points.load(data.points);
  if (Array.isArray(data.program)) ctl.program.load(data.program as Step[]);
}

/** Load saved state, then save on every change. */
export function bindPersistence(ctl: Controller) {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) apply(ctl, JSON.parse(raw));
  } catch { /* no storage or bad data: start empty */ }
  let pending = 0;
  const save = () => {
    clearTimeout(pending);
    pending = window.setTimeout(() => {
      try { localStorage.setItem(KEY, JSON.stringify(snapshot(ctl))); } catch { /* storage full / unavailable */ }
    }, 200);
  };
  ctl.points.events.on('changed', save);
  ctl.program.events.on('changed', save);
}

/** Download points + program as JSON. */
export function exportCell(ctl: Controller) {
  const text = JSON.stringify(snapshot(ctl), null, 2);
  const blob = new Blob([text], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `tx2-60-program-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  persistenceEvents.emit('exported', { bytes: text.length });
}

/** Pick a JSON file and load it. */
export function importCell(ctl: Controller): Promise<boolean> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.onchange = async () => {
      const f = input.files?.[0];
      if (!f) return resolve(false);
      try {
        const data = JSON.parse(await f.text()) as Partial<CellFile>;
        if (data.format !== FORMAT) throw new Error('not a trainer file');
        apply(ctl, data);
        persistenceEvents.emit('imported', { points: data.points?.length ?? 0, steps: data.program?.length ?? 0 });
        resolve(true);
      } catch {
        ctl.events.emit('denied', { reason: 'That file is not a TX2-60 trainer export.' });
        resolve(false);
      }
    };
    input.click();
  });
}
