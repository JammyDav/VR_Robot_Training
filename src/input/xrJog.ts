import * as THREE from 'three';
import type { Robot } from '../core/robot/Robot';
import type { XRRig } from '../xr/xrSession';
import { JOINT_COUNT, deg } from '../config/robotSpec';
import { makeText } from '../ui/text';
import { BRAND } from '../config/brand';

// Stage 2 headset shim so joint jogging can be tried on the Quest before the
// pendant (stage 4) and deadman (stage 3) exist. Replaced by PendantLogic.
//   Left stick up/down  → select axis      Right stick X → Move− / Move+
//   Right A             → gripper toggle   Left Y + left stick up/down → speed

const SPEED_STEPS = [0.01, 0.05, 0.1, 0.25, 0.5, 0.75, 1];

export function setupXRJog(robot: Robot, xr: XRRig) {
  const label = makeText({ text: '', size: 0.011, font: 'mono', color: BRAND.cbreGreen, lineHeight: 1.35, anchorX: 'left', anchorY: 'bottom' });
  const backing = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 0.115), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.88 }));
  const panel = new THREE.Group();
  backing.position.set(0.07, 0.05, -0.001);
  label.position.set(0.003, 0.0, 0);
  panel.add(backing, label);
  panel.position.set(-0.02, 0.06, -0.05);
  panel.rotation.x = -0.9;

  let attachedTo: THREE.Object3D | null = null;
  let stickLatch = false;
  let aLatch = false;
  let lastText = '';

  return {
    update() {
      const grip = xr.grips.left;
      if (grip !== attachedTo) { grip?.add(panel); attachedTo = grip; }
      const L = (xr.controllers.left?.userData.inputSource as XRInputSource | undefined)?.gamepad;
      const R = (xr.controllers.right?.userData.inputSource as XRInputSource | undefined)?.gamepad;
      if (!xr.isPresenting() || !L || !R) return;

      const ly = L.axes[3] ?? 0;
      const yHeld = L.buttons[5]?.pressed ?? false;
      if (Math.abs(ly) > 0.7 && !stickLatch) {
        stickLatch = true;
        const step = ly < 0 ? -1 : 1; // stick up is negative
        if (yHeld) {
          const i = SPEED_STEPS.indexOf(robot.speedOverride);
          robot.speedOverride = SPEED_STEPS[Math.min(SPEED_STEPS.length - 1, Math.max(0, (i < 0 ? 3 : i) - step))];
        } else {
          robot.jogAxis = (robot.jogAxis + step + JOINT_COUNT) % JOINT_COUNT;
        }
      } else if (Math.abs(ly) < 0.3) stickLatch = false;

      const rx = R.axes[2] ?? 0;
      robot.jogDir = rx > 0.5 ? 1 : rx < -0.5 ? -1 : 0;

      const a = R.buttons[4]?.pressed ?? false;
      if (a && !aLatch) robot.gripper.toggle();
      aLatch = a;

      const lines = [`JOINT · ${Math.round(robot.speedOverride * 100)}% · ${robot.gripper.state}`];
      for (let i = 0; i < JOINT_COUNT; i++) {
        lines.push(`${i === robot.jogAxis ? '▶' : ' '} J${i + 1} ${deg(robot.q[i]).toFixed(1).padStart(7)}°`);
      }
      const text = lines.join('\n');
      if (text !== lastText) { label.text = text; label.sync(); lastText = text; }
    },
  };
}
