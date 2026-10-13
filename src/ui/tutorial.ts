import * as THREE from 'three';
import { Panel, setText, UI, type Button } from './kit/Panel';
import type { Controller } from '../core/Controller';
import type { XRRig } from '../xr/xrSession';
import { BRAND } from '../config/brand';
import type { Text } from 'troika-three-text';

// Guided tutorial. Each step waits for the learner to actually do the thing
// (never a timer), shows a callout with a leader line to the relevant control,
// and pulses that control. Copy uses real pendant vocabulary with a plain
// gloss the first time each term appears.

type ControllerAnchor = { kind: 'controller'; hand: 'left' | 'right'; component: string };
type PanelAnchor = { kind: 'panel'; panel: Panel; id: string };
type Anchor = ControllerAnchor | PanelAnchor | null;

interface StepCtx {
  ctl: Controller;
  /** Event flags seen since the step began. */
  seen: Set<string>;
  /** Accumulated joint travel (rad) while enabled, since the step began. */
  jointTravel: number;
}

export interface Step {
  id: string;
  title: string;
  /** Two-to-four word cue shown at the controller in VR (full text is on the whiteboard). */
  cue: string;
  xr: string;
  desktop: string;
  anchor: (desktop: boolean) => Anchor;
  done: (c: StepCtx) => boolean;
  available?: () => boolean;
}

const STORE_KEY = 'tx260.tutorial.v1';

// Approximate touch-point offsets in grip space (used until the controller model loads).
const FALLBACK: Record<string, [number, number, number]> = {
  'left:xr-standard-squeeze': [0.012, -0.01, 0.03],
  'left:x-button': [0.004, 0.006, -0.002],
  'left:y-button': [-0.006, 0.008, 0.006],
  'left:xr-standard-thumbstick': [0.012, 0.012, 0.012],
  'right:xr-standard-thumbstick': [-0.012, 0.012, 0.012],
  'right:xr-standard-trigger': [0.0, -0.01, -0.04],
  'right:a-button': [-0.004, 0.006, -0.002],
  'right:b-button': [0.006, 0.008, 0.006],
};

export interface TutorialDeps {
  ctl: Controller;
  xr: XRRig;
  pendant: Panel;
  camera: THREE.Camera;
  scene: THREE.Scene;
  isDesktop: () => boolean;
  /** Where the desktop callout docks (child of the camera), and its position there. */
  desktopDock: THREE.Object3D;
  desktopCalloutPos: THREE.Vector3;
  /** VR: the full callout lives on the whiteboard, out of the line of sight. */
  boardMount: THREE.Object3D;
  boardPos: THREE.Vector3;
  boardScale: number;
}

export function defaultSteps(p: Panel): Step[] {
  const pa = (id: string): PanelAnchor => ({ kind: 'panel', panel: p, id });
  const ca = (hand: 'left' | 'right', component: string): ControllerAnchor => ({ kind: 'controller', hand, component });
  return [
    {
      id: 'enable', title: 'Hold the enabling device', cue: 'Hold grip halfway',
      xr: 'Squeeze the left grip halfway and keep holding it. This is the enabling device (the "deadman" switch): the arm can only move while it is held in the middle. Let go, or squeeze hard, and motion stops.',
      desktop: 'Hold Space. This is the enabling device (the "deadman" switch): the arm can only move while it is held. Releasing it stops all motion. Shift+Space simulates squeezing it too hard, which also stops the arm.',
      anchor: (d) => (d ? pa('enable') : ca('left', 'xr-standard-squeeze')),
      done: (c) => c.ctl.enable === 'enabled',
    },
    {
      id: 'jogMode', title: 'Cycle the jog mode', cue: 'Press X',
      xr: 'Press X to change the jog mode, which sets how the sticks move the arm. Joint turns one axis at a time. Frame moves the TCP (tool centre point, the spot between the fingertips) along the room axes. Tool moves it along the gripper\'s own axes.',
      desktop: 'Press Tab to change the jog mode, which sets how the keys move the arm. Joint turns one axis at a time. Frame moves the TCP (tool centre point, the spot between the fingertips) along the room axes. Tool moves it along the gripper\'s own axes.',
      anchor: (d) => (d ? pa('jogMode') : ca('left', 'x-button')),
      done: (c) => c.seen.has('jogMode'),
    },
    {
      id: 'jog', title: 'Jog an axis', cue: 'Push left / right',
      xr: 'Press X until the panel reads Joint. Hold the enabling device and push the right stick sideways: that is Move+ / Move−, turning the selected axis. Flick the left stick up or down to pick a different axis. Move any axis a few degrees.',
      desktop: 'Press Tab until the panel reads Joint. Hold Space and press the Left or Right arrow: that is Move− / Move+, turning the selected axis. W and S pick a different axis. Move any axis a few degrees.',
      anchor: (d) => (d ? pa('joints') : ca('right', 'xr-standard-thumbstick')),
      done: (c) => c.jointTravel > (3 * Math.PI) / 180,
    },
    {
      id: 'speed', title: 'Change the speed override', cue: 'Hold Y + right stick',
      xr: 'Hold Y and flick the right stick up or down. The speed override is a percentage of the manual reduced speed (never more than 250 mm/s at the TCP). Work slowly when you are close to anything.',
      desktop: 'Hold Q and press ↑ or ↓. The speed override is a percentage of the manual reduced speed (never more than 250 mm/s at the TCP). Work slowly when you are close to anything.',
      anchor: (d) => (d ? pa('speed') : ca('left', 'y-button')),
      done: (c) => c.seen.has('speed'),
    },
    {
      id: 'gripper', title: 'Close and open the gripper', cue: 'Aim at gripper, pull',
      xr: 'Point the right controller at the gripper. When it glows, pull the trigger to close it. Pull again to open it.',
      desktop: 'Click the gripper on the robot (or press GRIPPER on the panel, or G) to close it. Do it again to open it.',
      anchor: (d) => (d ? pa('grip') : ca('right', 'xr-standard-trigger')),
      done: (c) => c.seen.has('gripper:closed') && c.seen.has('gripper:open'),
    },
    {
      id: 'estop', title: 'Emergency stop and reset', cue: 'Hold B for 1 s',
      xr: 'Hold B for one second, or press the red E-STOP on the panel. Everything halts and the beacon flashes red. To recover: release the enabling device, then press RESET on the panel.',
      desktop: 'Hold B for one second, or press Esc or the red E-STOP on the panel. Everything halts and the beacon flashes red. To recover: release Space, then press RESET (or R).',
      anchor: (d) => (d ? pa('estop') : ca('right', 'b-button')),
      done: (c) => c.seen.has('estop:on') && c.seen.has('estop:off'),
    },
  ];
}

export class Tutorial {
  readonly callout = new Panel(0.13, 0.088, 0xffffff);
  private titleT: Text;
  private bodyT: Text;
  private stepT: Text;
  private skipBtn: Button;
  private line: THREE.Line;
  private ring: THREE.Mesh;
  private cue = new Panel(0.075, 0.014, 0x2a3033);
  private cueT: Text;
  private steps: Step[];
  private index = 0;
  private ctx: StepCtx;
  private t = 0;
  private lastQ: Float64Array;
  enabled: boolean;
  private finished = false;
  private unsub: Array<() => void> = [];

  constructor(private d: TutorialDeps, steps?: Step[]) {
    this.steps = steps ?? defaultSteps(d.pendant);
    const saved = load();
    this.enabled = saved?.enabled ?? true; // on by default for the first run
    this.index = Math.min(saved?.index ?? 0, this.steps.length);
    this.finished = this.index >= this.steps.length;
    this.ctx = { ctl: d.ctl, seen: new Set(), jointTravel: 0 };
    this.lastQ = Float64Array.from(d.ctl.robot.q);

    const C = this.callout;
    C.addRect(0, 0, 0.0025, C.height, BRAND.accentGreen, 0.0006);
    this.stepT = C.addText({ text: '', size: 0.0046, font: 'mono', color: BRAND.sage, position: [0.007, -0.006, 0] });
    this.titleT = C.addText({ text: '', size: 0.0074, font: 'semibold', color: BRAND.cbreGreen, maxWidth: 0.115, position: [0.007, -0.0135, 0] });
    this.bodyT = C.addText({ text: '', size: 0.0053, font: 'body', color: UI.text, maxWidth: 0.117, lineHeight: 1.28, position: [0.007, -0.0245, 0] });
    this.skipBtn = C.addButton({ id: 'skip', label: 'Skip step', x: 0.093, y: -0.0765, w: 0.031, h: 0.0085, size: 0.0040, onClick: () => this.advance() });

    this.line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
      new THREE.LineBasicMaterial({ color: BRAND.accentGreen, depthTest: false, transparent: true }),
    );
    this.line.renderOrder = 1002;
    this.line.frustumCulled = false;
    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(0.0075, 0.0095, 32),
      new THREE.MeshBasicMaterial({ color: BRAND.accentGreen, transparent: true, depthTest: false, side: THREE.DoubleSide }),
    );
    this.ring.renderOrder = 1003;
    this.cue.addRect(0, 0, 0.0018, 0.014, BRAND.accentGreen, 0.0006);
    this.cueT = this.cue.addText({ text: '', size: 0.0058, font: 'semibold', color: 0xffffff, anchorY: 'middle', position: [0.005, -0.007, 0] });
    this.cue.setOverlay(true);
    this.cue.visible = false;
    d.scene.add(this.line, this.ring, this.cue);
    d.scene.add(this.callout);

    const ev = d.ctl.events, rev = d.ctl.robot.events;
    this.unsub.push(
      ev.on('jogMode', () => this.ctx.seen.add('jogMode')),
      ev.on('speed', () => this.ctx.seen.add('speed')),
      ev.on('estop', (e) => this.ctx.seen.add(e.active ? 'estop:on' : 'estop:off')),
      rev.on('gripper', (e) => this.ctx.seen.add(`gripper:${e.state}`)),
    );
    this.applyVisibility();
  }

  get current(): Step | null {
    return this.enabled && !this.finished ? this.steps[this.index] ?? null : null;
  }

  setEnabled(on: boolean) {
    this.enabled = on;
    if (on && this.finished) this.restart();
    save({ enabled: this.enabled, index: this.index });
    this.applyVisibility();
  }

  toggle() { this.setEnabled(!this.enabled); }

  restart() {
    this.index = 0;
    this.finished = false;
    this.beginStep();
    save({ enabled: this.enabled, index: 0 });
    this.applyVisibility();
  }

  private advance() {
    this.index++;
    while (this.index < this.steps.length && this.steps[this.index].available && !this.steps[this.index].available!()) this.index++;
    if (this.index >= this.steps.length) this.finished = true;
    this.beginStep();
    save({ enabled: this.enabled, index: this.index });
    this.applyVisibility();
  }

  private beginStep() {
    this.ctx.seen.clear();
    this.ctx.jointTravel = 0;
    this.lastQ.set(this.d.ctl.robot.q);
    this.t = 0;
  }

  private applyVisibility() {
    const show = !!this.current || (this.enabled && this.finished && this.t < 6);
    this.callout.visible = show;
    this.line.visible = show && !!this.current;
    this.ring.visible = show && !!this.current;
    this.cue.visible = show && !!this.current && !this.d.isDesktop();
  }

  update(dt: number) {
    this.t += dt;
    const ctl = this.d.ctl;
    // Joint travel while enabled.
    for (let i = 0; i < 6; i++) {
      const dq = Math.abs(ctl.robot.q[i] - this.lastQ[i]);
      if (ctl.enable === 'enabled' && ctl.jogMode === 'joint') this.ctx.jointTravel += dq;
      this.lastQ[i] = ctl.robot.q[i];
    }

    const step = this.current;
    if (step && step.done(this.ctx)) { this.advance(); return; }
    this.applyVisibility();
    if (!this.callout.visible) return;

    const desktop = this.d.isDesktop();
    const n = this.steps.length;
    if (step) {
      setText(this.stepT, `TUTORIAL · STEP ${this.index + 1} OF ${n}`);
      setText(this.titleT, step.title);
      setText(this.bodyT, desktop ? step.desktop : step.xr);
      this.skipBtn.setLabel('Skip step');
    } else {
      setText(this.stepT, 'TUTORIAL · COMPLETE');
      setText(this.titleT, 'Well done');
      setText(this.bodyT, 'You have used every pendant control covered so far. Turn the tutorial back on from the whiteboard at any time.');
    }

    // Place the callout.
    const anchorPos = step ? this.anchorWorld(step.anchor(desktop), tmpA) : null;
    if (desktop) {
      if (this.callout.parent !== this.d.desktopDock) { this.d.desktopDock.add(this.callout); this.callout.setOverlay(true); }
      this.callout.position.copy(this.d.desktopCalloutPos); // beside the docked pendant
      this.callout.quaternion.identity();
      this.callout.scale.setScalar(1.3);
    } else if (this.callout.parent !== this.d.boardMount) {
      this.d.boardMount.add(this.callout);
      this.callout.setOverlay(false);
      this.callout.position.copy(this.d.boardPos);
      this.callout.quaternion.identity();
      this.callout.scale.setScalar(this.d.boardScale);
    }
    this.callout.updateMatrixWorld(true);

    if (anchorPos && step) {
      let from: THREE.Vector3;
      if (desktop) {
        from = this.callout.localToWorld(tmpF.set(this.callout.width / 2, -this.callout.height, 0.001));
      } else {
        // Short cue label just above the control, facing the head; leader drops to the button.
        const head = this.d.camera.getWorldPosition(tmpH);
        setText(this.cueT, step.cue);
        tmpB.copy(anchorPos).lerp(head, 0.12);
        tmpB.y += 0.045;
        this.cue.position.copy(tmpB);
        this.cue.lookAt(head);
        this.cue.translateX(-0.0375);
        this.cue.translateY(0.007);
        this.cue.updateMatrixWorld(true);
        from = this.cue.localToWorld(tmpF.set(0.0375, -0.014, 0.001));
      }
      const pos = this.line.geometry.attributes.position as THREE.BufferAttribute;
      pos.setXYZ(0, from.x, from.y, from.z);
      pos.setXYZ(1, anchorPos.x, anchorPos.y, anchorPos.z);
      pos.needsUpdate = true;
      this.ring.position.copy(anchorPos);
      this.ring.quaternion.copy(this.d.camera.getWorldQuaternion(tmpQ));
      const pulse = 0.5 + 0.5 * Math.sin(this.t * 5);
      this.ring.scale.setScalar((desktop ? 1.6 : 1) * (1 + 0.5 * pulse));
      (this.ring.material as THREE.MeshBasicMaterial).opacity = 0.45 + 0.5 * (1 - pulse);
      this.line.visible = true;
      this.ring.visible = true;
    } else {
      this.line.visible = false;
      this.ring.visible = false;
    }
  }

  private anchorWorld(a: Anchor, out: THREE.Vector3): THREE.Vector3 | null {
    if (!a) return null;
    if (a.kind === 'panel') {
      const w = a.panel.widgets.get(a.id);
      if (!w || !isShown(a.panel)) return null;
      return a.panel.rectCenter(w.rect, out);
    }
    const grip = this.d.xr.grips[a.hand];
    if (!grip) return null;
    const model = grip.userData.model as (THREE.Object3D & { motionController?: { components: Record<string, { touchPointNodeName?: string; rootNodeName?: string }> } }) | undefined;
    const comp = model?.motionController?.components?.[a.component];
    const node = comp && (model!.getObjectByName(comp.touchPointNodeName ?? '') ?? model!.getObjectByName(comp.rootNodeName ?? ''));
    if (node) return node.getWorldPosition(out);
    const f = FALLBACK[`${a.hand}:${a.component}`] ?? [0, 0, 0];
    return grip.localToWorld(out.set(...f));
  }

  dispose() { this.unsub.forEach((u) => u()); }
}

function isShown(o: THREE.Object3D) {
  for (let p: THREE.Object3D | null = o; p; p = p.parent) if (!p.visible) return false;
  return true;
}

function load(): { enabled: boolean; index: number } | null {
  try { const s = localStorage.getItem(STORE_KEY); return s ? JSON.parse(s) : null; } catch { return null; }
}
function save(v: { enabled: boolean; index: number }) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(v)); } catch { /* storage unavailable */ }
}

const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();
const tmpH = new THREE.Vector3();
const tmpF = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();
