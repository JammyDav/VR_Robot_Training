import * as THREE from 'three';
import { Panel, setText, UI, type Button } from './kit/Panel';
import type { Controller } from '../core/Controller';
import type { PendantLogic } from '../input/PendantLogic';
import { BRAND, SIGNAL } from '../config/brand';
import { JOINT_COUNT, LIMITS_RAD, deg } from '../config/robotSpec';
import type { Text } from 'troika-three-text';

// The virtual SP2 pendant screen. Rides on the left controller in XR, docks
// in the screen corner on desktop. Purely a view + buttons over Controller.

export const PENDANT_W = 0.25;
export const PENDANT_H = 0.18;

const MODE_LABEL = { manual: 'MANUAL', test: 'MANUAL TEST', local: 'LOCAL' } as const;
const JOG_LABEL = { joint: 'Joint', frame: 'Frame', tool: 'Tool', point: 'Point' } as const;

export interface PendantActions {
  toggleTriad(): void;
  toggleMap(): void;
  triadVisible(): boolean;
  mapVisible(): boolean;
  selectedPoint(): string | null;
  contextHint(): string;
}

export class PendantPanel {
  readonly panel = new Panel(PENDANT_W, PENDANT_H, 0xfbfbfa);
  private t: Record<string, Text> = {};
  private b: Record<string, Button> = {};
  private enableRect: number;
  private contextRect: number;
  private markers: number[] = [];
  private trackX = 0.03;
  private trackW = 0.058;
  private estopPulse = 0;

  constructor(private ctl: Controller, private logic: PendantLogic, private act: PendantActions) {
    const P = this.panel;
    const W = PENDANT_W, H = PENDANT_H, pad = 0.008;

    // Header.
    P.addRect(0, 0, W, 0.019, BRAND.cbreGreen);
    P.addText({ text: 'TX2-60 · PENDANT', size: 0.0062, font: 'mono', color: 0xdfeee8, position: [pad, -0.0095, 0], anchorY: 'middle' });
    this.t.mode = P.addText({ text: '', size: 0.0078, font: 'semibold', color: 0xffffff, anchorX: 'right', anchorY: 'middle', position: [W - pad, -0.0095, 0] });

    // Jog mode + speed, large.
    P.addText({ text: 'JOG MODE', size: 0.0048, font: 'mono', color: BRAND.sage, position: [pad, -0.024, 0] });
    this.t.jog = P.addText({ text: '', size: 0.016, font: 'semibold', color: BRAND.cbreGreen, position: [pad, -0.03, 0] });
    P.addAnchor('jogMode', pad - 0.002, -0.022, 0.09, 0.028);
    P.addText({ text: 'SPEED', size: 0.0048, font: 'mono', color: BRAND.sage, position: [0.105, -0.024, 0] });
    this.t.speed = P.addText({ text: '', size: 0.016, font: 'semibold', color: BRAND.cbreGreen, position: [0.105, -0.03, 0] });
    P.addAnchor('speed', 0.103, -0.022, 0.035, 0.028);

    // Enabling device state bar.
    this.enableRect = P.addRect(pad, -0.054, 0.132, 0.011, SIGNAL.fault);
    P.anchor('enable', this.enableRect);
    this.t.enable = P.addText({ text: '', size: 0.0058, font: 'semibold', color: 0xffffff, anchorY: 'middle', position: [pad + 0.004, -0.0595, 0] });

    // Joint readouts with range bars.
    const y0 = -0.071, pitch = 0.0098;
    for (let i = 0; i < JOINT_COUNT; i++) {
      const y = y0 - i * pitch;
      P.addText({ text: `J${i + 1}`, size: 0.0058, font: 'semibold', color: UI.text, anchorY: 'middle', position: [pad, y, 0] });
      P.addRect(pad + this.trackX - pad, y + 0.0008, this.trackW, 0.0016, BRAND.lightGrey);
      this.markers.push(P.addRect(0, y + 0.003, 0.0014, 0.006, BRAND.darkGrey, 0.0006));
      this.t[`j${i}`] = P.addText({ text: '', size: 0.0058, font: 'mono', color: UI.text, anchorX: 'right', anchorY: 'middle', position: [pad + 0.132, y, 0] });
    }
    P.addAnchor('joints', pad - 0.002, y0 + 0.006, 0.136, pitch * 6 + 0.002);

    // TCP pose + selected point.
    this.t.pose = P.addText({ text: '', size: 0.0052, font: 'mono', color: UI.text, lineHeight: 1.3, position: [pad, -0.131, 0] });
    this.t.point = P.addText({ text: '', size: 0.0052, font: 'medium', color: BRAND.sage, position: [pad, -0.1465, 0] });

    // Right column: function keys.
    const bx = 0.149, bw = 0.0445, bh = 0.0155, gx = 0.004, gy = 0.0035;
    const keys: Array<[string, string, () => void]> = [
      ['mode', 'MODE', () => ctl.cycleMode()],
      ['jog', 'JOG', () => ctl.cycleJogMode()],
      ['rot', 'ROTATE', () => ctl.toggleRotation()],
      ['grip', 'GRIPPER', () => ctl.toggleGripper()],
      ['spdDown', 'SPEED −', () => ctl.stepSpeed(-1)],
      ['spdUp', 'SPEED +', () => ctl.stepSpeed(1)],
      ['tcp', 'TCP', () => act.toggleTriad()],
      ['map', 'MAP', () => act.toggleMap()],
    ];
    keys.forEach(([id, label, fn], i) => {
      const col = i % 2, row = Math.floor(i / 2);
      this.b[id] = P.addButton({
        id, label, onClick: fn, size: 0.0056,
        x: bx + col * (bw + gx), y: -0.024 - row * (bh + gy), w: bw, h: bh,
      });
    });

    // E-stop: yellow collar, red mushroom, and RESET.
    const ey = -0.103;
    this.b.estop = P.addButton({ id: 'estop', label: '', x: bx, y: ey, w: 0.042, h: 0.042, color: 0xf2c200, onClick: () => ctl.triggerEstop() });
    this.estopDisc = new THREE.Mesh(new THREE.CircleGeometry(0.0165, 40), new THREE.MeshBasicMaterial({ color: SIGNAL.estop, toneMapped: false }));
    this.estopDisc.position.set(bx + 0.021, ey - 0.021, 0.0009);
    P.add(this.estopDisc);
    P.addText({ text: 'E-STOP', size: 0.0052, font: 'semibold', color: 0xffffff, anchorX: 'center', anchorY: 'middle', position: [bx + 0.021, ey - 0.021, 0.0004] });
    this.b.reset = P.addButton({ id: 'reset', label: 'RESET', x: bx + 0.0465, y: ey, w: 0.0445, h: 0.042, size: 0.0058, onClick: () => ctl.resetEstop() });

    // Context strip.
    this.contextRect = P.addRect(0, -H + 0.022, W, 0.022, UI.surface);
    P.anchor('context', this.contextRect);
    this.t.context = P.addText({ text: '', size: 0.0055, font: 'medium', color: UI.text, maxWidth: W - 2 * pad, lineHeight: 1.25, anchorY: 'middle', position: [pad, -H + 0.011, 0] });
  }

  private estopDisc: THREE.Mesh;

  update(dt: number) {
    const ctl = this.ctl, r = ctl.robot;
    setText(this.t.mode, MODE_LABEL[ctl.mode]);
    const rotatable = ctl.jogMode === 'frame' || ctl.jogMode === 'tool';
    setText(this.t.jog, JOG_LABEL[ctl.jogMode] + (rotatable ? (ctl.rotation ? ' · R' : ' · T') : ''));
    setText(this.t.speed, `${Math.round(ctl.speedOverride * 100)}%`);

    const en = ctl.enable;
    this.panel.setColor(this.enableRect, en === 'enabled' ? SIGNAL.run : en === 'panic' ? SIGNAL.manual : 0x9aa2a3);
    setText(this.t.enable, en === 'enabled' ? 'ENABLED — motion allowed' : en === 'panic' ? 'PANIC RELEASE — let go fully' : 'DISABLED — hold enabling device');

    for (let i = 0; i < JOINT_COUNT; i++) {
      const [lo, hi] = LIMITS_RAD[i];
      const f = (r.q[i] - lo) / (hi - lo);
      const y = -0.071 - i * 0.0098;
      this.panel.setRect(this.markers[i], 0.008 + this.trackX - 0.008 + f * this.trackW - 0.0007, y + 0.003, 0.0014, 0.006);
      const sel = ctl.jogMode === 'joint' && ctl.jointAxis === i;
      const moving = Math.abs(r.qd[i]) > 1e-4;
      this.panel.setColor(this.markers[i], moving ? BRAND.cbreGreen : sel ? BRAND.cbreGreen : BRAND.darkGrey);
      setText(this.t[`j${i}`], `${sel ? '› ' : ''}${deg(r.q[i]).toFixed(1)}°`, sel ? BRAND.cbreGreen : UI.text);
    }

    const p = ctl.tcpPose();
    setText(this.t.pose, `X ${p.x.toFixed(1)}  Y ${p.y.toFixed(1)}  Z ${p.z.toFixed(1)}\nRx ${p.rx.toFixed(1)}  Ry ${p.ry.toFixed(1)}  Rz ${p.rz.toFixed(1)}`);
    const pt = this.act.selectedPoint();
    setText(this.t.point, `Point: ${pt ?? '— none taught'}`);

    // Buttons reflect state.
    this.b.rot.setEnabled(rotatable);
    this.b.rot.setActive(rotatable && ctl.rotation);
    this.b.grip.setEnabled(ctl.mode === 'manual' && !ctl.estop);
    this.b.grip.setLabel(r.gripper.isOpen ? 'CLOSE GRIP' : 'OPEN GRIP');
    this.b.spdDown.setEnabled(ctl.speedOverride > 0.011);
    this.b.spdUp.setEnabled(ctl.speedOverride < 0.999);
    this.b.tcp.setActive(this.act.triadVisible());
    this.b.map.setActive(this.act.mapVisible());
    this.b.reset.setEnabled(ctl.estop);
    this.b.reset.setLabel(ctl.estop && ctl.enable !== 'released' ? 'RELEASE\nGRIP' : 'RESET');

    // E-stop disc darkens when latched (pressed in) and pulses the RESET key.
    this.estopPulse += dt;
    (this.estopDisc.material as THREE.MeshBasicMaterial).color.setHex(ctl.estop ? 0x8e1712 : SIGNAL.estop);
    this.estopDisc.scale.setScalar(ctl.estop ? 0.9 : 1);

    // Context strip: alert > hold progress > warning > hint.
    let text = this.act.contextHint();
    let bg: number = UI.surface, fg: number = UI.text;
    const info = ctl.jogInfo;
    if (ctl.mode !== 'manual') { text = 'Jogging is only available in Manual. Press MODE to change.'; }
    else if (info.nearSingular) { text = 'Near wrist singularity — the arm slows here. Move J5 away from 0°.'; bg = 0xfbefd8; fg = 0x8a5a06; }
    else if (info.blocked.length) { text = `J${info.blocked[0] + 1} is at its limit.`; bg = 0xfbefd8; fg = 0x8a5a06; }
    else if (info.capped) { text = 'TCP speed limited to 250 mm/s (manual reduced speed).'; }
    if (this.logic.holdProgress.estop > 0) { text = `Hold B for emergency stop… ${Math.round(this.logic.holdProgress.estop * 100)}%`; bg = 0xf6d6d3; fg = 0x8a2a24; }
    if (ctl.estop) {
      text = ctl.enable === 'released' ? 'EMERGENCY STOP. Find the cause, then press RESET.' : 'EMERGENCY STOP. Release the enabling device, then press RESET.';
      bg = SIGNAL.estop; fg = 0xffffff;
    } else if (ctl.fault) { text = `FAULT: ${ctl.fault}`; bg = SIGNAL.fault; fg = 0xffffff; }
    this.panel.setColor(this.contextRect, bg);
    setText(this.t.context, text, fg);
  }
}
