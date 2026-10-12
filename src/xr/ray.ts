import * as THREE from 'three';
import { BRAND } from '../config/brand';

/** Thin pointer ray with a cursor ring; accent green when over something interactive. */
export class RayVisual {
  readonly group = new THREE.Group();
  private line: THREE.Line;
  private cursor: THREE.Mesh;
  private lineMat = new THREE.LineBasicMaterial({ color: 0x9aa2a3, transparent: true, opacity: 0.75, depthWrite: false });
  private cursorMat = new THREE.MeshBasicMaterial({ color: BRAND.accentGreen, transparent: true, opacity: 0.9, depthTest: false, depthWrite: false, side: THREE.DoubleSide });

  constructor() {
    const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1)]);
    this.line = new THREE.Line(g, this.lineMat);
    this.line.renderOrder = 900;
    this.cursor = new THREE.Mesh(new THREE.RingGeometry(0.004, 0.0065, 24), this.cursorMat);
    this.cursor.renderOrder = 1001;
    this.group.add(this.line);
    this.group.visible = false;
  }

  /** Attach under the right controller's target-ray space; cursor lives in world space. */
  attach(ray: THREE.Object3D, scene: THREE.Scene) {
    if (this.group.parent !== ray) ray.add(this.group);
    if (this.cursor.parent !== scene) scene.add(this.cursor);
  }

  update(visible: boolean, hit: THREE.Intersection | null, interactive: boolean, camera: THREE.Camera) {
    this.group.visible = visible;
    this.cursor.visible = visible && !!hit;
    if (!visible) return;
    const len = hit ? hit.distance : 1.5;
    this.line.scale.z = len;
    this.lineMat.color.setHex(interactive ? BRAND.accentGreen : 0x9aa2a3);
    this.lineMat.opacity = interactive ? 0.95 : 0.55;
    if (hit) {
      this.cursor.position.copy(hit.point);
      this.cursor.quaternion.copy(camera.getWorldQuaternion(tmpQ));
      this.cursorMat.color.setHex(interactive ? BRAND.accentGreen : 0xcad1d3);
      const s = interactive ? 1.25 : 0.9;
      this.cursor.scale.setScalar(s * Math.max(0.6, hit.distance));
    }
  }
}

const tmpQ = new THREE.Quaternion();
