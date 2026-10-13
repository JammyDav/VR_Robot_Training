import { Panel, setText, UI, type Button } from './kit/Panel';
import type { Controller } from '../core/Controller';
import { SUGGESTED_NAMES } from '../core/program/points';
import {
  STEP_PALETTE, APPRO_OFFSETS, WAIT_SECONDS, PROGRAM_TITLE, stepLabel, generateVal3, type Step,
} from '../core/program/program';
import { BRAND, SIGNAL } from '../config/brand';
import type { Text } from 'troika-three-text';
import type { PlateVariant } from '../core/cell/Cell';

// Wall-mounted program board (1.8 × 1.2 m). Three columns: taught points,
// the visual sequence (cards + editor + palette + transport), and the
// VAL3-flavoured code generated from the sequence. Sized for ray use at ~3 m.

export const BOARD_W = 1.8;
export const BOARD_H = 1.2;
const POINT_ROWS = 8;
const CARD_ROWS = 10;
const CODE_LINE = 0.0175 * 1.35;

const COL_P = 0.03, W_P = 0.5;
const COL_S = 0.565, W_S = 0.6;
const COL_C = 1.2, W_C = 0.57;

const VARIANT_LABEL: Record<PlateVariant, string> = { clear: 'Plate: clear', white: 'Plate: white', black: 'Plate: black' };
const NEXT_VARIANT: Record<PlateVariant, PlateVariant> = { clear: 'white', white: 'black', black: 'clear' };

export interface BoardActions {
  exportCell(): void;
  importCell(): void;
}

export class ProgramBoard {
  readonly panel = new Panel(BOARD_W, BOARD_H, 0xfbfbfa, 280);
  private ctl: Controller;
  private t: Record<string, Text> = {};
  private b: Record<string, Button> = {};
  private pointRows: Array<{ row: Button; name: Text; pose: Text; rename: Button; reteach: Button; del: Button }> = [];
  private renameChips: Button[] = [];
  private cards: Array<{ btn: Button; num: Text; label: Text }> = [];
  private palette: Button[] = [];
  private chooser: Button[] = [];
  private codeText: Text;
  private codeHighlight: number;
  private selStep: number | null = null;
  private renaming: number | null = null;
  private choosingFor: number | null = null;
  private scroll = 0;
  private dirty = true;

  constructor(ctl: Controller, private actions: BoardActions) {
    this.ctl = ctl;
    const P = this.panel;

    // Header.
    P.addRect(0, 0, BOARD_W, 0.085, BRAND.cbreGreen);
    P.addText({ text: `Program · ${PROGRAM_TITLE}`, size: 0.034, font: 'semibold', color: 0xffffff, anchorY: 'middle', position: [COL_P, -0.0425, 0] });
    this.t.valid = P.addText({ text: '', size: 0.022, font: 'semibold', color: 0xffffff, anchorX: 'right', anchorY: 'middle', position: [BOARD_W - COL_P, -0.0425, 0] });

    // ---- Points column -------------------------------------------------------------
    P.addText({ text: 'TAUGHT POINTS', size: 0.017, font: 'mono', color: BRAND.sage, position: [COL_P, -0.105, 0] });
    this.t.pointHint = P.addText({ text: '', size: 0.0145, font: 'body', color: UI.text, anchorX: 'right', position: [COL_P + W_P, -0.106, 0] });
    for (let i = 0; i < POINT_ROWS; i++) {
      const y = -0.135 - i * 0.062;
      const row = P.addButton({ label: '', x: COL_P, y, w: 0.235, h: 0.054, onClick: () => { ctl.points.selected = i; this.dirty = true; } });
      const name = P.addText({ text: '', size: 0.022, font: 'semibold', color: UI.text, position: [COL_P + 0.012, y - 0.008, 0] });
      const pose = P.addText({ text: '', size: 0.0118, font: 'mono', color: BRAND.darkGrey, position: [COL_P + 0.012, y - 0.034, 0] });
      const rename = P.addButton({ label: 'Rename', x: COL_P + 0.243, y, w: 0.082, h: 0.054, size: 0.016, onClick: () => { this.renaming = i; this.dirty = true; } });
      const reteach = P.addButton({ label: 'Re-teach', x: COL_P + 0.331, y, w: 0.095, h: 0.054, size: 0.016, onClick: () => this.reteach(i) });
      const del = P.addButton({ label: '×', x: COL_P + 0.432, y, w: 0.068, h: 0.054, size: 0.03, onClick: () => { ctl.points.remove(i); this.renaming = null; } });
      this.pointRows.push({ row, name, pose, rename, reteach, del });
    }
    const yb = -0.645;
    this.b.record = P.addButton({ id: 'boardRecord', label: 'Record point', x: COL_P, y: yb, w: 0.165, h: 0.05, size: 0.017, onClick: () => ctl.recordPoint() });
    this.b.export = P.addButton({ id: 'boardExport', label: 'Export', x: COL_P + 0.172, y: yb, w: 0.16, h: 0.05, size: 0.017, onClick: () => this.actions.exportCell() });
    this.b.import = P.addButton({ id: 'boardImport', label: 'Import', x: COL_P + 0.339, y: yb, w: 0.161, h: 0.05, size: 0.017, onClick: () => this.actions.importCell() });
    // Rename chooser.
    this.t.renameTitle = P.addText({ text: '', size: 0.017, font: 'semibold', color: BRAND.cbreGreen, position: [COL_P, -0.715, 0] });
    SUGGESTED_NAMES.forEach((n, k) => {
      const col = k % 3, row = Math.floor(k / 3);
      this.renameChips.push(P.addButton({
        label: n, x: COL_P + col * 0.169, y: -0.745 - row * 0.058, w: 0.162, h: 0.05, size: 0.0155,
        onClick: () => { if (this.renaming !== null) ctl.points.rename(this.renaming, n); this.renaming = null; this.dirty = true; },
      }));
    });
    this.b.renameCancel = P.addButton({ label: 'Cancel', x: COL_P, y: -0.865, w: 0.162, h: 0.045, size: 0.015, onClick: () => { this.renaming = null; this.dirty = true; } });
    // Cell controls.
    this.b.variant = P.addButton({ label: '', x: COL_P, y: -1.1, w: 0.245, h: 0.055, size: 0.017, onClick: () => { ctl.cell.variant = NEXT_VARIANT[ctl.cell.variant]; } });
    this.b.resetCell = P.addButton({ id: 'resetCell', label: 'Reset cell', x: COL_P + 0.255, y: -1.1, w: 0.245, h: 0.055, size: 0.017, onClick: () => { if (!ctl.runner.active) ctl.cell.reset(); } });
    P.addText({ text: 'Reset cell clears all plates and retracts the reader tray.', size: 0.0125, font: 'body', color: BRAND.darkGrey, position: [COL_P, -1.165, 0] });

    // ---- Sequence column ---------------------------------------------------------------
    P.addText({ text: 'SEQUENCE', size: 0.017, font: 'mono', color: BRAND.sage, position: [COL_S, -0.105, 0] });
    this.b.scrollUp = P.addButton({ label: '↑', x: COL_S + W_S - 0.11, y: -0.098, w: 0.05, h: 0.03, size: 0.02, onClick: () => { this.scroll = Math.max(0, this.scroll - 5); this.dirty = true; } });
    this.b.scrollDn = P.addButton({ label: '↓', x: COL_S + W_S - 0.055, y: -0.098, w: 0.05, h: 0.03, size: 0.02, onClick: () => { this.scroll += 5; this.dirty = true; } });
    for (let i = 0; i < CARD_ROWS; i++) {
      const y = -0.135 - i * 0.051;
      const btn = P.addButton({ label: '', x: COL_S, y, w: W_S, h: 0.045, onClick: () => this.selectCard(i) });
      const num = P.addText({ text: '', size: 0.014, font: 'mono', color: BRAND.sage, anchorY: 'middle', position: [COL_S + 0.012, y - 0.0225, 0] });
      const label = P.addText({ text: '', size: 0.019, font: 'medium', color: UI.text, anchorY: 'middle', position: [COL_S + 0.052, y - 0.0225, 0] });
      this.cards.push({ btn, num, label });
    }
    P.anchor('sequence', this.cards[0].btn.rect);
    // Editor strip for the selected card.
    const ye = -0.655;
    this.b.ePoint = P.addButton({ label: '', x: COL_S, y: ye, w: 0.2, h: 0.048, size: 0.016, onClick: () => { this.choosingFor = this.selStep; this.dirty = true; } });
    this.b.eOffset = P.addButton({ label: '', x: COL_S + 0.206, y: ye, w: 0.12, h: 0.048, size: 0.016, onClick: () => this.cycleParam('offset') });
    this.b.eMotion = P.addButton({ label: '', x: COL_S + 0.332, y: ye, w: 0.11, h: 0.048, size: 0.016, onClick: () => this.cycleParam('motion') });
    this.b.eSpeed = P.addButton({ label: '', x: COL_S + 0.448, y: ye, w: 0.152, h: 0.048, size: 0.016, onClick: () => this.cycleParam('speed') });
    const ye2 = ye - 0.055;
    this.b.eUp = P.addButton({ label: 'Move up', x: COL_S, y: ye2, w: 0.14, h: 0.045, size: 0.015, onClick: () => this.moveSel(-1) });
    this.b.eDn = P.addButton({ label: 'Move down', x: COL_S + 0.146, y: ye2, w: 0.14, h: 0.045, size: 0.015, onClick: () => this.moveSel(1) });
    this.b.eDel = P.addButton({ label: 'Delete step', x: COL_S + 0.292, y: ye2, w: 0.14, h: 0.045, size: 0.015, onClick: () => this.deleteSel() });
    this.b.eClear = P.addButton({ label: 'Clear all', x: COL_S + 0.46, y: ye2, w: 0.14, h: 0.045, size: 0.015, onClick: () => { if (!ctl.runner.active) { ctl.program.clear(); this.selStep = null; } } });
    // Palette (or point chooser in the same space).
    this.t.paletteTitle = P.addText({ text: '', size: 0.0155, font: 'mono', color: BRAND.sage, position: [COL_S, -0.775, 0] });
    STEP_PALETTE.forEach((s, k) => {
      const col = k % 5, row = Math.floor(k / 5);
      this.palette.push(P.addButton({
        id: `add:${s.kind}`, label: s.label, x: COL_S + col * 0.1215, y: -0.8 - row * 0.055, w: 0.115, h: 0.049, size: 0.0138,
        onClick: () => this.addStep(s.kind),
      }));
    });
    for (let k = 0; k < 10; k++) {
      const col = k % 5, row = Math.floor(k / 5);
      this.chooser.push(P.addButton({
        label: '', x: COL_S + col * 0.1215, y: -0.8 - row * 0.055, w: 0.115, h: 0.049, size: 0.0135,
        onClick: () => this.choosePoint(k),
      }));
    }
    P.anchor('palette', this.palette[0].rect);
    // Transport.
    const yt = -0.93;
    const tw = 0.143;
    this.b.run = P.addButton({ id: 'run', label: 'RUN', x: COL_S, y: yt, w: tw, h: 0.06, size: 0.022, color: 0xd9eee3, onClick: () => ctl.runProgram() });
    this.b.pause = P.addButton({ id: 'pause', label: 'PAUSE', x: COL_S + (tw + 0.009), y: yt, w: tw, h: 0.06, size: 0.022, onClick: () => ctl.pauseProgram() });
    this.b.step = P.addButton({ id: 'step', label: 'STEP', x: COL_S + 2 * (tw + 0.009), y: yt, w: tw, h: 0.06, size: 0.022, onClick: () => ctl.stepProgram() });
    this.b.abort = P.addButton({ id: 'abort', label: 'ABORT', x: COL_S + 3 * (tw + 0.009), y: yt, w: tw, h: 0.06, size: 0.022, color: 0xf3dcda, onClick: () => ctl.abortProgram() });
    this.t.status = P.addText({ text: '', size: 0.0165, font: 'medium', color: UI.text, maxWidth: W_S, lineHeight: 1.3, position: [COL_S, -1.005, 0] });

    // ---- Code column -------------------------------------------------------------------
    P.addText({ text: 'VAL3-STYLE VIEW', size: 0.017, font: 'mono', color: BRAND.sage, position: [COL_C, -0.105, 0] });
    P.addRect(COL_C - 0.012, -0.128, W_C + 0.012, 0.93, 0xf3f5f4, 0.0002);
    this.codeHighlight = P.addRect(COL_C - 0.012, -0.14, W_C + 0.012, CODE_LINE, 0xc9ecd9, 0.0005);
    this.codeText = P.addText({ text: '', size: 0.0175, font: 'mono', color: BRAND.darkGrey, lineHeight: 1.35, position: [COL_C, -0.14, 0] });
    P.addText({
      text: 'VAL3-flavoured listing, generated from the sequence for teaching. It is not parsed or compiled and is not real VAL3: do not load it on a controller.',
      size: 0.0128, font: 'body', color: BRAND.darkGrey, maxWidth: W_C, lineHeight: 1.3, position: [COL_C, -1.085, 0],
    });

    const mark = () => { this.dirty = true; };
    ctl.program.events.on('changed', mark);
    ctl.points.events.on('changed', mark);
    ctl.points.events.on('recorded', mark);
    ctl.runner.events.on('step', mark);
    ctl.runner.events.on('state', mark);
    ctl.events.on('validated', mark);
    ctl.events.on('mode', mark);
  }

  // --- actions -------------------------------------------------------------------
  private reteach(i: number) {
    if (this.ctl.mode !== 'manual') { this.ctl.events.emit('denied', { reason: 'Re-teach points in Manual mode.' }); return; }
    this.ctl.points.reteach(i, this.ctl.robot.q);
  }
  private visibleSteps() { return this.ctl.program.steps.slice(this.scroll, this.scroll + CARD_ROWS); }
  private selectCard(i: number) {
    const st = this.visibleSteps()[i];
    this.selStep = st ? (this.selStep === st.id ? null : st.id) : null;
    this.choosingFor = null;
    this.dirty = true;
  }
  private get sel(): Step | null { return this.ctl.program.steps.find((s) => s.id === this.selStep) ?? null; }
  private addStep(kind: Step['kind']) {
    if (this.ctl.runner.active) return;
    const prog = this.ctl.program;
    const at = this.sel ? prog.steps.indexOf(this.sel) + 1 : prog.steps.length;
    const def = this.ctl.points.current?.name ?? '';
    const st = prog.add(kind, def, at);
    this.selStep = st.id;
    const idx = prog.steps.indexOf(st);
    if (idx >= this.scroll + CARD_ROWS) this.scroll = idx - CARD_ROWS + 1;
  }
  private moveSel(dir: -1 | 1) { if (this.sel && !this.ctl.runner.active) this.ctl.program.move(this.sel.id, dir); }
  private deleteSel() {
    if (!this.sel || this.ctl.runner.active) return;
    this.ctl.program.remove(this.sel.id);
    this.selStep = null;
  }
  private cycleParam(what: 'offset' | 'motion' | 'speed') {
    const s = this.sel;
    if (!s || this.ctl.runner.active) return;
    const prog = this.ctl.program;
    if (what === 'offset' && s.kind === 'appro') prog.update(s.id, { offset: APPRO_OFFSETS[(APPRO_OFFSETS.indexOf(s.offset as never) + 1) % APPRO_OFFSETS.length] });
    else if (what === 'offset' && s.kind === 'wait') prog.update(s.id, { seconds: WAIT_SECONDS[(WAIT_SECONDS.indexOf(s.seconds as never) + 1) % WAIT_SECONDS.length] });
    else if (what === 'motion' && s.kind === 'appro') prog.update(s.id, { motion: s.motion === 'J' ? 'L' : 'J' });
    else if (what === 'speed' && 'speed' in s) prog.update(s.id, { speed: s.speed === 'mNomSpeed' ? 'mSlow' : 'mNomSpeed' });
  }
  private choosePoint(k: number) {
    const pt = this.ctl.points.points[k];
    if (pt && this.choosingFor !== null) this.ctl.program.update(this.choosingFor, { point: pt.name } as Partial<Step>);
    this.choosingFor = null;
    this.dirty = true;
  }

  // --- view -------------------------------------------------------------------------
  update() {
    const ctl = this.ctl;
    const running = ctl.runner.active;
    // Transport + status refresh every call (cheap); lists only when dirty.
    const st = ctl.runner.state;
    this.b.run.setLabel(st === 'paused' ? 'RESUME' : 'RUN');
    this.b.run.setEnabled(ctl.mode !== 'manual' && !ctl.estop && !ctl.fault && st !== 'running');
    this.b.pause.setEnabled(st === 'running');
    this.b.step.setEnabled(ctl.mode !== 'manual' && !ctl.estop && !ctl.fault && st !== 'running');
    this.b.abort.setEnabled(running);
    this.b.variant.setLabel(VARIANT_LABEL[ctl.cell.variant]);
    this.b.resetCell.setEnabled(!running);
    this.b.record.setEnabled(ctl.mode === 'manual');
    setText(this.t.status, this.statusLine(), ctl.fault ? SIGNAL.fault : UI.text);
    setText(this.t.valid, ctl.validated ? 'Validated in Manual test  ✓' : 'Not yet validated in Manual test');
    if (!this.dirty) return;
    this.dirty = false;

    // Points.
    const pts = ctl.points.points;
    setText(this.t.pointHint, pts.length ? `${pts.length} taught · A records, or Record point` : 'Jog, then press A (or Record point) to teach');
    this.pointRows.forEach((r, i) => {
      const p = pts[i];
      const show = !!p;
      [r.row, r.rename, r.reteach, r.del].forEach((b) => b.setVisible(show));
      r.row.setActive(show && ctl.points.selected === i);
      setText(r.name, p ? p.name : '', ctl.points.selected === i ? 0xffffff : UI.text);
      setText(r.pose, p ? `X ${p.pose.x.toFixed(1)}  Y ${p.pose.y.toFixed(1)}  Z ${p.pose.z.toFixed(1)}` : '', ctl.points.selected === i ? 0xdfeee8 : BRAND.darkGrey);
    });
    const ren = this.renaming !== null && pts[this.renaming];
    setText(this.t.renameTitle, ren ? `Rename ${pts[this.renaming!].name} to:` : '');
    this.renameChips.forEach((b) => b.setVisible(!!ren));
    this.b.renameCancel.setVisible(!!ren);

    // Sequence cards.
    const steps = ctl.program.steps;
    this.scroll = Math.max(0, Math.min(this.scroll, Math.max(0, steps.length - CARD_ROWS)));
    if (running && (ctl.runner.index < this.scroll || ctl.runner.index >= this.scroll + CARD_ROWS)) {
      this.scroll = Math.max(0, Math.min(ctl.runner.index - 2, steps.length - CARD_ROWS));
    }
    const vis = this.visibleSteps();
    this.cards.forEach((c, i) => {
      const s = vis[i];
      c.btn.setVisible(!!s || (i === 0 && !steps.length));
      const idx = this.scroll + i;
      const current = running && idx === ctl.runner.index;
      c.btn.setActive(!!s && s.id === this.selStep);
      c.btn.setBaseColor(current ? 0xc9ecd9 : UI.button);
      const onDark = !!s && s.id === this.selStep;
      setText(c.num, s ? String(idx + 1).padStart(2, '0') : '', onDark ? 0xdfeee8 : BRAND.sage);
      setText(c.label, s ? stepLabel(s) : (i === 0 ? 'Empty program: add steps from the palette below' : ''), onDark ? 0xffffff : UI.text);
    });
    this.b.scrollUp.setVisible(steps.length > CARD_ROWS);
    this.b.scrollDn.setVisible(steps.length > CARD_ROWS);

    // Editor strip.
    const s = this.sel;
    const hasPoint = !!s && 'point' in s;
    this.b.ePoint.setVisible(hasPoint);
    if (hasPoint) this.b.ePoint.setLabel(`Point: ${(s as { point: string }).point || '— choose'}`);
    const offsetish = !!s && (s.kind === 'appro' || s.kind === 'wait');
    this.b.eOffset.setVisible(offsetish);
    if (s?.kind === 'appro') this.b.eOffset.setLabel(`${s.offset} mm`);
    if (s?.kind === 'wait') this.b.eOffset.setLabel(`${s.seconds} s`);
    this.b.eMotion.setVisible(s?.kind === 'appro');
    if (s?.kind === 'appro') this.b.eMotion.setLabel(s.motion === 'J' ? 'MoveJ' : 'MoveL');
    this.b.eSpeed.setVisible(!!s && 'speed' in s);
    if (s && 'speed' in s) this.b.eSpeed.setLabel(s.speed);
    [this.b.eUp, this.b.eDn, this.b.eDel].forEach((b) => b.setVisible(!!s));

    // Palette or point chooser.
    const choosing = this.choosingFor !== null;
    setText(this.t.paletteTitle, choosing ? 'CHOOSE A TAUGHT POINT' : (s ? 'ADD STEP AFTER THE SELECTED ONE' : 'ADD STEP AT THE END'));
    this.palette.forEach((b) => { b.setVisible(!choosing); b.setEnabled(!running); });
    this.chooser.forEach((b, k) => {
      const p = pts[k];
      b.setVisible(choosing && !!p);
      if (p) b.setLabel(p.name);
    });

    // Code.
    const { lines, stepLine } = generateVal3(steps);
    const maxLines = 37;
    const curLine = running ? stepLine[ctl.runner.index] ?? -1 : -1;
    const first = curLine > maxLines - 4 ? curLine - (maxLines - 4) : 0;
    setText(this.codeText, lines.slice(first, first + maxLines).join('\n'));
    this.panel.setRectVisible(this.codeHighlight, curLine >= 0);
    if (curLine >= 0) this.panel.setRect(this.codeHighlight, COL_C - 0.012, -0.14 - (curLine - first) * CODE_LINE + 0.002, W_C + 0.012, CODE_LINE);
  }

  private statusLine() {
    const c = this.ctl;
    const r = c.runner;
    if (c.estop) return 'EMERGENCY STOP. Release the enabling device and press RESET on the pendant.';
    if (c.fault) return `FAULT: ${c.fault}`;
    const n = c.program.steps.length;
    const where = n ? `step ${Math.min(r.index + 1, n)} of ${n}` : 'no steps';
    switch (r.state) {
      case 'running': {
        if (c.mode === 'test' && c.enable !== 'enabled') return `Running ${where}. Holding: press the enabling device to continue.`;
        if (c.mode === 'local' && !c.validated && c.enable !== 'enabled') return `Running ${where}. Not validated, so the enabling device is required.`;
        return `Running ${where} at ${Math.round(c.speedOverride * 100)}% (${c.mode === 'local' ? 'Local' : 'Manual test, ≤250 mm/s'}).`;
      }
      case 'paused': return `Paused at ${where}. RESUME, STEP or ABORT.`;
      case 'done': return `Finished all ${n} steps.${c.validated ? ' Program validated.' : ''}`;
      case 'aborted': return `Aborted at ${where}.`;
      case 'faulted': return `Stopped by a fault at ${where}.`;
      default:
        if (c.mode === 'manual') return 'Manual: teach points and build the sequence. Switch to Manual test (MODE) to run with the enabling device.';
        if (c.mode === 'test') return 'Manual test: hold the enabling device and press RUN. A clean run validates the program.';
        return c.validated ? 'Local: validated program, runs without the enabling device.' : 'Local: not validated, the enabling device is required to run.';
    }
  }
}
