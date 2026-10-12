import * as THREE from 'three';
import type { XRRig } from '../xr/xrSession';
import type { Status } from './statusModel';
import { makeText } from './text';
import { BRAND, SIGNAL } from '../config/brand';

/**
 * Interim readout on the left controller until the full pendant panel
 * (stage 4). Rebuilds text only when the content changes.
 */
export function createXRStatus(rig: XRRig) {
  const W = 0.16, H = 0.15;
  const panel = new THREE.Group();
  const bg = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.92 }));
  bg.position.set(W / 2, -H / 2, -0.001);
  const bar = new THREE.Mesh(new THREE.PlaneGeometry(W, 0.006), new THREE.MeshBasicMaterial({ color: BRAND.cbreGreen }));
  bar.position.set(W / 2, -0.003, 0);
  const enableDot = new THREE.Mesh(new THREE.CircleGeometry(0.004, 16), new THREE.MeshBasicMaterial({ color: SIGNAL.fault }));
  enableDot.position.set(W - 0.01, -0.02, 0.0005);
  const head = makeText({ text: '', size: 0.0105, font: 'semibold', color: BRAND.cbreGreen, position: [0.006, -0.012, 0] });
  const body = makeText({ text: '', size: 0.0078, font: 'mono', color: BRAND.darkGrey, lineHeight: 1.32, position: [0.006, -0.03, 0] });
  const alert = makeText({ text: '', size: 0.0085, font: 'semibold', color: SIGNAL.fault, maxWidth: W - 0.012, position: [0.006, -H + 0.022, 0] });
  panel.add(bg, bar, enableDot, head, body, alert);
  // Sits above the left controller, tilted toward the face.
  panel.position.set(-0.08, 0.07, -0.03);
  panel.rotation.set(-0.75, 0, 0);

  let parent: THREE.Object3D | null = null;
  let lastBody = '', lastHead = '', lastAlert = '';

  return {
    update(s: Status) {
      const grip = rig.grips.left;
      if (grip !== parent) { grip?.add(panel); parent = grip; }
      if (!rig.isPresenting()) return;
      const h = `${s.mode} · ${s.jog} · ${s.speed}`;
      const joints = s.joints.map((j) => `${j.selected ? '▶' : ' '}${j.label} ${j.value.padStart(7)}`);
      const b = [s.enable, '', joints.slice(0, 3).map((j, i) => `${j}  ${joints[i + 3]}`).join('\n'), '', s.pose, '', s.warning ?? ''].join('\n');
      const a = s.alert ?? '';
      if (h !== lastHead) { head.text = h; head.sync(); lastHead = h; }
      if (b !== lastBody) { body.text = b; body.sync(); lastBody = b; }
      if (a !== lastAlert) { alert.text = a; alert.sync(); lastAlert = a; }
      (enableDot.material as THREE.MeshBasicMaterial).color.setHex(
        s.enableState === 'enabled' ? SIGNAL.run : s.enableState === 'panic' ? SIGNAL.manual : SIGNAL.fault,
      );
    },
  };
}
