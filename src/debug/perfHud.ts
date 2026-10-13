import * as THREE from 'three';
import { Text } from 'troika-three-text';
import { makeText } from '../ui/text';
import { BRAND } from '../config/brand';

/**
 * Frame-rate and draw-call readout. Desktop: DOM overlay. XR: a small text
 * label locked below the view (debug only; toggle with `P` or `?perf`).
 */
export class PerfHud {
  private el: HTMLElement;
  private xrText: Text;
  private frames = 0;
  private acc = 0;
  private worst = 0;
  fps = 0;
  calls = 0;
  tris = 0;
  visible: boolean;

  constructor(el: HTMLElement, camera: THREE.Camera) {
    this.el = el;
    this.visible = new URLSearchParams(location.search).has('perf') || import.meta.env.DEV;
    this.xrText = makeText({ text: '', size: 0.012, font: 'mono', color: BRAND.cbreGreen, anchorX: 'center', anchorY: 'middle' });
    this.xrText.position.set(0, -0.18, -0.6);
    this.xrText.material.depthTest = false;
    this.xrText.renderOrder = 999;
    camera.add(this.xrText);
    window.addEventListener('keydown', (e) => { if (e.key === 'p' || e.key === 'P') this.toggle(); });
    this.apply();
  }

  toggle() { this.visible = !this.visible; this.apply(); }

  private apply() {
    this.el.style.display = this.visible ? 'block' : 'none';
    if (this.visible && !this.el.textContent) this.el.textContent = 'Measuring…';
    this.xrText.visible = false;
  }

  /** Call once per frame after rendering. */
  sample(dt: number, info: THREE.WebGLInfo, presenting: boolean) {
    this.frames++;
    this.acc += dt;
    this.worst = Math.max(this.worst, dt);
    this.calls = info.render.calls;
    this.tris = info.render.triangles;
    if (this.acc >= 0.5) {
      this.fps = this.frames / this.acc;
      const line = `${this.fps.toFixed(0)} fps  ·  worst ${(this.worst * 1000).toFixed(1)} ms  ·  ${this.calls} draws  ·  ${Number.isFinite(this.tris) ? `${(this.tris / 1000).toFixed(0)}k tris` : 'tris n/a'}`;
      if (this.visible) {
        this.el.textContent = line;
        this.xrText.text = line;
        this.xrText.sync();
      }
      this.frames = 0;
      this.acc = 0;
      this.worst = 0;
    }
    this.xrText.visible = this.visible && presenting;
  }
}
