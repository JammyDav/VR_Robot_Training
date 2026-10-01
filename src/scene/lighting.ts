import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { BENCH } from '../config/cellLayout';

/**
 * Baked-feel lighting: hemisphere fill, one shadowed key over the bench, and a
 * prefiltered room environment for soft reflections (floor sheen, metal).
 * Emissive ceiling panels supply the visible "light sources".
 */
export function setupLighting(scene: THREE.Scene, renderer: THREE.WebGLRenderer) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  scene.environment = env;
  scene.environmentIntensity = 0.4;
  scene.background = new THREE.Color(0xf2f2ef);

  const hemi = new THREE.HemisphereLight(0xffffff, 0xcfcac0, 0.95);
  scene.add(hemi);

  const key = new THREE.DirectionalLight(0xfffaf2, 2.4);
  key.position.set(BENCH.x + 0.7, 2.75, BENCH.z + 0.9);
  key.target.position.set(BENCH.x, BENCH.topY, BENCH.z);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  const s = key.shadow.camera;
  s.left = -1.5; s.right = 1.5; s.top = 1.2; s.bottom = -1.2; s.near = 0.5; s.far = 5;
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.02;
  scene.add(key, key.target);

  // Gentle cool fill from the far wall so the robot's front isn't flat.
  const fill = new THREE.DirectionalLight(0xeef4ff, 0.35);
  fill.position.set(-1.5, 2.2, -2.2);
  scene.add(fill);

  return { hemi, key, fill };
}
