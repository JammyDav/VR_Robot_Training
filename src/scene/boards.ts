import * as THREE from 'three';
import type { Materials } from './materials';
import { mesh, box, cyl, group } from './build';
import { BOARDS, HALF_D } from '../config/cellLayout';
import { TextGroup } from '../ui/text';
import { BRAND, TEAM_NAME } from '../config/brand';

export interface BoardHandles {
  /** Writing surface frames: origin top-left of the usable area, +X right, -Y down, +Z out of the wall. */
  whiteboard: THREE.Group;
  programBoard: THREE.Group;
}

export function buildBoards(root: THREE.Object3D, M: Materials): BoardHandles {
  const W = BOARDS.width, H = BOARDS.height;
  const wallZ = -HALF_D;

  // --- Whiteboard: aluminium frame, gloss surface, marker tray -------------
  const wb = group(root, BOARDS.whiteboardX, BOARDS.y, wallZ + 0.012, 0, 'whiteboard');
  mesh(box(W + 0.03, H + 0.03, 0.02), M.aluminium, wb, 0, 0, 0);
  mesh(box(W, H, 0.004), M.whiteboard, wb, 0, 0, 0.0105);
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) mesh(box(0.035, 0.035, 0.024), M.frameDark, wb, sx * (W / 2 + 0.008), sy * (H / 2 + 0.008), 0.001);
  const tray = group(wb, 0, -H / 2 - 0.03, 0.03);
  mesh(box(W * 0.6, 0.012, 0.07), M.aluminium, tray, 0, 0, 0);
  mesh(box(W * 0.6, 0.025, 0.006), M.aluminium, tray, 0, 0.012, 0.033);
  M.markerCaps.forEach((cap, i) => {
    const x = -0.32 + i * 0.075;
    mesh(cyl(0.0085, 0.0085, 0.11, 12), M.paper, tray, x, 0.015, 0.0, 0, 0, Math.PI / 2);
    mesh(cyl(0.0095, 0.0095, 0.03, 12), cap, tray, x + 0.068, 0.015, 0.0, 0, 0, Math.PI / 2);
  });
  mesh(box(0.13, 0.025, 0.05), M.frameDark, tray, 0.3, 0.019, -0.002);
  mesh(box(0.13, 0.012, 0.05), M.corkGrey, tray, 0.3, 0.004, -0.002);

  const wbSurface = group(wb, -W / 2 + 0.06, H / 2 - 0.05, 0.0135);
  const wbText = new TextGroup();
  wbText.userData.dynamic = true;
  wbSurface.add(wbText);
  wbText.addText({
    text: `${TEAM_NAME} — Robot Pendant Challenges`,
    size: 0.068, font: 'markerBold', color: BRAND.cbreGreen, maxWidth: W - 0.12,
  });
  // Hand-drawn-feel underline: slightly tilted thin stroke.
  const ul = new THREE.Mesh(box(W * 0.62, 0.005, 0.0005), M.brandGreen);
  ul.position.set(W * 0.31, -0.105, 0.0005);
  ul.rotation.z = 0.006;
  ul.userData.dynamic = true;
  wbSurface.add(ul);

  // --- Program board: wall-mounted display panel ---------------------------
  const pb = group(root, BOARDS.programBoardX, BOARDS.y, wallZ + 0.02, 0, 'programBoard');
  mesh(box(W + 0.04, H + 0.04, 0.035), M.frameDark, pb, 0, 0, 0);
  mesh(box(W, H, 0.004), M.paper, pb, 0, 0, 0.0185);
  mesh(box(W, 0.1, 0.002), M.brandGreen, pb, 0, H / 2 - 0.05, 0.0215);
  mesh(box(0.004, H - 0.16, 0.001), M.instrumentGrey, pb, -W / 2 + 0.66, -0.05, 0.021);
  const pbSurface = group(pb, -W / 2 + 0.04, H / 2 - 0.02, 0.023);
  const pbText = new TextGroup();
  pbText.userData.dynamic = true;
  pbSurface.add(pbText);
  pbText.addText({ text: 'Program', size: 0.045, font: 'semibold', color: BRAND.white, position: [0, -0.008, 0] });
  pbText.addText({ text: 'SEQUENCE', size: 0.022, font: 'mono', color: BRAND.darkGrey, position: [0, -0.115, 0] });
  pbText.addText({ text: 'VAL3-STYLE VIEW', size: 0.022, font: 'mono', color: BRAND.darkGrey, position: [0.66, -0.115, 0] });

  return { whiteboard: wbSurface, programBoard: pbSurface };
}
