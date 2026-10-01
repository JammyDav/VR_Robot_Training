import * as THREE from 'three';
import { BRAND } from '../config/brand';

// One shared instance per surface type so the static batcher can merge by material.
function std(color: number, roughness: number, metalness = 0, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });
}

function speckleTexture(): THREE.Texture {
  // Subtle fleck for the epoxy floor (not text, so a canvas texture is fine).
  const size = 256;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, size, size);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 2600; i++) {
    const v = 225 + Math.floor(rnd() * 30);
    g.fillStyle = `rgb(${v},${v},${v - 2})`;
    g.fillRect(rnd() * size, rnd() * size, 1 + rnd() * 1.5, 1 + rnd() * 1.5);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(9, 6.5);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export function createMaterials() {
  const floorMap = speckleTexture();
  return {
    floor: std(0xe4e3de, 0.3, 0, { map: floorMap }),
    wall: std(0xf4f4f1, 0.92),
    dado: std(0xa3aaab, 0.85),
    skirting: std(0x8a9293, 0.6),
    ceiling: std(0xf6f6f4, 0.95),
    ceilingGrid: std(0xe2e3e1, 0.7),
    lightPanel: new THREE.MeshBasicMaterial({ color: 0xffffff }),
    lightPanelWarm: new THREE.MeshBasicMaterial({ color: 0xfffcf4 }),
    trespa: std(0xf3f3f0, 0.5),
    frame: std(0x737c7e, 0.45, 0.35),
    frameDark: std(0x4a5254, 0.5, 0.3),
    aluminium: std(0xc6cacc, 0.32, 0.85),
    stainless: std(0xd3d6d6, 0.25, 0.9),
    rubber: std(0x262a2b, 0.85),
    instrumentShell: std(0xeeeeeb, 0.42),
    instrumentGrey: std(0xcfd3d3, 0.45),
    instrumentDark: std(0x353c3e, 0.4, 0.1),
    screenGlass: std(0x1a2224, 0.15, 0.2),
    whiteboard: std(0xfcfcfa, 0.22),
    corkGrey: std(0xdfe2e0, 0.9),
    brandGreen: std(BRAND.cbreGreen, 0.55),
    brandTrim: std(BRAND.sage, 0.5),
    stoolSeat: std(0x3c4547, 0.6),
    paper: std(0xfbfbf8, 0.95),
    safetyYellow: std(0xf2c200, 0.6),
    floorDecal: std(0x5c6567, 0.7),
    perspex: new THREE.MeshStandardMaterial({
      color: 0xe9f3f3,
      roughness: 0.05,
      metalness: 0,
      transparent: true,
      opacity: 0.16,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
    glass: new THREE.MeshStandardMaterial({
      color: 0xdfeceb,
      roughness: 0.05,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
    markerCaps: [0x1d2324, 0x1f4fa0, BRAND.cbreGreen, 0xb3261e].map((c) => std(c, 0.45)),
  };
}

export type Materials = ReturnType<typeof createMaterials>;
