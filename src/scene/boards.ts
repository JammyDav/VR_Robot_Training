import * as THREE from 'three';
import type { Materials } from './materials';
import { mesh, box, cyl, group } from './build';
import { BOARDS, HALF_D, PROGRAM_SCREEN } from '../config/cellLayout';
import { TextGroup } from '../ui/text';
import { BRAND, TEAM_NAME } from '../config/brand';

export interface BoardHandles {
  /**
   * Mount points, +X right, −Y down, +Z out of the wall. Whiteboard: top-left of
   * the writing area. Program board: top-left corner of the program screen (scaled).
   */
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

  // --- Program screen: large display on a rolling stand beside the operator -----
  const PS = PROGRAM_SCREEN;
  const SW = W * PS.scale, SH = H * PS.scale;
  const stand = group(root, PS.x, 0, PS.z, PS.yaw, 'programScreen');
  // Five-star base with casters, column, and a keyboard shelf.
  for (let i = 0; i < 5; i++) {
    const ang = (i / 5) * Math.PI * 2;
    mesh(box(0.34, 0.025, 0.05), M.frameDark, stand, Math.cos(ang) * 0.16, 0.06, Math.sin(ang) * 0.16, 0, -ang, 0);
    mesh(cyl(0.025, 0.025, 0.035, 12), M.rubber, stand, Math.cos(ang) * 0.32, 0.018, Math.sin(ang) * 0.32);
  }
  mesh(cyl(0.035, 0.04, 0.05, 16), M.frameDark, stand, 0, 0.09, 0);
  mesh(cyl(0.03, 0.03, PS.centerY - 0.12, 16), M.aluminium, stand, 0, (PS.centerY - 0.12) / 2 + 0.1, -0.05);
  mesh(box(0.5, 0.018, 0.26), M.frameDark, stand, 0, 0.92, 0.1);
  mesh(box(0.42, 0.012, 0.14), M.instrumentDark, stand, 0, 0.935, 0.12);
  mesh(box(0.08, 0.012, 0.1), M.instrumentDark, stand, 0.28, 0.935, 0.12);
  // Display: dark bezel, mount plate, screen surface.
  const disp = group(stand, 0, PS.centerY, 0, 0, 'programDisplay');
  disp.rotation.x = PS.tilt;
  mesh(box(0.2, 0.2, 0.05), M.frameDark, disp, 0, 0, -0.06);
  mesh(box(SW + 0.03, SH + 0.03, 0.035), M.frameDark, disp, 0, 0, -0.02);
  mesh(box(SW, SH, 0.002), M.paper, disp, 0, 0, -0.0015);
  mesh(box(0.08, 0.01, 0.003), M.brandGreen, disp, 0, -SH / 2 - 0.009, 0.0);
  // Live content (programBoard.ts) mounts at the screen's top-left corner, scaled.
  const pbSurface = group(disp, -SW / 2, SH / 2, 0.0005);
  pbSurface.scale.setScalar(PS.scale);

  return { whiteboard: wbSurface, programBoard: pbSurface };
}
