import * as THREE from 'three';
import type { Materials } from './materials';
import { mesh, box } from './build';
import { PLATE } from '../config/plate';

/**
 * Plate-accurate nest: a flat datum plate with four L-shaped corner locators
 * and a chamfer cue at A1. Local frame: origin at the plate seat centre (top of
 * datum), +X along the plate's long side, +Z toward row H (front of the plate).
 * A1 sits at (-X, -Z).
 */
export function buildNest(parent: THREE.Object3D, M: Materials, baseMat: THREE.Material = M.frameDark) {
  const g = new THREE.Group();
  parent.add(g);
  const clr = 0.0006; // clearance per side
  const L = PLATE.length + 2 * clr, W = PLATE.width + 2 * clr;
  const pad = 0.012;
  mesh(box(L + 2 * pad, 0.006, W + 2 * pad), baseMat, g, 0, -0.003, 0);
  const h = 0.007, t = 0.004, arm = 0.022;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const cx = sx * (L / 2 + t / 2), cz = sz * (W / 2 + t / 2);
    mesh(box(t, h, arm), M.aluminium, g, cx, h / 2, sz * (W / 2 - arm / 2 + t), 0, 0, 0, true);
    mesh(box(arm, h, t), M.aluminium, g, sx * (L / 2 - arm / 2 + t), h / 2, cz, 0, 0, 0, true);
  }
  // A1 cue: small brand-trim triangle on the datum at the back-left corner.
  const tri = new THREE.Shape();
  // Shape Y maps to world -Z under the -90° X rotation, so draw it toward -Y.
  tri.moveTo(0, 0); tri.lineTo(0.014, 0); tri.lineTo(0, -0.014); tri.closePath();
  mesh(new THREE.ShapeGeometry(tri), M.brandTrim, g, -L / 2 - pad + 0.002, 0.0002, -W / 2 - pad + 0.002, -Math.PI / 2);
  return g;
}
