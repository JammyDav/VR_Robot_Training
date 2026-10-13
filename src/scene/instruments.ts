import * as THREE from 'three';
import type { Materials } from './materials';
import { mesh, box, rbox, cyl, group } from './build';
import { buildNest } from './nest';
import { BENCH, DISPENSER, READER, GUARD } from '../config/cellLayout';
import { SIGNAL } from '../config/brand';

export interface StatusLed {
  mesh: THREE.Mesh;
  material: THREE.MeshStandardMaterial;
}

function statusLed(parent: THREE.Object3D, x: number, y: number, z: number, ry: number): StatusLed {
  const material = new THREE.MeshStandardMaterial({ color: 0x223, emissive: SIGNAL.run, emissiveIntensity: 0.0, roughness: 0.3 });
  const m = mesh(new THREE.SphereGeometry(0.0055, 12, 8), material, parent, x, y, z, 0, ry, 0);
  m.userData.dynamic = true;
  return { mesh: m, material };
}

export interface DispenserHandles {
  root: THREE.Group;
  /** Plate seat frame (top of the nest datum, A1 to -X/-Z). */
  nest: THREE.Object3D;
  led: StatusLed;
}

/**
 * Generic benchtop reagent dispenser. Front (plate exit) faces +X toward the arm.
 * Plates are dispensed internally and slide out onto the presentation nest.
 */
export function buildDispenser(root: THREE.Object3D, M: Materials): DispenserHandles {
  const g = group(root, DISPENSER.x, BENCH.topY, DISPENSER.z, 0, 'dispenser');
  const W = DISPENSER.width, H = DISPENSER.height, D = DISPENSER.depth;
  const fx = W / 2;

  for (const sx of [-1, 1]) for (const sz of [-1, 1]) mesh(cyl(0.012, 0.012, 0.008, 10), M.rubber, g, sx * (W / 2 - 0.03), 0.004, sz * (D / 2 - 0.03));
  mesh(rbox(W, H - 0.008, D, 0.018, 3), M.instrumentShell, g, 0, 0.008 + (H - 0.008) / 2, 0, 0, 0, 0, true);
  // Contrast band around the base.
  mesh(rbox(W + 0.004, 0.03, D + 0.004, 0.012), M.instrumentGrey, g, 0, 0.023, 0);
  // Front bezel, exit slot, touchscreen.
  // Dark control fascia up top; white lower front carrying the plate exit.
  mesh(rbox(0.012, 0.13, D - 0.05, 0.005), M.instrumentDark, g, fx - 0.002, H - 0.09, 0);
  mesh(box(0.004, 0.075, 0.12), M.screenGlass, g, fx + 0.005, H - 0.09, 0.08);
  mesh(box(0.006, 0.034, 0.17), M.instrumentGrey, g, fx + 0.002, 0.036, 0);
  mesh(box(0.004, 0.022, 0.15), M.rubber, g, fx + 0.004, 0.036, 0);
  const led = statusLed(g, fx + 0.006, H - 0.09, -0.14, 0);

  // Reagent bottles on top with feed lines.
  for (const [bx, bz] of [[-0.09, -0.1], [-0.09, 0.03]] as const) {
    mesh(cyl(0.032, 0.032, 0.11, 20), M.glass, g, bx, H + 0.055, bz);
    mesh(cyl(0.03, 0.03, 0.07, 16), M.instrumentGrey, g, bx, H + 0.035, bz);
    mesh(cyl(0.016, 0.016, 0.02, 14), M.instrumentDark, g, bx, H + 0.12, bz);
    const line = new THREE.CatmullRomCurve3([
      new THREE.Vector3(bx, H + 0.13, bz),
      new THREE.Vector3(bx + 0.05, H + 0.15, bz),
      new THREE.Vector3(0.1, H + 0.04, bz * 0.5),
      new THREE.Vector3(0.12, H, bz * 0.5),
    ]);
    mesh(new THREE.TubeGeometry(line, 14, 0.003, 6), M.instrumentDark, g);
  }
  mesh(cyl(0.012, 0.012, 0.012, 12), M.instrumentDark, g, 0.12, H + 0.002, -0.015);

  // Presentation stage + nest in front of the exit slot.
  const nestLocalX = DISPENSER.nestX - DISPENSER.x;
  const stageX0 = fx - 0.005, stageX1 = nestLocalX + 0.095;
  mesh(rbox(stageX1 - stageX0, 0.02, 0.14, 0.004), M.instrumentGrey, g, (stageX0 + stageX1) / 2, 0.01, 0);
  const nest = buildNest(g, M);
  nest.position.set(nestLocalX, 0.026, 0);
  return { root: g, nest, led };
}

export interface ReaderHandles {
  root: THREE.Group;
  /** Moving tray carriage; its X is driven between `trayIn` and `trayOut` (local). */
  tray: THREE.Group;
  trayIn: number;
  trayOut: number;
  /** Plate seat frame on the tray. */
  nest: THREE.Object3D;
  led: StatusLed;
}

/** Generic benchtop plate reader. Front faces -X toward the arm; the tray extends along -X. */
export function buildReader(root: THREE.Object3D, M: Materials): ReaderHandles {
  const g = group(root, READER.x, BENCH.topY, READER.z, 0, 'reader');
  const W = READER.width, H = READER.height, D = READER.depth;
  const fx = -W / 2;
  const trayY = 0.098;

  for (const sx of [-1, 1]) for (const sz of [-1, 1]) mesh(cyl(0.012, 0.012, 0.008, 10), M.rubber, g, sx * (W / 2 - 0.03), 0.004, sz * (D / 2 - 0.03));
  mesh(rbox(W, H - 0.008, D, 0.02, 3), M.instrumentShell, g, 0, 0.008 + (H - 0.008) / 2, 0, 0, 0, 0, true);
  mesh(rbox(W - 0.06, 0.006, D - 0.06, 0.003), M.instrumentGrey, g, 0.01, H + 0.002, 0);
  mesh(rbox(W + 0.004, 0.026, D + 0.004, 0.012), M.instrumentGrey, g, 0, 0.021, 0);
  // Front bezel with tray aperture, display and power key.
  // Dark fascia band carrying the tray aperture; white shell above and below.
  mesh(rbox(0.012, 0.07, D - 0.04, 0.005), M.instrumentDark, g, fx + 0.002, trayY, 0);
  // Aperture clears tray + plate (plate top is ~20 mm above the carriage).
  mesh(box(0.004, 0.046, 0.16), M.rubber, g, fx - 0.005, trayY + 0.009, 0);
  mesh(box(0.004, 0.04, 0.08), M.screenGlass, g, fx - 0.005, 0.168, 0.12);
  mesh(cyl(0.008, 0.008, 0.004, 14), M.instrumentGrey, g, fx - 0.005, 0.165, -0.15, 0, 0, Math.PI / 2);
  const led = statusLed(g, fx - 0.006, 0.165, -0.12, 0);
  // Rear vents.
  for (let i = 0; i < 6; i++) mesh(box(0.004, 0.008, 0.2), M.frameDark, g, W / 2 + 0.001, 0.06 + i * 0.022, 0);

  // Tray: carriage + nest. Dynamic so it can slide.
  const trayOut = READER.trayOutX - READER.x;
  const trayIn = 0.03;
  const tray = new THREE.Group();
  tray.userData.dynamic = true;
  tray.position.set(trayIn, trayY, 0);
  g.add(tray);
  const carrier = new THREE.Mesh(box(0.15, 0.006, 0.11), M.instrumentDark);
  carrier.position.y = -0.003;
  carrier.castShadow = true;
  carrier.receiveShadow = true;
  tray.add(carrier);
  const arm = new THREE.Mesh(box(0.2, 0.004, 0.11), M.instrumentGrey);
  arm.position.set(0.17, -0.005, 0);
  tray.add(arm);
  const nest = buildNest(tray, M, M.instrumentGrey);
  nest.position.y = 0.006;
  nest.scale.y = 0.85;
  nest.traverse((o) => { o.userData.dynamic = true; });
  return { root: g, tray, trayIn, trayOut, nest, led };
}

interface BeaconTier {
  lens: THREE.MeshStandardMaterial;
  halo: THREE.Mesh;
  lit: THREE.Color;
  dim: THREE.Color;
}

export interface BeaconHandles {
  red: BeaconTier;
  amber: BeaconTier;
  green: BeaconTier;
}

/**
 * Three-tier stack light on a post at the back-right corner of the guarding.
 * Unlit lenses are dark and smoky so the lit tier stands out in a bright room;
 * the lit tier also gets a soft additive halo so it reads from across the lab.
 */
export function buildBeacon(root: THREE.Object3D, M: Materials): BeaconHandles {
  const x = BENCH.x + BENCH.width / 2 - GUARD.inset;
  const z = BENCH.z - BENCH.depth / 2 + GUARD.inset;
  const g = group(root, x, BENCH.topY + GUARD.height, z, 0, 'beacon');
  mesh(cyl(0.012, 0.012, 0.25, 12), M.aluminium, g, 0, 0.125, 0);
  mesh(cyl(0.032, 0.032, 0.02, 20), M.instrumentDark, g, 0, 0.26, 0);
  const haloGeo = new THREE.SphereGeometry(0.055, 16, 12);
  const tier = (color: number, y: number): BeaconTier => {
    const lit = new THREE.Color(color);
    const dim = lit.clone().lerp(new THREE.Color(0x16191a), 0.86);
    const lens = new THREE.MeshStandardMaterial({ color: dim, emissive: lit, emissiveIntensity: 0, roughness: 0.2 });
    const m = mesh(cyl(0.03, 0.03, 0.05, 24), lens, g, 0, y, 0);
    m.userData.dynamic = true;
    mesh(cyl(0.031, 0.031, 0.004, 24), M.instrumentGrey, g, 0, y + 0.027, 0);
    const halo = new THREE.Mesh(haloGeo, new THREE.MeshBasicMaterial({
      color: lit, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    halo.position.y = y;
    halo.scale.set(1, 0.65, 1);
    halo.renderOrder = 3;
    halo.visible = false;
    halo.userData.dynamic = true;
    g.add(halo);
    return { lens, halo, lit, dim };
  };
  const green = tier(SIGNAL.run, 0.297);
  const amber = tier(SIGNAL.manual, 0.351);
  const red = tier(SIGNAL.fault, 0.405);
  mesh(cyl(0.026, 0.032, 0.018, 20), M.instrumentDark, g, 0, 0.44, 0);
  return { red, amber, green };
}

export type BeaconState = 'off' | 'run' | 'manual' | 'fault';

function setTier(t: BeaconTier, on: boolean) {
  t.lens.color.copy(on ? t.lit : t.dim);
  t.lens.emissiveIntensity = on ? 1.3 : 0;
  t.halo.visible = on;
}

export function setBeacon(b: BeaconHandles, state: BeaconState, t: number) {
  setTier(b.green, state === 'run');
  setTier(b.amber, state === 'manual');
  // Fault / E-stop flashes at 2 Hz, fully on / fully off.
  setTier(b.red, state === 'fault' && Math.floor(t * 4) % 2 === 0);
}
