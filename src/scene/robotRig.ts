import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { buildJointTree, applyJoints, type JointTree } from './robotTree';
import { StaticBatcher } from './StaticBatcher';
import { TX2_60 } from '../config/robotSpec';
import { GRIPPER, TOOL_LENGTH } from '../config/toolSpec';
import { J4_ALONG_FOREARM } from '../core/kinematics/chain';
import { TextGroup } from '../ui/text';

// Visual model of the arm. All link geometry is authored in the joint frame it
// rides on (Z along the link, Y along the J2/J3/J5 axes), then merged per
// material so the whole robot costs a handful of draw calls.

export interface RobotRig extends JointTree {
  jaws: [THREE.Object3D, THREE.Object3D];
  triad: THREE.Object3D;
  update(q: ArrayLike<number>, gripperHalfGap: number): void;
}

function robotMaterials() {
  // Seams share the cap material: one fewer draw call per link (×2 with shadows).
  const cap = new THREE.MeshStandardMaterial({ color: 0x353b3e, roughness: 0.5, metalness: 0.1, name: 'robotCap' });
  return {
    cast: new THREE.MeshStandardMaterial({ color: 0xebe8e1, roughness: 0.36, metalness: 0.02, name: 'robotCast' }),
    cap,
    gap: cap,
    flange: new THREE.MeshStandardMaterial({ color: 0xbfc3c5, roughness: 0.28, metalness: 0.85, name: 'flange' }),
    anodised: new THREE.MeshStandardMaterial({ color: 0x5b6366, roughness: 0.42, metalness: 0.45, name: 'gripperBody' }),
    finger: new THREE.MeshStandardMaterial({ color: 0xd2d5d6, roughness: 0.3, metalness: 0.8, name: 'finger' }),
    pad: new THREE.MeshStandardMaterial({ color: 0x2b2f30, roughness: 0.9, name: 'pad' }),
    plate: new THREE.MeshStandardMaterial({ color: 0x2a3033, roughness: 0.7, metalness: 0.1, name: 'nameplate' }),
  };
}
type RM = ReturnType<typeof robotMaterials>;

const rbox = (w: number, h: number, d: number, r: number) =>
  new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4));

function add(parent: THREE.Object3D, g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const mesh = new THREE.Mesh(g, m);
  mesh.position.set(x, y, z);
  mesh.rotation.set(rx, ry, rz);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

/** Cylinder along local Y between y0 and y1 (three's default cylinder axis). */
function hubY(p: THREE.Object3D, m: THREE.Material, r: number, y0: number, y1: number, x = 0, z = 0, seg = 32) {
  return add(p, new THREE.CylinderGeometry(r, r, Math.abs(y1 - y0), seg), m, x, (y0 + y1) / 2, z);
}

/** Cylinder along local Z between z0 and z1. */
function tubeZ(p: THREE.Object3D, m: THREE.Material, r0: number, r1: number, z0: number, z1: number, seg = 32) {
  return add(p, new THREE.CylinderGeometry(r1, r0, z1 - z0, seg), m, 0, 0, (z0 + z1) / 2, Math.PI / 2);
}

/** Lathe about local Z from (radius, z) pairs. */
function latheZ(p: THREE.Object3D, m: THREE.Material, profile: Array<[number, number]>, seg = 40) {
  const pts = profile.map(([r, z]) => new THREE.Vector2(r, z));
  return add(p, new THREE.LatheGeometry(pts, seg), m, 0, 0, 0, Math.PI / 2);
}

/** Lozenge link casting in the XZ plane (two end radii), extruded along Y. */
function lozengeY(p: THREE.Object3D, m: THREE.Material, r0: number, r1: number, len: number, y0: number, width: number) {
  // External tangents of the two end circles touch at angle ±a from the X axis.
  const s = new THREE.Shape();
  const a = Math.asin((r0 - r1) / len);
  s.absarc(0, 0, r0, Math.PI - a, 2 * Math.PI + a, false); // lower end, round the bottom
  s.absarc(0, len, r1, a, Math.PI - a, false); // upper end, round the top
  s.closePath();
  const bevel = Math.min(0.012, width * 0.25);
  const g = new THREE.ExtrudeGeometry(s, {
    depth: width - 2 * bevel, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel * 0.8, bevelSegments: 4, curveSegments: 24,
  });
  g.translate(0, 0, bevel);
  // shape (x, y, z) → link (X, Z, −Y); then shift so it spans y0 … y0 + width.
  g.rotateX(Math.PI / 2);
  g.translate(0, y0 + width, 0);
  return add(p, g, m);
}

function cap(p: THREE.Object3D, m: RM, r: number, y: number, outward: 1 | -1, x = 0, z = 0) {
  hubY(p, m.cap, r, y, y + outward * 0.007, x, z);
  hubY(p, m.gap, r * 0.35, y + outward * 0.007, y + outward * 0.009, x, z, 20);
}

/** Merge the static visuals under `g` per material, in `g`'s local space. */
function bake(g: THREE.Object3D) {
  g.updateMatrixWorld(true);
  const inv = g.matrixWorld.clone().invert();
  const b = new StaticBatcher();
  const meshes: THREE.Mesh[] = [];
  // Child joint groups are flagged dynamic, so each link only merges its own visuals.
  g.traverse((o) => { if ((o as THREE.Mesh).isMesh && !o.userData.dynamic && !hasDynamicAncestor(o, g)) meshes.push(o as THREE.Mesh); });
  const rel = new THREE.Matrix4();
  for (const mesh of meshes) {
    rel.multiplyMatrices(inv, mesh.matrixWorld);
    b.add(mesh.geometry, mesh.material as THREE.Material, rel, { cast: true, receive: true });
    mesh.removeFromParent();
  }
  b.build(g);
}
function hasDynamicAncestor(o: THREE.Object3D, stop: THREE.Object3D) {
  for (let p = o.parent; p && p !== stop; p = p.parent) if (p.userData.dynamic) return true;
  return false;
}

export function buildRobot(parent: THREE.Object3D): RobotRig {
  const tree = buildJointTree();
  const m = robotMaterials();
  const [j1, j2, j3, j4, j5, j6] = tree.joints;
  const H = TX2_60.baseHeight, UA = TX2_60.upperArm, EO = TX2_60.elbowOffset;
  const fore2 = TX2_60.forearm - J4_ALONG_FOREARM;

  // --- Base (fixed): rounded square plinth + turret ------------------------
  const base = new THREE.Group();
  tree.root.add(base);
  add(base, rbox(0.21, 0.21, 0.07, 0.03), m.cast, 0, 0, 0.035);
  add(base, rbox(0.215, 0.215, 0.008, 0.004), m.gap, 0, 0, 0.004);
  latheZ(base, m.cast, [[0.0, 0.07], [0.098, 0.07], [0.094, 0.12], [0.088, 0.19], [0.0, 0.19]]);
  tubeZ(base, m.gap, 0.087, 0.087, 0.19, 0.198);
  // Rear connector block (−X, faces the operator).
  add(base, rbox(0.05, 0.12, 0.14, 0.012), m.cast, -0.115, 0, 0.07);
  for (const y of [-0.03, 0.03]) add(base, new THREE.CylinderGeometry(0.014, 0.014, 0.02, 20), m.cap, -0.146, y, 0.035, 0, 0, Math.PI / 2);

  // --- Link 1: turret top and shoulder housing -----------------------------
  tubeZ(j1, m.cast, 0.087, 0.084, 0.198, 0.29);
  add(j1, rbox(0.17, 0.15, 0.13, 0.05), m.cast, 0, 0.0, H - 0.04);
  hubY(j1, m.cast, 0.078, -0.075, 0.075, 0, H);
  cap(j1, m, 0.062, -0.075, -1, 0, H);
  // J2 motor bulge on the rear.
  add(j1, rbox(0.06, 0.1, 0.1, 0.03), m.cast, -0.085, 0, H - 0.06);

  // --- Link 2: side-mounted upper arm --------------------------------------
  const uaY0 = 0.077, uaW = 0.07;
  lozengeY(j2, m.cast, 0.074, 0.062, UA, uaY0, uaW);
  cap(j2, m, 0.058, uaY0 + uaW, 1);
  cap(j2, m, 0.05, uaY0 + uaW, 1, 0, UA);
  hubY(j2, m.gap, 0.079, 0.075, uaY0, 0, 0, 32);

  // --- Link 3: elbow housing with the J4 drive ------------------------------
  const ey1 = uaY0 - EO; // inner face of the upper arm, in the J3 frame
  hubY(j3, m.cast, 0.062, -0.062, ey1, 0, 0);
  cap(j3, m, 0.05, -0.062, -1);
  hubY(j3, m.gap, 0.063, ey1, ey1 + 0.002);
  add(j3, rbox(0.116, 0.116, 0.13, 0.045), m.cast, 0, -0.004, 0.045);
  // Rear counter-housing behind the elbow.
  add(j3, rbox(0.1, 0.1, 0.06, 0.04), m.cast, 0, -0.004, -0.04);
  tubeZ(j3, m.gap, 0.05, 0.05, J4_ALONG_FOREARM - 0.006, J4_ALONG_FOREARM);

  // --- Link 4: forearm tube and wrist fork ---------------------------------
  latheZ(j4, m.cast, [[0.0, 0.0], [0.05, 0.0], [0.049, 0.03], [0.043, fore2 - 0.075], [0.046, fore2 - 0.06], [0.0, fore2 - 0.06]]);
  for (const s of [-1, 1] as const) {
    add(j4, rbox(0.074, 0.022, 0.1, 0.01), m.cast, 0, s * 0.043, fore2 - 0.03);
    cap(j4, m, 0.034, s * 0.054, s, 0, fore2);
  }

  // --- Link 5: wrist head ---------------------------------------------------
  hubY(j5, m.cast, 0.035, -0.032, 0.032, 0, 0);
  add(j5, new THREE.SphereGeometry(0.036, 28, 18), m.cast, 0, 0, 0);
  tubeZ(j5, m.cast, 0.034, 0.032, 0.0, TX2_60.flange - 0.012);
  tubeZ(j5, m.gap, 0.033, 0.033, TX2_60.flange - 0.012, TX2_60.flange - 0.008);
  tubeZ(j5, m.cap, 0.032, 0.032, TX2_60.flange - 0.008, TX2_60.flange);

  // --- Link 6: tool flange + gripper ---------------------------------------
  tubeZ(j6, m.flange, 0.031, 0.031, -0.004, 0.0);
  const G = GRIPPER;
  tubeZ(j6, m.flange, 0.034, 0.034, 0, G.adapterThickness);
  const [bx, by, bz] = G.bodySize;
  const bodyZ0 = G.adapterThickness;
  add(j6, rbox(bx, by, bz, 0.006), m.anodised, 0, 0, bodyZ0 + bz / 2);
  add(j6, rbox(bx * 0.6, by + 0.006, 0.012, 0.004), m.cap, 0, 0, bodyZ0 + bz - 0.008);
  add(j6, new THREE.BoxGeometry(bx - 0.012, 0.0015, 0.008), m.gap, 0, 0, bodyZ0 + bz + 0.0005);

  const jaws = ([1, -1] as const).map((s) => {
    const jaw = new THREE.Group();
    jaw.userData.dynamic = true;
    jaw.position.y = s * G.openHalfGap;
    j6.add(jaw);
    const zTop = bodyZ0 + bz;
    const [fw, ft] = G.fingerBlade;
    // Jaw origin is on the inner finger face; geometry extends outward (s * +Y).
    add(jaw, rbox(0.04, 0.016, 0.014, 0.003), m.finger, 0, s * (ft + 0.006), zTop - 0.004);
    add(jaw, new THREE.BoxGeometry(fw, ft, G.fingerLength), m.finger, 0, s * ft / 2, zTop + G.fingerLength / 2);
    add(jaw, new THREE.BoxGeometry(fw * 0.8, 0.0012, G.fingerLength * 0.45), m.pad, 0, -s * 0.0006, TOOL_LENGTH - G.fingerLength * 0.3);
    add(jaw, new THREE.BoxGeometry(fw, G.lipDepth, G.lipHeight), m.finger, 0, -s * G.lipDepth / 2, TOOL_LENGTH - G.lipHeight / 2);
    bakeJaw(jaw);
    return jaw;
  }) as unknown as [THREE.Object3D, THREE.Object3D];

  // --- Nameplates ------------------------------------------------------------
  // Upper arm outer face (+Y side): plain "TX2-60" plate.
  const np = new THREE.Group();
  np.userData.dynamic = true;
  np.position.set(0, uaY0 + uaW + 0.0005, UA * 0.52);
  // Text runs along the arm (+Z), up = +X, facing out of the +Y face.
  np.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0)));
  j2.add(np);
  const npPlate = new THREE.Mesh(new THREE.PlaneGeometry(0.11, 0.032), m.plate);
  npPlate.position.z = 0.0002;
  np.add(npPlate);
  const npText = new TextGroup();
  npText.position.z = 0.0008;
  npText.addText({ text: 'TX2-60', size: 0.019, font: 'semibold', color: 0xeeeeea, anchorX: 'center', anchorY: 'middle', letterSpacing: 0.04 });
  np.add(npText);

  // Spec plate on the rear connector block (faces the operator).
  const sp = new THREE.Group();
  sp.userData.dynamic = true;
  sp.position.set(-0.1405, 0, 0.1);
  sp.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(-1, 0, 0)));
  base.add(sp);
  // Matte dark plate with light type, same treatment as the arm nameplate:
  // a bright metallic plate reflected the room and washed the text out.
  const spPlate = new THREE.Mesh(new THREE.PlaneGeometry(0.112, 0.062), m.plate);
  spPlate.position.z = 0.0002;
  sp.add(spPlate);
  const spText = new TextGroup();
  spText.position.set(-0.05, 0.025, 0.0008);
  spText.addText({ text: 'TX2-60', size: 0.012, font: 'semibold', color: 0xf2f2ee });
  spText.addText({
    text: `Reach ${TX2_60.reachMm} mm\nLoad ${TX2_60.loadCapacityKg} kg\nRepeat. ±${TX2_60.repeatabilityMm} mm`,
    size: 0.0088, font: 'medium', color: 0xe4e6e3, lineHeight: 1.3, position: [0, -0.017, 0],
  });
  sp.add(spText);

  // --- TCP triad (toggleable) ----------------------------------------------
  const triad = new THREE.Group();
  triad.userData.dynamic = true;
  const axis = (color: number, rx: number, rz: number, dx: number, dy: number, dz: number) => {
    const mm = new THREE.Mesh(new THREE.CylinderGeometry(0.0016, 0.0016, 0.045, 8), new THREE.MeshBasicMaterial({ color, depthTest: false }));
    mm.rotation.set(rx, 0, rz);
    mm.position.set(dx, dy, dz);
    mm.renderOrder = 10;
    triad.add(mm);
  };
  axis(0xd8342c, 0, -Math.PI / 2, 0.0225, 0, 0);
  axis(0x2fbf5b, 0, 0, 0, 0.0225, 0);
  axis(0x2f6fd8, Math.PI / 2, 0, 0, 0, 0.0225);
  tree.tcp.add(triad);

  for (const g of [base, ...tree.joints]) bake(g);

  parent.add(tree.root);

  const rig: RobotRig = {
    ...tree,
    jaws,
    triad,
    update(q, halfGap) {
      applyJoints(tree, q);
      jaws[0].position.y = halfGap;
      jaws[1].position.y = -halfGap;
    },
  };
  return rig;
}

function bakeJaw(jaw: THREE.Object3D) {
  // Jaw meshes are dynamic as a group; merge inside the jaw itself.
  const b = new StaticBatcher();
  jaw.updateMatrix();
  const meshes = jaw.children.filter((c) => (c as THREE.Mesh).isMesh) as THREE.Mesh[];
  for (const mesh of meshes) {
    mesh.updateMatrix();
    b.add(mesh.geometry, mesh.material as THREE.Material, mesh.matrix, { cast: true, receive: true });
    mesh.removeFromParent();
  }
  b.build(jaw);
}
