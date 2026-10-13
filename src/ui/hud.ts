import * as THREE from 'three';
import { Panel, setText } from './kit/Panel';
import { Pointer, panelTarget } from './kit/Pointer';
import { PendantPanel, PENDANT_W, PENDANT_H } from './pendantPanel';
import { ControllerMap, MAP_H } from './controllerMap';
import { Tutorial } from './tutorial';
import { RayVisual } from '../xr/ray';
import { pulse, HAPTIC } from '../fx/haptics';
import type { Controller } from '../core/Controller';
import type { PendantLogic } from '../input/PendantLogic';
import type { XRRig } from '../xr/xrSession';
import type { RobotRig } from '../scene/robotRig';
import type { BoardHandles } from '../scene/boards';

export interface HudDeps {
  ctl: Controller;
  logic: PendantLogic;
  xr: XRRig;
  rig: RobotRig;
  boards: BoardHandles;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  dom: HTMLElement;
}

const DOCK_DISTANCE = 0.5;

/** Pendant placement on the left controller. Tilt is about grip X: −π/2 = flat, face up. */
export const PENDANT_MOUNT = {
  offset: [0.045, 0.015, -0.075] as [number, number, number],
  tilt: -1.15 + Math.PI / 4, // ≈ 69° up from the controller's top face: faces the user with a relaxed, flatter wrist
};

/**
 * Owns every interactive surface: the pendant (on the left controller in XR,
 * docked on screen on desktop), the controller map, tutorial callouts, the
 * whiteboard tutorial toggle, and the gripper as a ray target.
 */
export function createHud(d: HudDeps) {
  const { ctl, xr, rig, scene, camera } = d;
  let mapOn = false;

  const pendant = new PendantPanel(ctl, d.logic, {
    toggleTriad: () => { rig.triad.visible = !rig.triad.visible; },
    toggleMap: () => { mapOn = !mapOn; },
    triadVisible: () => rig.triad.visible,
    mapVisible: () => mapOn,
    selectedPoint: () => null,
    contextHint: () => hint(ctl, xr.isPresenting()),
  });
  const map = new ControllerMap(ctl, () => !xr.isPresenting());

  // Pendant rig: pendant with the map stacked above it (origin = pendant top-left).
  const pendantRig = new THREE.Group();
  pendantRig.add(pendant.panel, map.panel);
  map.panel.position.set(0, MAP_H + 0.006, 0);

  // XR mount on the left grip (grip space: +X right, +Y up, −Z forward).
  // The pendant lies nearly flat like a tablet, to the RIGHT of the controller,
  // its far edge just ahead of the controller ring, sloping gently toward the face.
  const xrMount = new THREE.Group();
  xrMount.position.set(...PENDANT_MOUNT.offset);
  xrMount.rotation.set(PENDANT_MOUNT.tilt, 0, 0);
  // Desktop dock: child of the camera, bottom-left of the view.
  const dock = new THREE.Group();
  camera.add(dock);

  const tutorial = new Tutorial({
    ctl, xr, pendant: pendant.panel, camera, scene,
    isDesktop: () => !xr.isPresenting(),
    desktopDock: dock,
    desktopCalloutPos: new THREE.Vector3(PENDANT_W + 0.012, 0, 0),
    // VR: left half of the whiteboard, below the header. The right half is partly
    // hidden behind the arm from the operator spot.
    boardMount: d.boards.whiteboard,
    boardPos: new THREE.Vector3(0.0, -0.15, 0.002),
    boardScale: 7.0, // ≈ 0.9 × 0.6 m; body type ≈ 37 mm, legible from the operator spot
  });

  // Whiteboard: tutorial toggle in the lower-left of the board.
  const wbPanel = new Panel(0.86, 0.1, 0xfcfcfa);
  wbPanel.position.set(0, -0.99, 0.001);
  d.boards.whiteboard.add(wbPanel);
  const wbToggle = wbPanel.addButton({ id: 'tutorialToggle', label: '', x: 0, y: -0.005, w: 0.4, h: 0.09, size: 0.038, onClick: () => tutorial.toggle() });
  wbPanel.addButton({ id: 'tutorialRestart', label: 'Restart tutorial', x: 0.42, y: -0.005, w: 0.4, h: 0.09, size: 0.036, onClick: () => { tutorial.setEnabled(true); tutorial.restart(); } });

  // Gripper hover label.
  const gripLabel = new Panel(0.085, 0.016, 0x2a3033);
  const gripText = gripLabel.addText({ text: '', size: 0.0062, font: 'semibold', color: 0xffffff, anchorX: 'center', anchorY: 'middle', position: [0.0425, -0.008, 0] });
  gripLabel.setOverlay(true);
  gripLabel.visible = false;
  scene.add(gripLabel);
  let gripHover = false;

  // Pointer + targets.
  const pointer = new Pointer();
  pointer.add(panelTarget(pendant.panel));
  pointer.add(panelTarget(map.panel));
  pointer.add(panelTarget(tutorial.callout));
  pointer.add(panelTarget(wbPanel));
  pointer.add({
    object: rig.gripperProxy,
    enabled: () => !ctl.estop,
    onHover: (on) => { gripHover = on; rig.setGripperHighlight(on); },
    onClick: () => ctl.toggleGripper(),
  });
  pointer.onPress = (r) => {
    pulse(xr, 'right', ...HAPTIC.click);
    if (r.widget && 'flash' in r.widget) (r.widget as { flash(): void }).flash();
  };

  // Haptics for controller events.
  ctl.events.on('jogMode', () => pulse(xr, 'left', ...HAPTIC.modeChange));
  ctl.events.on('speed', () => pulse(xr, 'left', ...HAPTIC.modeChange));
  ctl.events.on('enable', (e) => { if (e.state === 'enabled') pulse(xr, 'left', 0.2, 15); });
  ctl.events.on('estop', (e) => { if (e.active) { pulse(xr, 'left', ...HAPTIC.fault); pulse(xr, 'right', ...HAPTIC.fault); } });
  ctl.robot.events.on('gripper', () => pulse(xr, 'right', ...HAPTIC.gripper));
  ctl.robot.events.on('jointLimit', () => pulse(xr, 'left', ...HAPTIC.limit));

  const ray = new RayVisual();

  // Desktop mouse pointer: hover follows the mouse; a click is a press without a drag.
  const mouse = new THREE.Vector2(-10, -10);
  let mouseClick = false;
  let downAt: { x: number; y: number } | null = null;
  d.dom.addEventListener('pointermove', (e) => {
    const r = d.dom.getBoundingClientRect();
    mouse.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  });
  d.dom.addEventListener('pointerdown', (e) => { if (e.button === 0) downAt = { x: e.clientX, y: e.clientY }; });
  d.dom.addEventListener('pointerup', (e) => {
    if (e.button === 0 && downAt && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) < 5) mouseClick = true;
    downAt = null;
  });
  d.dom.addEventListener('pointerleave', () => mouse.set(-10, -10));

  let mode: 'xr' | 'desktop' | null = null;
  let panelClock = 1;
  let laidOutAspect = NaN;
  const layoutDock = () => {
    if (!Number.isFinite(camera.aspect) || camera.aspect <= 0) return; // hidden tab at load: no size yet
    laidOutAspect = camera.aspect;
    const visH = 2 * DOCK_DISTANCE * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const visW = visH * camera.aspect;
    let s = (0.36 * visH) / PENDANT_H;
    s = Math.min(s, (0.92 * visW) / (PENDANT_W + 0.012 + 0.13 * 1.3));
    const margin = 0.03 * visH;
    dock.scale.setScalar(s);
    dock.position.set(-visW / 2 + margin, -visH / 2 + margin + PENDANT_H * s, -DOCK_DISTANCE);
  };
  window.addEventListener('resize', layoutDock);

  const origin = new THREE.Vector3();
  const dir = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const raycaster = new THREE.Raycaster();

  return {
    pendant, map, tutorial, pointer,
    toggleTutorial: () => tutorial.toggle(),
    update(dt: number, rTriggerDown: boolean) {
      const inXR = xr.isPresenting();
      const want = inXR ? 'xr' : 'desktop';
      if (want !== mode) {
        mode = want;
        if (inXR) {
          xrMount.add(pendantRig);
          pendantRig.position.set(0, 0, 0); // panel top-left at the mount; extends right and toward the user
          pendantRig.scale.setScalar(1);
          pendant.panel.setOverlay(false);
          map.panel.setOverlay(false);
        } else {
          dock.add(pendantRig);
          pendantRig.position.set(0, 0, 0);
          pendant.panel.setOverlay(true);
          map.panel.setOverlay(true);
          layoutDock();
        }
        pointer.clear();
      }
      if (!inXR && camera.aspect !== laidOutAspect) layoutDock();
      if (inXR) {
        const grip = xr.grips.left;
        if (grip && xrMount.parent !== grip) grip.add(xrMount);
      }
      map.panel.visible = mapOn;

      // Pointer ray.
      let down = false;
      if (inXR && xr.controllers.right) {
        const c = xr.controllers.right;
        c.getWorldPosition(origin);
        c.getWorldQuaternion(quat);
        dir.set(0, 0, -1).applyQuaternion(quat);
        down = rTriggerDown;
        ray.attach(c, scene);
      } else {
        raycaster.setFromCamera(mouse, camera);
        origin.copy(raycaster.ray.origin);
        dir.copy(raycaster.ray.direction);
        down = mouseClick;
        mouseClick = false;
      }
      const res = pointer.update(origin, dir, down);
      ray.update(inXR && !!xr.controllers.right, res.hit, !!(res.widget || res.target), camera);
      d.dom.style.cursor = !inXR && (res.widget || res.target) ? 'pointer' : '';

      // Gripper label.
      gripLabel.visible = gripHover;
      if (gripHover) {
        setText(gripText, `${inXR ? 'Trigger' : 'Click'}: ${ctl.robot.gripper.isOpen ? 'close' : 'open'} gripper`);
        rig.gripperProxy.getWorldPosition(origin);
        gripLabel.position.copy(origin);
        gripLabel.position.y += 0.14;
        gripLabel.lookAt(camera.getWorldPosition(dir));
        gripLabel.translateX(-0.0425);
      }

      wbToggle.setLabel(tutorial.enabled ? 'Tutorial: ON' : 'Tutorial: OFF');
      wbToggle.setActive(tutorial.enabled);

      // Panel text and bars at 30 Hz: plenty for a readout, and it keeps CPU free for 72–90 fps.
      panelClock += dt;
      if (panelClock >= 1 / 30) {
        pendant.update(panelClock);
        if (mapOn) map.update();
        panelClock = 0;
      }
      tutorial.update(dt);
    },
  };
}

function hint(ctl: Controller, xr: boolean): string {
  const k = (a: string, b: string) => (xr ? a : b);
  switch (ctl.jogMode) {
    case 'joint': return `${k('Left stick up/down', 'W/S')} select axis · ${k('right stick left/right', 'Left/Right arrows')} Move− / Move+`;
    case 'frame': return ctl.rotation ? `Rotate about base axes: ${k('left stick', 'WASD')} Rx / Ry · ${k('right stick left/right', 'Left/Right arrows')} Rz` : `Base frame: ${k('left stick', 'WASD')} X / Y · ${k('right stick up/down', '↑ ↓')} Z`;
    case 'tool': return ctl.rotation ? `Rotate about tool axes: ${k('left stick', 'WASD')} Rx / Ry · ${k('right stick left/right', 'Left/Right arrows')} Rz` : `Tool frame: ${k('left stick', 'WASD')} X / Y · ${k('right stick up/down', '↑ ↓')} Z (approach)`;
    case 'point': return 'Point mode: teach points first (next stage).';
  }
}

