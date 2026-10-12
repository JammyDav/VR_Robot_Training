import '@fontsource/inter/400.css';
import '@fontsource/inter/600.css';
import '@fontsource/space-mono/400.css';
import * as THREE from 'three';
import { createMaterials } from './scene/materials';
import { StaticBatcher } from './scene/StaticBatcher';
import { buildLab, updateClock } from './scene/lab';
import { buildDispenser, buildReader, buildBeacon, setBeacon } from './scene/instruments';
import { buildBoards } from './scene/boards';
import { setupLighting } from './scene/lighting';
import { setupXR } from './xr/xrSession';
import { setupDesktopCamera } from './input/desktopCamera';
import { PerfHud } from './debug/perfHud';

const container = document.getElementById('app')!;
const vrButton = document.getElementById('enter-vr') as HTMLButtonElement;

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.03, 30);
scene.add(camera);

setupLighting(scene, renderer);

// --- Build the lab: compose as Object3D trees, then flatten statics. -------
const M = createMaterials();
const staging = new THREE.Group();
scene.add(staging);
const lab = buildLab(staging, M);
const dispenser = buildDispenser(staging, M);
const reader = buildReader(staging, M);
const beacon = buildBeacon(staging, M);
buildBoards(staging, M);

const batcher = new StaticBatcher();
batcher.absorb(staging);
const staticRoot = new THREE.Group();
staticRoot.name = 'static';
scene.add(staticRoot);
batcher.build(staticRoot);

// --- Views -----------------------------------------------------------------
const desktop = setupDesktopCamera(camera, renderer.domElement);
const xr = setupXR(renderer, scene, camera, vrButton);
const hud = new PerfHud(document.getElementById('perf')!, camera);

// Expose for debugging in the browser console.
Object.assign(window as object, { __sim: { scene, renderer, camera, dispenser, reader, xr } });

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- Loop ------------------------------------------------------------------
// Frame time from performance.now(): rAF and XR frame timestamps use different
// clocks on some browsers, so they are not mixed. Clamped against stalls.
let last = performance.now();
let elapsed = 0;
const loopStats = { frames: 0 };
(window as unknown as { __sim: object }).__sim = { ...(window as unknown as { __sim: object }).__sim, loopStats, elapsed: () => elapsed };
renderer.setAnimationLoop(() => {
  const now = performance.now();
  const dt = Math.min(Math.max((now - last) / 1000, 0), 0.1);
  last = now;
  elapsed += dt;
  loopStats.frames++;

  if (!xr.isPresenting()) desktop.controls.update();
  updateClock(lab.clock);
  setBeacon(beacon, 'manual', elapsed);
  dispenser.led.material.emissiveIntensity = 1.2;
  reader.led.material.emissiveIntensity = 1.2;
  // Stage 1 demo: tray glides in and out so the dynamic path is exercised.
  const s = 0.5 - 0.5 * Math.cos(elapsed * 0.6);
  reader.tray.position.x = THREE.MathUtils.lerp(reader.trayIn, reader.trayOut, s);

  renderer.render(scene, camera);
  hud.sample(dt, renderer.info, xr.isPresenting());
});

const loading = document.getElementById('loading')!;
requestAnimationFrame(() => {
  loading.style.opacity = '0';
  setTimeout(() => loading.remove(), 450);
});
