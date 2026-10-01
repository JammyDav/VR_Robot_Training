import * as THREE from 'three';
import { XRControllerModelFactory } from 'three/examples/jsm/webxr/XRControllerModelFactory.js';
import { OPERATOR_SPOT } from '../config/cellLayout';

export interface XRRig {
  /** Parent of the XR camera and controllers; placed on the operator marker. */
  rig: THREE.Group;
  controllers: { left: THREE.Group | null; right: THREE.Group | null };
  grips: { left: THREE.Group | null; right: THREE.Group | null };
  /** Raw controller objects by index; handedness is resolved on `connected`. */
  raw: THREE.Group[];
  rawGrips: THREE.Group[];
  isPresenting: () => boolean;
}

export function setupXR(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera, button: HTMLButtonElement): XRRig {
  renderer.xr.enabled = true;
  renderer.xr.setReferenceSpaceType('local-floor');
  renderer.xr.setFoveation(1);

  const rig = new THREE.Group();
  rig.name = 'xrRig';
  rig.position.set(OPERATOR_SPOT.x, 0, OPERATOR_SPOT.z);
  rig.rotation.y = OPERATOR_SPOT.facingYaw;
  scene.add(rig);

  const factory = new XRControllerModelFactory();
  const out: XRRig = {
    rig,
    controllers: { left: null, right: null },
    grips: { left: null, right: null },
    raw: [],
    rawGrips: [],
    isPresenting: () => renderer.xr.isPresenting,
  };

  for (let i = 0; i < 2; i++) {
    const ctrl = renderer.xr.getController(i);
    const grip = renderer.xr.getControllerGrip(i);
    grip.add(factory.createControllerModel(grip));
    rig.add(ctrl, grip);
    out.raw.push(ctrl);
    out.rawGrips.push(grip);
    ctrl.addEventListener('connected', (e: { data?: XRInputSource }) => {
      const hand = e.data?.handedness;
      if (hand === 'left' || hand === 'right') {
        out.controllers[hand] = ctrl;
        out.grips[hand] = grip;
        ctrl.userData.inputSource = e.data;
        ctrl.userData.handedness = hand;
      }
    });
    ctrl.addEventListener('disconnected', () => {
      const hand = ctrl.userData.handedness as 'left' | 'right' | undefined;
      if (hand) { out.controllers[hand] = null; out.grips[hand] = null; }
    });
  }

  // Desktop camera is reparented into the rig only while presenting so the
  // headset pose is relative to the operator marker.
  let savedParent: THREE.Object3D | null = null;
  const savedPose = { p: new THREE.Vector3(), q: new THREE.Quaternion() };
  renderer.xr.addEventListener('sessionstart', () => {
    savedParent = camera.parent;
    savedPose.p.copy(camera.position);
    savedPose.q.copy(camera.quaternion);
    rig.add(camera);
    camera.position.set(0, 0, 0);
    camera.quaternion.identity();
    renderer.xr.setFoveation(1);
    button.textContent = 'Exit VR';
  });
  renderer.xr.addEventListener('sessionend', () => {
    (savedParent ?? scene).add(camera);
    camera.position.copy(savedPose.p);
    camera.quaternion.copy(savedPose.q);
    button.textContent = 'Enter VR';
  });

  // Single, styled entry button.
  const xr = (navigator as Navigator & { xr?: XRSystem }).xr;
  let session: XRSession | null = null;
  const setUnsupported = (msg: string) => {
    button.disabled = true;
    button.textContent = msg;
    button.title = 'WebXR needs a headset browser over HTTPS. Desktop controls remain available.';
  };
  if (!xr) setUnsupported('VR not available');
  else {
    xr.isSessionSupported('immersive-vr').then((ok) => {
      if (!ok) return setUnsupported('VR not available');
      button.disabled = false;
      button.textContent = 'Enter VR';
    }).catch(() => setUnsupported('VR not available'));
  }
  button.addEventListener('click', async () => {
    if (!xr) return;
    if (session) { await session.end(); return; }
    try {
      session = await xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking'] });
      session.addEventListener('end', () => { session = null; });
      await renderer.xr.setSession(session);
    } catch (err) {
      console.error('Failed to start XR session', err);
    }
  });

  return out;
}
