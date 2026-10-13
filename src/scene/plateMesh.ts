import * as THREE from 'three';
import { PLATE } from '../config/plate';
import type { PlateVariant } from '../core/cell/Cell';

// ANSI/SLAS microplate: skirt (full footprint) + body (inset), chamfered A1
// corner, 96 instanced wells on top. Frame: origin at bottom centre, X along
// the long side, Y up; A1 at (−X, −Z).

function outline(L: number, W: number, chamfer: number) {
  // Shape coordinates: x → plate X, y → plate −Z (after the −90° X rotation).
  const s = new THREE.Shape();
  const x0 = -L / 2, x1 = L / 2, y0 = -W / 2, y1 = W / 2;
  s.moveTo(x0 + chamfer, y1); // A1 corner is (−X, −Z) = shape (x0, y1)
  s.lineTo(x1, y1);
  s.lineTo(x1, y0);
  s.lineTo(x0, y0);
  s.lineTo(x0, y1 - chamfer);
  s.closePath();
  return s;
}

function slab(L: number, W: number, h: number, chamfer: number, y0: number) {
  const g = new THREE.ExtrudeGeometry(outline(L, W, chamfer), { depth: h, bevelEnabled: false });
  g.rotateX(-Math.PI / 2);
  g.translate(0, y0, 0);
  return g;
}

const VARIANTS: Record<PlateVariant, { body: THREE.MeshStandardMaterialParameters; well: number; wellOpacity: number }> = {
  clear: { body: { color: 0xe4eef0, roughness: 0.12, transparent: true, opacity: 0.55, depthWrite: false }, well: 0x9fb6bb, wellOpacity: 0.55 },
  white: { body: { color: 0xf4f4f1, roughness: 0.5 }, well: 0xd6d8d6, wellOpacity: 1 },
  black: { body: { color: 0x24282a, roughness: 0.45 }, well: 0x0e1011, wellOpacity: 1 },
};

const skirtGeo = slab(PLATE.length, PLATE.width, PLATE.skirtHeight, PLATE.chamfer + 0.001, 0);
const bodyGeo = slab(PLATE.length - 2 * PLATE.skirtInset, PLATE.width - 2 * PLATE.skirtInset, PLATE.height - PLATE.skirtHeight, PLATE.chamfer, PLATE.skirtHeight);
const wellGeo = new THREE.CylinderGeometry(PLATE.wellDiameter / 2, PLATE.wellDiameter / 2, 0.0006, 16);

export class PlateVisual extends THREE.Group {
  private mats: { body: THREE.MeshStandardMaterial; wells: THREE.MeshStandardMaterial };
  private variant: PlateVariant | null = null;

  constructor() {
    super();
    this.mats = { body: new THREE.MeshStandardMaterial(), wells: new THREE.MeshStandardMaterial({ roughness: 0.3 }) };
    const skirt = new THREE.Mesh(skirtGeo, this.mats.body);
    const body = new THREE.Mesh(bodyGeo, this.mats.body);
    skirt.castShadow = body.castShadow = true;
    skirt.receiveShadow = body.receiveShadow = true;
    const wells = new THREE.InstancedMesh(wellGeo, this.mats.wells, PLATE.rows * PLATE.cols);
    const m = new THREE.Matrix4();
    let i = 0;
    for (let r = 0; r < PLATE.rows; r++) {
      for (let c = 0; c < PLATE.cols; c++) {
        // A1 is the back-left well: row A at −Z, column 1 at −X.
        const x = -PLATE.length / 2 + PLATE.a1OffsetX + c * PLATE.wellPitch;
        const z = -PLATE.width / 2 + PLATE.a1OffsetY + r * PLATE.wellPitch;
        wells.setMatrixAt(i++, m.makeTranslation(x, PLATE.height + 0.0002, z));
      }
    }
    this.add(skirt, body, wells);
    this.matrixAutoUpdate = false;
    this.setVariant('clear');
  }

  setVariant(v: PlateVariant) {
    if (v === this.variant) return;
    this.variant = v;
    const spec = VARIANTS[v];
    const b = this.mats.body;
    b.color.setHex(spec.body.color as number);
    b.roughness = spec.body.roughness as number;
    b.transparent = !!spec.body.transparent;
    b.opacity = (spec.body.opacity as number) ?? 1;
    b.depthWrite = spec.body.depthWrite ?? true;
    b.needsUpdate = true;
    const w = this.mats.wells;
    w.color.setHex(spec.well);
    w.transparent = spec.wellOpacity < 1;
    w.opacity = spec.wellOpacity;
    w.needsUpdate = true;
    this.renderOrder = b.transparent ? 2 : 0;
  }

  setPose(m: THREE.Matrix4) {
    this.matrix.copy(m);
    this.matrixWorldNeedsUpdate = true;
  }
}
