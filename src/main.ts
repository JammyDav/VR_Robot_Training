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
import { buildRobot } from './scene/robotRig';
import { Controller } from './core/Controller';
import { setupXR } from './xr/xrSession';
import { setupDesktopCamera } from './input/desktopCamera';
import { PendantLogic } from './input/PendantLogic';
import { emptyInput } from './input/PendantInput';
import { readXRInput, xrControllersReady } from './input/xrInput';
import { DesktopInput } from './input/desktopInput';
import { buildStatus } from './ui/statusModel';
import { createDesktopStatus } from './ui/desktopStatus';
import { createXRStatus } from './ui/xrStatus';
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

// --- Robot: core state + visual rig -----------------------------------------
const ctl = new Controller();
const robot = ctl.robot;
const rig = buildRobot(scene);
rig.triad.visible = false;

// --- Views and input ---------------------------------------------------------
const desktop = setupDesktopCamera(camera, renderer.domElement);
const xr = setupXR(renderer, scene, camera, vrButton);
const hud = new PerfHud(document.getElementById('perf')!, camera);
const logic = new PendantLogic(ctl);
const desktopInput = new DesktopInput();
const input = emptyInput();
const desktopStatus = createDesktopStatus(document.getElementById('jog')!);
const xrStatus = createXRStatus(xr);

// Panel actions (the on-screen pendant takes these over in stage 4).
window.addEventListener('keydown', (e) => {
  if (e.repeat || e.target instanceof HTMLInputElement) return;
  if (e.code === 'Escape') ctl.triggerEstop();
  else if (e.code === 'KeyR') ctl.resetEstop();
  else if (e.code === 'KeyM') ctl.cycleMode();
  else if (e.code === 'KeyT') rig.triad.visible = !rig.triad.visible;
});

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

// Exposed for debugging in the browser console.
Object.assign(window as object, {
  __sim: { scene, renderer, camera, desktop, dispenser, reader, xr, ctl, robot, rig, logic, desktopInput, loopStats, elapsed: () => elapsed },
});

renderer.setAnimationLoop(() => {
  const now = performance.now();
  const dt = Math.min(Math.max((now - last) / 1000, 0), 0.1);
  last = now;
  elapsed += dt;
  loopStats.frames++;

  // One input path per frame, both into the same pendant logic and controller.
  if (xrControllersReady(xr)) readXRInput(xr, input);
  else desktopInput.read(input);
  logic.update(dt, input);
  ctl.update(dt);
  rig.update(robot.q, robot.gripper.halfGap);

  if (!xr.isPresenting()) desktop.controls.update();
  updateClock(lab.clock);
  setBeacon(beacon, ctl.beacon, elapsed);
  dispenser.led.material.emissiveIntensity = 1.2;
  reader.led.material.emissiveIntensity = 1.2;
  if (loopStats.frames % 3 === 0) {
    const status = buildStatus(ctl, logic);
    if (xr.isPresenting()) xrStatus.update(status);
    else desktopStatus.render(status, ctl);
  }

  renderer.render(scene, camera);
  hud.sample(dt, renderer.info, xr.isPresenting());
});

const loading = document.getElementById('loading')!;
requestAnimationFrame(() => {
  loading.style.opacity = '0';
  setTimeout(() => loading.remove(), 450);
});
