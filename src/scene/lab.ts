import * as THREE from 'three';
import type { Materials } from './materials';
import { mesh, box, rbox, cyl, boxOn, group } from './build';
import { ROOM, HALF_W, HALF_D, BENCH, PEDESTAL, ROBOT_BASE, OPERATOR_SPOT, GUARD } from '../config/cellLayout';
import { TextGroup } from '../ui/text';
import { BRAND } from '../config/brand';

export interface LabHandles {
  clock: { hour: THREE.Object3D; minute: THREE.Object3D; second: THREE.Object3D };
}

/** Room shell, central bench and peripheral set dressing. Static parts are batched by the caller. */
export function buildLab(root: THREE.Object3D, M: Materials): LabHandles {
  buildRoom(root, M);
  buildBench(root, M);
  buildFloorMarkings(root, M);
  buildFumeHood(root, M);
  buildBiosafetyCabinet(root, M);
  buildSideBench(root, M);
  buildStool(root, M, 2.0, 1.55);
  buildPoster(root, M);
  const clock = buildClock(root, M);
  return { clock };
}

// ---------------------------------------------------------------------------
function buildRoom(root: THREE.Object3D, M: Materials) {
  const g = group(root, 0, 0, 0, 0, 'room');
  const T = 0.05; // wall thickness (outside the room)
  const DADO = 1.0;

  const floor = mesh(new THREE.PlaneGeometry(ROOM.width, ROOM.depth), M.floor, g, 0, 0, 0, -Math.PI / 2);
  floor.receiveShadow = true;

  // Walls: dado (lower, mid grey) + upper (white) + skirting + dado rail.
  const walls: Array<{ len: number; x: number; z: number; ry: number }> = [
    { len: ROOM.width, x: 0, z: -HALF_D, ry: 0 }, // far
    { len: ROOM.width, x: 0, z: HALF_D, ry: Math.PI }, // back (behind learner)
    { len: ROOM.depth, x: -HALF_W, z: 0, ry: Math.PI / 2 }, // left
    { len: ROOM.depth, x: HALF_W, z: 0, ry: -Math.PI / 2 }, // right
  ];
  for (const w of walls) {
    const wg = group(g, w.x, 0, w.z, w.ry);
    // local +z points into the room
    mesh(box(w.len, DADO, T), M.dado, wg, 0, DADO / 2, -T / 2);
    mesh(box(w.len, ROOM.height - DADO, T), M.wall, wg, 0, DADO + (ROOM.height - DADO) / 2, -T / 2);
    mesh(box(w.len, 0.1, 0.012), M.skirting, wg, 0, 0.05, 0.006);
    mesh(box(w.len, 0.025, 0.018), M.aluminium, wg, 0, DADO, 0.009);
  }

  // Ceiling, T-bar grid and recessed light panels.
  mesh(new THREE.PlaneGeometry(ROOM.width, ROOM.depth), M.ceiling, g, 0, ROOM.height, 0, Math.PI / 2);
  for (let x = -HALF_W + 0.5; x < HALF_W; x += 0.6) mesh(box(0.02, 0.006, ROOM.depth), M.ceilingGrid, g, x, ROOM.height - 0.003, 0);
  for (let z = -HALF_D + 0.5; z < HALF_D; z += 0.6) mesh(box(ROOM.width, 0.006, 0.02), M.ceilingGrid, g, 0, ROOM.height - 0.003, z);
  const panels: Array<[number, number]> = [
    [-2.2, -1.3], [0, -1.3], [2.2, -1.3],
    [-2.2, 1.1], [0, 1.1], [2.2, 1.1],
    [0, -0.1],
  ];
  for (const [x, z] of panels) {
    mesh(box(0.62, 0.012, 1.22), M.aluminium, g, x, ROOM.height - 0.006, z);
    mesh(box(0.58, 0.004, 1.18), M.lightPanel, g, x, ROOM.height - 0.013, z);
  }

  // Door on the back wall (behind the learner) for orientation.
  const dg = group(g, 2.3, 0, HALF_D, Math.PI);
  mesh(box(1.06, 2.16, 0.06), M.frame, dg, 0, 1.08, 0.0);
  mesh(box(0.96, 2.1, 0.045), M.instrumentGrey, dg, 0, 1.05, 0.015);
  mesh(box(0.22, 0.75, 0.05), M.glass, dg, 0.22, 1.45, 0.02);
  mesh(box(0.16, 0.022, 0.03), M.stainless, dg, -0.36, 1.02, 0.06);
  // Push plate and signage strip by the door.
  mesh(box(0.3, 0.06, 0.004), M.brandGreen, dg, 0, 1.75, 0.04);
}

// ---------------------------------------------------------------------------
function buildBench(root: THREE.Object3D, M: Materials) {
  const g = group(root, BENCH.x, 0, BENCH.z, 0, 'bench');
  const W = BENCH.width, D = BENCH.depth, H = BENCH.topY, TT = BENCH.topThickness;
  const LEG = 0.05;

  // Trespa-style top with dark phenolic core visible on the edge.
  const top = mesh(rbox(W, TT, D, 0.004), M.trespa, g, 0, H - TT / 2, 0);
  top.receiveShadow = true;
  mesh(box(W - 0.01, 0.004, D - 0.01), M.frameDark, g, 0, H - TT * 0.55, 0);

  // Grey powder-coated frame: legs, aprons, lower stretchers, feet.
  const lx = W / 2 - 0.06, lz = D / 2 - 0.06;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    mesh(box(LEG, H - TT - 0.04, LEG), M.frame, g, sx * lx, (H - TT - 0.04) / 2 + 0.04, sz * lz);
    mesh(cyl(0.022, 0.026, 0.04, 12), M.rubber, g, sx * lx, 0.02, sz * lz);
  }
  for (const sz of [-1, 1]) mesh(box(W - 0.12, 0.06, 0.03), M.frame, g, 0, H - TT - 0.03, sz * lz);
  for (const sx of [-1, 1]) mesh(box(0.03, 0.06, D - 0.12), M.frame, g, sx * lx, H - TT - 0.03, 0);
  for (const sz of [-1, 1]) mesh(box(W - 0.12, 0.04, 0.03), M.frame, g, 0, 0.16, sz * lz);
  // Lower shelf with the robot controller cabinet on it.
  mesh(box(W - 0.14, 0.02, D - 0.14), M.trespa, g, 0, 0.19, 0);
  const ctrl = group(g, -0.45, 0.2, -0.05);
  boxOn(M.instrumentGrey, ctrl, 0.52, 0.42, 0.55, 0, 0, 0, 0.01, true);
  mesh(box(0.42, 0.3, 0.005), M.instrumentDark, ctrl, 0, 0.23, 0.278);
  mesh(box(0.1, 0.05, 0.004), M.screenGlass, ctrl, 0.12, 0.33, 0.282);
  for (let i = 0; i < 6; i++) mesh(box(0.3, 0.006, 0.004), M.frameDark, ctrl, -0.03, 0.12 + i * 0.025, 0.282);
  // Network/IO box.
  boxOn(M.instrumentShell, g, 0.3, 0.14, 0.3, 0.45, 0.2, -0.1, 0.01);

  // Robot pedestal: machined plate on a grey riser.
  const ped = group(root, ROBOT_BASE.x, BENCH.topY, ROBOT_BASE.z, 0, 'pedestal');
  boxOn(M.frameDark, ped, PEDESTAL.size, PEDESTAL.height - 0.012, PEDESTAL.size, 0, 0, 0, 0.006, true);
  boxOn(M.aluminium, ped, PEDESTAL.size + 0.01, 0.012, PEDESTAL.size + 0.01, 0, PEDESTAL.height - 0.012, 0, 0.003);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    mesh(cyl(0.007, 0.007, 0.006, 10), M.stainless, ped, sx * 0.13, PEDESTAL.height + 0.003, sz * 0.13);
  }

  // Cable management: arm umbilical exits the rear of the pedestal into a
  // covered trunking along the back edge, then down the rear leg in a wrap.
  const backZ = -D / 2 + 0.05;
  mesh(box(W - 0.2, 0.05, 0.06), M.aluminium, g, 0, H + 0.025, backZ);
  mesh(box(W - 0.2, 0.006, 0.065), M.instrumentGrey, g, 0, H + 0.053, backZ);
  const umb = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, H + 0.04, -0.14),
    new THREE.Vector3(0, H + 0.03, -0.3),
    new THREE.Vector3(0, H + 0.035, backZ + 0.02),
  ]);
  mesh(new THREE.TubeGeometry(umb, 16, 0.016, 8), M.rubber, g, 0, 0, 0, 0, 0, 0, true);
  const drop = new THREE.CatmullRomCurve3([
    new THREE.Vector3(lx - 0.05, H, -lz - 0.02),
    new THREE.Vector3(lx - 0.03, H * 0.6, -lz - 0.035),
    new THREE.Vector3(lx - 0.05, 0.25, -lz - 0.03),
    new THREE.Vector3(lx - 0.12, 0.2, -lz + 0.05),
  ]);
  mesh(new THREE.TubeGeometry(drop, 20, 0.018, 8), M.rubber, g);
  for (let i = 0; i < 5; i++) mesh(cyl(0.022, 0.022, 0.012, 10), M.frameDark, g, lx - 0.04, 0.35 + i * 0.12, -lz - 0.03);

  // Low guarding on the bench perimeter: aluminium extrusion + Perspex infill.
  const gx = W / 2 - GUARD.inset, gz = D / 2 - GUARD.inset, gh = GUARD.height;
  const R = 0.022; // extrusion section
  const post = (x: number, z: number) => mesh(box(R, gh, R), M.aluminium, g, x, H + gh / 2, z);
  for (const x of [-gx, 0, gx]) { post(x, gz); post(x, -gz); }
  for (const z of [gz, -gz]) {
    mesh(box(2 * gx, R, R), M.aluminium, g, 0, H + gh - R / 2, z);
    mesh(box(2 * gx, 0.012, R), M.aluminium, g, 0, H + 0.006, z);
    mesh(new THREE.PlaneGeometry(2 * gx - R, gh - R - 0.012), M.perspex, g, 0, H + gh / 2 - 0.005, z);
  }
  for (const x of [gx, -gx]) {
    mesh(box(R, R, 2 * gz), M.aluminium, g, x, H + gh - R / 2, 0);
    mesh(box(R, 0.012, 2 * gz), M.aluminium, g, x, H + 0.006, 0);
    mesh(new THREE.PlaneGeometry(2 * gz - R, gh - R - 0.012), M.perspex, g, x, H + gh / 2 - 0.005, 0, 0, Math.PI / 2);
  }
}

// ---------------------------------------------------------------------------
function buildFloorMarkings(root: THREE.Object3D, M: Materials) {
  const g = group(root, 0, 0.0015, 0, 0, 'floorMarkings');
  // Safety tape around the bench footprint, 0.45 m out.
  const ox = BENCH.width / 2 + 0.45, oz = BENCH.depth / 2 + 0.45, wTape = 0.05;
  const cz = BENCH.z;
  mesh(box(2 * ox + wTape, 0.002, wTape), M.safetyYellow, g, 0, 0, cz + oz);
  mesh(box(2 * ox + wTape, 0.002, wTape), M.safetyYellow, g, 0, 0, cz - oz);
  mesh(box(wTape, 0.002, 2 * oz), M.safetyYellow, g, ox, 0, cz);
  mesh(box(wTape, 0.002, 2 * oz), M.safetyYellow, g, -ox, 0, cz);

  // Operator position marker: square outline with a direction chevron.
  const og = group(g, OPERATOR_SPOT.x, 0.001, OPERATOR_SPOT.z + 0.05);
  const S = 0.62, b = 0.035;
  mesh(box(S, 0.002, b), M.floorDecal, og, 0, 0, -S / 2);
  mesh(box(S, 0.002, b), M.floorDecal, og, 0, 0, S / 2);
  mesh(box(b, 0.002, S), M.floorDecal, og, -S / 2, 0, 0);
  mesh(box(b, 0.002, S), M.floorDecal, og, S / 2, 0, 0);
  const chev = new THREE.Shape();
  // Shape +Y maps to world -Z (toward the bench) under the -90° X rotation.
  chev.moveTo(-0.09, 0); chev.lineTo(0, 0.08); chev.lineTo(0.09, 0); chev.lineTo(0.09, -0.035);
  chev.lineTo(0, 0.045); chev.lineTo(-0.09, -0.035); chev.closePath();
  mesh(new THREE.ShapeGeometry(chev), M.floorDecal, og, 0, 0.002, -0.17, -Math.PI / 2);

  const tg = new TextGroup();
  tg.position.set(OPERATOR_SPOT.x, 0.004, OPERATOR_SPOT.z + 0.27);
  tg.rotation.x = -Math.PI / 2;
  tg.addText({ text: 'OPERATOR POSITION', size: 0.04, font: 'mono', color: 0x5c6567, anchorX: 'center', anchorY: 'middle' });
  tg.userData.dynamic = true;
  root.add(tg);
}

// ---------------------------------------------------------------------------
function buildFumeHood(root: THREE.Object3D, M: Materials) {
  const W = 1.2, D = 0.8;
  const g = group(root, 2.8, 0, -HALF_D + D / 2, 0, 'fumeHood');
  // Base cabinets.
  boxOn(M.instrumentShell, g, W, 0.86, D - 0.04, 0, 0, 0.02, 0.006);
  mesh(box(0.004, 0.78, 0.005), M.frame, g, 0, 0.45, D / 2 + 0.001);
  for (const sx of [-1, 1]) mesh(box(0.12, 0.016, 0.02), M.stainless, g, sx * 0.08, 0.72, D / 2 + 0.01);
  // Worksurface.
  boxOn(M.trespa, g, W, 0.03, D, 0, 0.86, 0);
  // Hood body: sides, top, back baffle (dark), light strip.
  for (const sx of [-1, 1]) boxOn(M.instrumentShell, g, 0.08, 1.4, D, sx * (W / 2 - 0.04), 0.89, 0, 0.01);
  boxOn(M.instrumentShell, g, W, 0.38, D, 0, 2.29, 0, 0.01);
  mesh(box(W - 0.16, 1.4, 0.02), M.instrumentGrey, g, 0, 1.59, -D / 2 + 0.03);
  mesh(box(W - 0.2, 0.02, 0.06), M.lightPanelWarm, g, 0, 2.27, -0.1);
  // Sash: framed glass at ~400 mm opening.
  const sashY = 0.89 + 0.4;
  mesh(box(W - 0.16, 0.035, 0.03), M.aluminium, g, 0, sashY, D / 2 - 0.06);
  mesh(new THREE.PlaneGeometry(W - 0.16, 0.95), M.glass, g, 0, sashY + 0.495, D / 2 - 0.06);
  mesh(box(W - 0.16, 0.03, 0.03), M.aluminium, g, 0, sashY + 0.97, D / 2 - 0.06);
  // Airflow monitor.
  mesh(box(0.1, 0.07, 0.01), M.instrumentDark, g, W / 2 - 0.04, 1.75, D / 2 + 0.006);
  mesh(box(0.06, 0.025, 0.004), M.screenGlass, g, W / 2 - 0.04, 1.76, D / 2 + 0.012);
  // Exhaust duct to ceiling.
  mesh(cyl(0.12, 0.12, 0.16, 20), M.aluminium, g, 0, 2.75, -0.1);
}

// ---------------------------------------------------------------------------
function buildBiosafetyCabinet(root: THREE.Object3D, M: Materials) {
  const W = 1.3, D = 0.8;
  // Against the left wall, facing +X.
  const g = group(root, -HALF_W + D / 2, 0, -1.0, Math.PI / 2, 'bsc');
  // Stand.
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) mesh(box(0.04, 0.7, 0.04), M.frame, g, sx * (W / 2 - 0.08), 0.35, sz * (D / 2 - 0.08));
  mesh(box(W - 0.12, 0.03, 0.03), M.frame, g, 0, 0.12, D / 2 - 0.08);
  // Cabinet body.
  boxOn(M.instrumentShell, g, W, 0.26, D, 0, 0.7, 0, 0.015);
  boxOn(M.instrumentShell, g, W, 0.42, D, 0, 1.68, -0.02, 0.015);
  for (const sx of [-1, 1]) boxOn(M.instrumentShell, g, 0.08, 0.74, D - 0.06, sx * (W / 2 - 0.04), 0.94, -0.03, 0.01);
  mesh(box(W - 0.16, 0.74, 0.02), M.instrumentGrey, g, 0, 1.31, -D / 2 + 0.04);
  boxOn(M.stainless, g, W - 0.16, 0.012, D - 0.12, 0, 0.955, -0.03);
  // Front grille.
  mesh(box(W - 0.18, 0.04, 0.012), M.frameDark, g, 0, 0.94, D / 2 - 0.04);
  // Sloped sash.
  mesh(new THREE.PlaneGeometry(W - 0.16, 0.56), M.glass, g, 0, 1.43, D / 2 - 0.13, -0.18);
  // Control panel strip.
  mesh(box(W - 0.1, 0.12, 0.012), M.instrumentDark, g, 0, 1.97, D / 2 - 0.015);
  mesh(box(0.18, 0.06, 0.004), M.screenGlass, g, -0.35, 1.97, D / 2 - 0.007);
  for (let i = 0; i < 4; i++) mesh(cyl(0.012, 0.012, 0.006, 12), M.instrumentGrey, g, 0.1 + i * 0.08, 1.97, D / 2 - 0.006, Math.PI / 2);
}

// ---------------------------------------------------------------------------
function buildSideBench(root: THREE.Object3D, M: Materials) {
  const D = 0.7, L = 2.9, z0 = -1.5;
  const zc = z0 + L / 2;
  // Run along the right wall, worktop facing -X.
  const g = group(root, HALF_W - D / 2, 0, zc, -Math.PI / 2, 'sideBench');
  // In local frame: x along the run, +z toward the room.
  boxOn(M.instrumentShell, g, L, 0.84, D - 0.06, 0, 0.05, -0.02, 0.006);
  boxOn(M.skirting, g, L - 0.02, 0.05, D - 0.12, 0, 0, -0.04);
  for (let i = -2; i <= 2; i++) mesh(box(0.004, 0.76, 0.005), M.frame, g, i * 0.58, 0.47, D / 2 - 0.05 + 0.001);
  for (let i = -2; i < 3; i++) mesh(box(0.12, 0.014, 0.02), M.stainless, g, i * 0.58 + 0.29, 0.8, D / 2 - 0.04);
  boxOn(M.trespa, g, L, 0.03, D, 0, 0.89, 0);
  // Upstand.
  boxOn(M.trespa, g, L, 0.1, 0.015, 0, 0.92, -D / 2 + 0.008);

  // Sink: stainless basin set into the top, gooseneck tap.
  const sx = 0.9;
  boxOn(M.stainless, g, 0.55, 0.004, 0.45, sx, 0.921, 0.02);
  mesh(box(0.48, 0.01, 0.38), M.instrumentDark, g, sx, 0.921, 0.02);
  mesh(cyl(0.018, 0.022, 0.12, 14), M.stainless, g, sx, 0.98, -0.24);
  const tap = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0.22, 0.02), new THREE.Vector3(0, 0.27, 0.12), new THREE.Vector3(0, 0.2, 0.2),
  ]);
  mesh(new THREE.TubeGeometry(tap, 16, 0.011, 8), M.stainless, g, sx, 1.03, -0.24);
  mesh(box(0.08, 0.012, 0.012), M.stainless, g, sx, 1.07, -0.24);

  // Plate hotel: vertical rack with a few plates stored.
  const hg = group(g, -0.9, 0.92, -0.05);
  const HW = 0.18, HD = 0.22, HH = 0.55;
  for (const px of [-1, 1]) for (const pz of [-1, 1]) mesh(box(0.016, HH, 0.016), M.aluminium, hg, px * HW / 2, HH / 2, pz * HD / 2);
  boxOn(M.frameDark, hg, HW + 0.03, 0.015, HD + 0.03, 0, 0, 0);
  boxOn(M.frameDark, hg, HW + 0.03, 0.012, HD + 0.03, 0, HH, 0);
  for (let i = 0; i < 12; i++) {
    const y = 0.035 + i * 0.042;
    for (const px of [-1, 1]) mesh(box(0.012, 0.003, HD), M.aluminium, hg, px * (HW / 2 - 0.006), y, 0);
    if ([0, 1, 2, 4, 5, 8].includes(i)) boxOn(M.glass, hg, 0.128, 0.0143, 0.0855, 0, y + 0.0015, 0.01);
  }

  // Wall cabinet above the bench (closed, no clutter).
  boxOn(M.instrumentShell, g, 1.2, 0.6, 0.35, -0.2, 1.55, -D / 2 + 0.175, 0.008);
  mesh(box(0.004, 0.56, 0.005), M.frame, g, -0.2, 1.85, -D / 2 + 0.355);
}

// ---------------------------------------------------------------------------
function buildStool(root: THREE.Object3D, M: Materials, x: number, z: number) {
  const g = group(root, x, 0, z, 0.4, 'stool');
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    mesh(box(0.27, 0.03, 0.04), M.frameDark, g, Math.cos(a) * 0.13, 0.06, Math.sin(a) * 0.13, 0, -a, 0);
    mesh(new THREE.SphereGeometry(0.025, 10, 8), M.rubber, g, Math.cos(a) * 0.26, 0.025, Math.sin(a) * 0.26);
  }
  mesh(cyl(0.03, 0.04, 0.08, 14), M.frameDark, g, 0, 0.1, 0);
  mesh(cyl(0.022, 0.022, 0.4, 14), M.stainless, g, 0, 0.34, 0);
  mesh(new THREE.TorusGeometry(0.19, 0.012, 8, 24), M.stainless, g, 0, 0.32, 0, Math.PI / 2);
  mesh(cyl(0.19, 0.17, 0.07, 24), M.stoolSeat, g, 0, 0.6, 0);
}

// ---------------------------------------------------------------------------
function buildPoster(root: THREE.Object3D, M: Materials) {
  const W = 0.6, H = 0.84;
  const g = group(root, -HALF_W + 0.006, 1.45, 0.85, Math.PI / 2, 'poster');
  mesh(box(W + 0.02, H + 0.02, 0.008), M.aluminium, g, 0, 0, 0);
  mesh(box(W, H, 0.002), M.paper, g, 0, 0, 0.005);
  mesh(box(W, 0.13, 0.002), M.brandGreen, g, 0, H / 2 - 0.065, 0.0062);
  mesh(box(0.2, 0.004, 0.001), M.brandTrim, g, -W / 2 + 0.14, -H / 2 + 0.07, 0.0065);

  const t = new TextGroup();
  t.position.set(-W / 2 + 0.04, H / 2, 0.008);
  const lines: Array<[string, boolean]> = [
    ['Hold the enabling device in its middle position to jog. Release or squeeze fully to stop.', false],
    ['Teach in Manual reduced speed. Never enter the guarded zone while the arm is enabled.', false],
    ['Use approach points so the gripper always descends vertically onto a plate.', false],
    ['After an emergency stop, find the cause before you reset.', false],
    ['Report every fault to the cell owner.', true],
  ];
  t.addText({ text: 'Robot cell safety', size: 0.042, font: 'semibold', color: BRAND.white, position: [0, -0.04, 0] });
  let y = -0.175;
  lines.forEach(([s, strong], i) => {
    t.addText({ text: `${i + 1}`, size: 0.03, font: 'semibold', color: BRAND.cbreGreen, position: [0, y, 0] });
    const tx = t.addText({
      text: s, size: 0.022, font: strong ? 'medium' : 'body', color: BRAND.darkGrey,
      maxWidth: W - 0.12, lineHeight: 1.3, position: [0.04, y + 0.002, 0],
    });
    void tx;
    y -= 0.115;
  });
  t.addText({ text: 'SCIENTIFIC SOLUTIONS', size: 0.016, font: 'mono', color: BRAND.darkGrey, position: [0, -H + 0.085, 0] });
  t.userData.dynamic = true;
  g.add(t);
}

// ---------------------------------------------------------------------------
function buildClock(root: THREE.Object3D, M: Materials): LabHandles['clock'] {
  const R = 0.15;
  const g = group(root, 0, 2.43, -HALF_D + 0.03, 0, 'clock');
  mesh(new THREE.TorusGeometry(R, 0.012, 10, 40), M.aluminium, g, 0, 0, 0);
  mesh(cyl(R, R, 0.02, 40), M.paper, g, 0, 0, -0.005, Math.PI / 2);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const len = i % 3 === 0 ? 0.03 : 0.016;
    mesh(box(0.005, len, 0.002), M.frameDark, g, Math.sin(a) * (R - 0.02 - len / 2), Math.cos(a) * (R - 0.02 - len / 2), 0.006, 0, 0, -a);
  }
  const hand = (len: number, w: number, z: number, mat: THREE.Material) => {
    const pivot = new THREE.Group();
    pivot.position.z = z;
    pivot.userData.dynamic = true;
    const m = new THREE.Mesh(box(w, len, 0.002), mat);
    m.position.y = len / 2 - 0.015;
    pivot.add(m);
    g.add(pivot);
    return pivot;
  };
  const hour = hand(0.08, 0.008, 0.008, M.frameDark);
  const minute = hand(0.12, 0.006, 0.010, M.frameDark);
  const second = hand(0.125, 0.0025, 0.012, M.brandGreen);
  mesh(cyl(0.008, 0.008, 0.006, 12), M.frameDark, g, 0, 0, 0.014, Math.PI / 2);
  return { hour, minute, second };
}

export function updateClock(c: LabHandles['clock'], now = new Date()) {
  const s = now.getSeconds() + now.getMilliseconds() / 1000;
  const m = now.getMinutes() + s / 60;
  const h = (now.getHours() % 12) + m / 60;
  c.second.rotation.z = -(Math.floor(s) / 60) * Math.PI * 2;
  c.minute.rotation.z = -(m / 60) * Math.PI * 2;
  c.hour.rotation.z = -(h / 12) * Math.PI * 2;
}
