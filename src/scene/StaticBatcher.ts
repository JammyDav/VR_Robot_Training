import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

interface Bucket {
  material: THREE.Material;
  cast: boolean;
  receive: boolean;
  parts: THREE.BufferGeometry[];
}

export interface AddOpts {
  cast?: boolean;
  receive?: boolean;
}

/**
 * Collects static geometry in world space and merges it into one mesh per
 * (material, shadow flags) bucket. Keeps lab furniture to a handful of draw calls.
 */
export class StaticBatcher {
  private buckets = new Map<string, Bucket>();
  private tmp = new THREE.Object3D();

  add(geometry: THREE.BufferGeometry, material: THREE.Material, matrix: THREE.Matrix4, opts: AddOpts = {}) {
    const cast = opts.cast ?? false;
    const receive = opts.receive ?? true;
    const key = `${material.uuid}|${cast}|${receive}`;
    let b = this.buckets.get(key);
    if (!b) this.buckets.set(key, (b = { material, cast, receive, parts: [] }));
    let g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
    for (const name of Object.keys(g.attributes)) {
      if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name);
    }
    if (!g.attributes.uv) {
      g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    }
    if (!g.attributes.normal) g.computeVertexNormals();
    g.applyMatrix4(matrix);
    b.parts.push(g);
    if (g !== geometry) geometry.dispose();
  }

  /** Convenience: place geometry by position / Euler rotation / scale. */
  place(
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    x: number,
    y: number,
    z: number,
    rx = 0,
    ry = 0,
    rz = 0,
    opts: AddOpts = {},
  ) {
    this.tmp.position.set(x, y, z);
    this.tmp.rotation.set(rx, ry, rz);
    this.tmp.scale.set(1, 1, 1);
    this.tmp.updateMatrix();
    this.add(geometry, material, this.tmp.matrix, opts);
  }

  /** Axis-aligned box given its centre and size. */
  box(material: THREE.Material, cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, opts: AddOpts = {}) {
    this.place(new THREE.BoxGeometry(sx, sy, sz), material, cx, cy, cz, 0, 0, 0, opts);
  }

  /** Box given min-corner and max-corner, which reads more naturally for architecture. */
  span(material: THREE.Material, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, opts: AddOpts = {}) {
    this.box(material, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0), opts);
  }

  /**
   * Flatten every static mesh under `root` into the batch, using its world
   * matrix and shadow flags, then detach it. Meshes (or subtrees) flagged
   * `userData.dynamic` are left in place so they can still animate.
   */
  absorb(root: THREE.Object3D) {
    root.updateMatrixWorld(true);
    const take: THREE.Mesh[] = [];
    const visit = (o: THREE.Object3D) => {
      if (o.userData.dynamic) return;
      if ((o as THREE.Mesh).isMesh) take.push(o as THREE.Mesh);
      o.children.forEach(visit);
    };
    visit(root);
    for (const mesh of take) {
      this.add(mesh.geometry, mesh.material as THREE.Material, mesh.matrixWorld, {
        cast: mesh.castShadow,
        receive: mesh.receiveShadow,
      });
      mesh.removeFromParent();
    }
  }

  build(parent: THREE.Object3D): THREE.Mesh[] {
    const meshes: THREE.Mesh[] = [];
    for (const b of this.buckets.values()) {
      const merged = mergeGeometries(b.parts, false);
      b.parts.forEach((p) => p.dispose());
      if (!merged) continue;
      merged.computeBoundingSphere();
      const m = new THREE.Mesh(merged, b.material);
      m.castShadow = b.cast;
      m.receiveShadow = b.receive;
      m.matrixAutoUpdate = false;
      m.updateMatrix();
      m.name = `static:${(b.material as THREE.MeshStandardMaterial).name || b.material.uuid.slice(0, 6)}`;
      if (b.material.transparent) m.renderOrder = 2;
      parent.add(m);
      meshes.push(m);
    }
    this.buckets.clear();
    return meshes;
  }
}
