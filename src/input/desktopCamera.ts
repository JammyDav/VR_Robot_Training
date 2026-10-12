import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { BENCH, OPERATOR_SPOT, BOARDS, HALF_D } from '../config/cellLayout';

const EYE = 1.62;

interface View { pos: [number, number, number]; target: [number, number, number] }

export const VIEWS: Record<string, View> = {
  operator: { pos: [OPERATOR_SPOT.x, EYE, OPERATOR_SPOT.z + 0.15], target: [BENCH.x, BENCH.topY + 0.25, BENCH.z] },
  overview: { pos: [2.6, 2.3, 2.2], target: [0, 0.95, -0.6] },
  cell: { pos: [0.55, 1.45, 0.55], target: [BENCH.x, BENCH.topY + 0.1, BENCH.z] },
  boards: { pos: [0, EYE, 0.6], target: [0, BOARDS.y, -HALF_D] },
  robot: { pos: [-0.95, 1.5, 0.45], target: [BENCH.x, BENCH.topY + 0.42, BENCH.z] },
};

/** Orbit camera for the desktop fallback. Number keys 1-4 jump to preset views. */
export function setupDesktopCamera(camera: THREE.PerspectiveCamera, dom: HTMLElement) {
  const controls = new OrbitControls(camera, dom);
  controls.enableDamping = true;
  controls.dampingFactor = 0.12;
  controls.minDistance = 0.25;
  controls.maxDistance = 6;
  controls.maxPolarAngle = Math.PI * 0.495;
  controls.screenSpacePanning = true;

  const go = (name: keyof typeof VIEWS) => {
    const v = VIEWS[name];
    camera.position.set(...v.pos);
    controls.target.set(...v.target);
    controls.update();
  };
  go('operator');

  const order: Array<keyof typeof VIEWS> = ['operator', 'overview', 'cell', 'boards', 'robot'];
  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    const i = Number(e.key) - 1;
    if (!e.ctrlKey && !e.altKey && i >= 0 && i < order.length) go(order[i]);
  });

  return { controls, go };
}
