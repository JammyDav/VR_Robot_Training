import { Panel, setText, UI } from './kit/Panel';
import type { Controller } from '../core/Controller';
import { BRAND } from '../config/brand';
import type { Text } from 'troika-three-text';

// Toggleable controller diagram: two stylised Touch Plus outlines with
// labelled chips for each control, reflecting the current jog mode.

export const MAP_W = 0.25;
export const MAP_H = 0.13;

type Row = [chip: string, text: string];

export function currentMapping(ctl: Controller, desktop: boolean): { left: Row[]; right: Row[] } {
  const k = (xr: string, kb: string) => (desktop ? kb : xr);
  const joint = ctl.jogMode === 'joint';
  const cart = ctl.jogMode === 'frame' || ctl.jogMode === 'tool';
  const rot = cart && ctl.rotation;
  const left: Row[] = [
    [k('GRIP', 'SPACE'), 'Enabling device — hold halfway'],
    [k('X', 'TAB'), 'Cycle jog mode'],
    [k('Y', 'Q'), 'Hold + right stick up/down: speed'],
    [k('STICK', 'WASD'), joint ? 'Up/down: select axis' : cart ? (rot ? 'Left/right Rx · up/down Ry' : 'Up/down X · left/right Y') : '—'],
  ];
  const right: Row[] = [
    [k('STICK', 'ARROWS'), joint ? 'Left/right: Move− / Move+' : cart ? (rot ? 'Left/right: Rz' : 'Up/down: Z') : '—'],
    [k('A', 'ENTER'), ctl.jogMode === 'point' ? 'Hold: move to point' : 'Record point'],
    [k('B', 'B'), cart ? 'Tap: translate / rotate · Hold 1 s: E-stop' : 'Hold 1 s: emergency stop'],
    [k('TRIGGER', 'CLICK'), 'Select · point at gripper to open/close'],
  ];
  return { left, right };
}

export class ControllerMap {
  readonly panel = new Panel(MAP_W, MAP_H, 0xfbfbfa);
  private rows: Array<{ chip: Text; text: Text }> = [];
  private title: Text;

  constructor(private ctl: Controller, private desktop: () => boolean) {
    const P = this.panel;
    const pad = 0.007;
    P.addRect(0, 0, MAP_W, 0.016, BRAND.cbreGreen);
    this.title = P.addText({ text: 'Controller map', size: 0.0068, font: 'semibold', color: 0xffffff, anchorY: 'middle', position: [pad, -0.008, 0] });
    const colW = (MAP_W - 3 * pad) / 2;
    (['left', 'right'] as const).forEach((side, c) => {
      const x0 = pad + c * (colW + pad);
      // Stylised controller body: a rounded "ring" suggested by two rects.
      P.addRect(x0, -0.021, colW, 0.104, UI.surface);
      P.addText({ text: side === 'left' ? 'LEFT · PENDANT' : 'RIGHT · POINTER', size: 0.0048, font: 'mono', color: BRAND.sage, position: [x0 + 0.004, -0.025, 0] });
      for (let i = 0; i < 4; i++) {
        const y = -0.037 - i * 0.0215;
        // Chips sit on the column panel: lift them a layer so they never z-fight in the headset.
        P.addRect(x0 + 0.004, y + 0.0055, 0.03, 0.011, side === 'left' ? BRAND.cbreGreen : BRAND.midnight, 0.0008);
        const chip = P.addText({ text: '', size: 0.0046, font: 'semibold', color: 0xffffff, anchorX: 'center', anchorY: 'middle', position: [x0 + 0.019, y, 0] });
        const text = P.addText({ text: '', size: 0.0052, font: 'body', color: UI.text, maxWidth: colW - 0.04, lineHeight: 1.2, anchorY: 'middle', position: [x0 + 0.037, y, 0] });
        this.rows.push({ chip, text });
      }
    });
  }

  update() {
    const m = currentMapping(this.ctl, this.desktop());
    const all = [...m.left, ...m.right];
    all.forEach(([chip, text], i) => {
      setText(this.rows[i].chip, chip);
      setText(this.rows[i].text, text);
    });
    setText(this.title, `Controller map · ${this.ctl.jogMode[0].toUpperCase()}${this.ctl.jogMode.slice(1)} jog`);
  }
}
