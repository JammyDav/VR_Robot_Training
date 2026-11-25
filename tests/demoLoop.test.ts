import { describe, it, expect } from 'vitest';
import { Controller } from '../src/core/Controller';
import { DemoLoop } from '../src/core/cell/demo';

const DT = 1 / 90;

describe('demo loop (?demo=loop)', () => {
  it('shuttles the plate dispenser → reader → dispenser repeatedly with no enabling device and no faults', () => {
    const c = new Controller();
    const loop = new DemoLoop(c, 1);
    let cycles = 0;
    let reads = 0;
    c.runner.events.on('finished', (e) => { if (e.ok) cycles++; });
    c.cell.events.on('readDone', () => reads++);
    const faults: string[] = [];
    c.events.on('fault', (e) => { if (e.message) faults.push(e.message); });
    for (let t = 0; t < 400 && cycles < 4; t += DT) {
      c.setEnableLevel(0); // nobody holding the deadman
      c.update(DT);
      loop.update(DT);
      if (cycles > 0 && !c.runner.active) {
        // Between cycles the plate is back, seated in the dispenser nest.
        expect(c.cell.plates.length).toBe(1);
        expect(c.cell.plates[0].owner).toBe('dispenser');
      }
    }
    expect(faults).toEqual([]);
    expect(cycles).toBe(4);
    expect(reads).toBe(4);
    expect(c.cell.plates.length).toBe(1); // the same plate, not a pile of new ones
    expect(c.mode).toBe('local');
  });

  it('recovers on its own after a fault', () => {
    const c = new Controller();
    const loop = new DemoLoop(c, 1);
    for (let i = 0; i < 90; i++) { c.update(DT); loop.update(DT); }
    c.setFault('Test fault');
    let finished = 0;
    c.runner.events.on('finished', (e) => { if (e.ok) finished++; });
    for (let t = 0; t < 200 && !finished; t += DT) { c.setEnableLevel(0); c.update(DT); loop.update(DT); }
    expect(c.fault).toBeNull();
    expect(finished).toBe(1);
  });

  it('stops looping when the operator presses ABORT', () => {
    const c = new Controller();
    const loop = new DemoLoop(c, 1);
    for (let i = 0; i < 200; i++) { c.update(DT); loop.update(DT); }
    c.abortProgram();
    for (let i = 0; i < 400; i++) { c.update(DT); loop.update(DT); }
    expect(c.runner.active).toBe(false);
    expect(c.demoLoop).toBe(false);
  });
});
