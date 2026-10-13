import * as THREE from 'three';
import type { Text } from 'troika-three-text';
import { TextGroup, type TextOpts } from '../text';
import { BRAND } from '../../config/brand';

// Retained-mode UI panel in world units (metres). Layers by z: background 0,
// rects 0.4 mm, raised rects (markers, chips) 0.6–0.8 mm, text 1.2 mm. Any rect
// drawn over another rect must use a higher z, or it will z-fight in the headset.
// Origin at the panel's
// top-left corner, +X right, −Y down, +Z toward the viewer. All rectangles of
// a panel share one InstancedMesh, and all text shares one BatchedText per
// font, so a full panel costs only a few draw calls.

export const UI = {
  bg: 0xffffff,
  surface: 0xf1f3f2,
  button: 0xe6eaea,
  buttonHover: BRAND.celadonTint,
  buttonDown: BRAND.celadon,
  active: BRAND.cbreGreen,
  text: BRAND.darkGrey,
  textOnDark: 0xffffff,
  disabledText: 0xa7aeaf,
} as const;

const DEFAULT_MAX_RECTS = 160;
const unit = new THREE.PlaneGeometry(1, 1).translate(0.5, -0.5, 0); // top-left anchored

export interface Widget {
  rect: number;
  enabled: boolean;
  onClick?: () => void;
  onHover?: (on: boolean) => void;
  /** Tutorial / callout anchor name. */
  id?: string;
}

export class Panel extends THREE.Group {
  readonly width: number;
  readonly height: number;
  readonly rects: THREE.InstancedMesh;
  readonly text = new TextGroup();
  private rectCount = 0;
  private boxes: Array<[number, number, number, number, number]> = []; // x, y, w, h, z
  private widgetsByRect = new Map<number, Widget>();
  readonly widgets = new Map<string, Widget>();
  private m = new THREE.Matrix4();
  private c = new THREE.Color();

  constructor(width: number, height: number, background: number = UI.bg, maxRects = DEFAULT_MAX_RECTS) {
    super();
    this.width = width;
    this.height = height;
    const mat = new THREE.MeshBasicMaterial({ toneMapped: false });
    this.rects = new THREE.InstancedMesh(unit, mat, maxRects);
    this.rects.count = 0;
    this.rects.frustumCulled = false;
    this.add(this.rects);
    this.text.position.z = 0.0012;
    this.add(this.text);
    this.addRect(0, 0, width, height, background, 0);
  }

  addRect(x: number, y: number, w: number, h: number, color: number, z = 0.0004): number {
    const id = this.rectCount++;
    this.rects.count = this.rectCount;
    this.boxes[id] = [x, y, w, h, z];
    this.writeRect(id);
    this.setColor(id, color);
    return id;
  }

  /** Move/resize a rect. Bounds are not recomputed: rects stay inside the background. */
  setRect(id: number, x: number, y: number, w: number, h: number) {
    const b = this.boxes[id];
    b[0] = x; b[1] = y; b[2] = w; b[3] = h;
    this.writeRect(id, false);
  }

  setRectVisible(id: number, visible: boolean) {
    const b = this.boxes[id];
    this.m.makeScale(visible ? Math.max(b[2], 1e-6) : 1e-6, visible ? Math.max(b[3], 1e-6) : 1e-6, 1).setPosition(b[0], b[1], b[4]);
    this.rects.setMatrixAt(id, this.m);
    this.rects.instanceMatrix.needsUpdate = true;
  }

  private writeRect(id: number, bounds = true) {
    const [x, y, w, h, z] = this.boxes[id];
    this.m.makeScale(Math.max(w, 1e-6), Math.max(h, 1e-6), 1).setPosition(x, y, z);
    this.rects.setMatrixAt(id, this.m);
    this.rects.instanceMatrix.needsUpdate = true;
    if (bounds) this.rects.computeBoundingSphere();
  }

  setColor(id: number, color: number) {
    this.rects.setColorAt(id, this.c.setHex(color));
    this.rects.instanceColor!.needsUpdate = true;
  }

  rectCenter(id: number, out = new THREE.Vector3()) {
    const [x, y, w, h, z] = this.boxes[id];
    return this.localToWorld(out.set(x + w / 2, y - h / 2, z));
  }

  addText(o: TextOpts): Text {
    return this.text.addText(o);
  }

  addButton(o: {
    id?: string; x: number; y: number; w: number; h: number; label: string;
    onClick?: () => void; size?: number; color?: number;
  }): Button {
    const btn = new Button(this, o);
    this.widgetsByRect.set(btn.rect, btn);
    if (o.id) this.widgets.set(o.id, btn);
    return btn;
  }

  /** Register an existing rect as an anchor (no interaction). */
  anchor(id: string, rect: number) {
    this.widgets.set(id, { rect, enabled: false, id });
  }

  /** An invisible rect used only as a callout anchor / layout region. */
  addAnchor(id: string, x: number, y: number, w: number, h: number) {
    const rect = this.addRect(x, y, w, h, 0xffffff, 0);
    this.setRectVisible(rect, false);
    this.anchor(id, rect);
    return rect;
  }

  widgetAtInstance(instanceId: number | undefined): Widget | null {
    if (instanceId === undefined) return null;
    return this.widgetsByRect.get(instanceId) ?? null;
  }

  /** Draw on top of scene geometry (desktop docked mode). */
  setOverlay(on: boolean) {
    this.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | undefined;
      if (m) { m.depthTest = !on; m.depthWrite = !on; }
      o.renderOrder = on ? 1000 + (o === this.rects ? 0 : 1) : 0;
    });
  }
}

export class Button implements Widget {
  readonly rect: number;
  readonly label: Text;
  enabled = true;
  active = false;
  private hovered = false;
  private baseColor: number;
  onClick?: () => void;
  readonly id?: string;

  constructor(private panel: Panel, o: {
    id?: string; x: number; y: number; w: number; h: number; label: string;
    onClick?: () => void; size?: number; color?: number;
  }) {
    this.id = o.id;
    this.baseColor = o.color ?? UI.button;
    this.rect = panel.addRect(o.x, o.y, o.w, o.h, this.baseColor);
    this.label = panel.addText({
      text: o.label, size: o.size ?? Math.min(0.0068, o.h * 0.5), font: 'semibold', color: UI.text,
      anchorX: 'center', anchorY: 'middle', position: [o.x + o.w / 2, o.y - o.h / 2, 0],
    });
    this.onClick = o.onClick;
    this.labelText = o.label;
  }

  onHover(on: boolean) {
    this.hovered = on;
    this.refresh();
  }

  setActive(on: boolean) {
    if (on === this.active) return;
    this.active = on;
    this.refresh();
  }

  setEnabled(on: boolean) {
    this.enabledWhenShown = on;
    const eff = on && this.visible;
    if (eff === this.enabled) return;
    this.enabled = eff;
    this.refresh();
  }

  setLabel(s: string) {
    this.labelText = s;
    const shown = this.visible ? s : '';
    if (this.label.text !== shown) { this.label.text = shown; this.label.sync(); }
  }

  /** Show / hide. Hidden buttons draw nothing and cannot be clicked. */
  setVisible(on: boolean) {
    if (on === this.visible) return;
    this.visible = on;
    this.panel.setRectVisible(this.rect, on);
    this.setLabel(this.labelText);
    this.enabled = on && this.enabledWhenShown;
    this.refresh();
  }
  visible = true;
  private labelText = '';
  private enabledWhenShown = true;

  setBaseColor(c: number) {
    this.baseColor = c;
    this.refresh();
  }

  flash() {
    this.panel.setColor(this.rect, UI.buttonDown);
    setTimeout(() => this.refresh(), 120);
  }

  private refresh() {
    const color = !this.enabled ? UI.surface
      : this.active ? UI.active
        : this.hovered ? UI.buttonHover : this.baseColor;
    this.panel.setColor(this.rect, color);
    const tc = !this.enabled ? UI.disabledText : this.active ? UI.textOnDark : UI.text;
    if (this.label.color !== tc) { this.label.color = tc; this.label.sync(); }
  }
}

/** Update a Text only if its content changed (avoids re-layout every frame). */
export function setText(t: Text, s: string, color?: number) {
  let dirty = false;
  if (t.text !== s) { t.text = s; dirty = true; }
  if (color !== undefined && t.color !== color) { t.color = color; dirty = true; }
  if (dirty) t.sync();
}
