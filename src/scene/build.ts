import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

// Small helpers for composing procedural geometry as ordinary Object3D trees.

export function mesh(
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  parent: THREE.Object3D,
  x = 0,
  y = 0,
  z = 0,
  rx = 0,
  ry = 0,
  rz = 0,
  cast = false,
): THREE.Mesh {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  m.castShadow = cast;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

export const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);

export const rbox = (w: number, h: number, d: number, r = 0.01, seg = 2) =>
  new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4));

export const cyl = (rTop: number, rBottom: number, h: number, seg = 16, open = false) =>
  new THREE.CylinderGeometry(rTop, rBottom, h, seg, 1, open);

/** Box from bottom-centre, so furniture can be placed by its footprint. */
export function boxOn(
  material: THREE.Material,
  parent: THREE.Object3D,
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
  r = 0,
  cast = false,
) {
  return mesh(r > 0 ? rbox(w, h, d, r) : box(w, h, d), material, parent, x, y + h / 2, z, 0, 0, 0, cast);
}

export function group(parent: THREE.Object3D, x = 0, y = 0, z = 0, ry = 0, name = ''): THREE.Group {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.rotation.y = ry;
  g.name = name;
  parent.add(g);
  return g;
}
