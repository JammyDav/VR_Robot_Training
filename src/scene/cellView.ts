import * as THREE from 'three';
import { PlateVisual } from './plateMesh';
import type { Controller } from '../core/Controller';
import type { DispenserHandles, ReaderHandles } from './instruments';
import { SIGNAL, BRAND } from '../config/brand';
import { BASE_TO_WORLD } from '../core/frames';
import { fk } from '../core/kinematics/chain';
import { makeText } from '../ui/text';

/**
 * Mirrors cell state into the scene: plates, reader tray position, instrument
 * status LEDs, and markers for taught points.
 */
export function createCellView(scene: THREE.Scene, ctl: Controller, dispenser: DispenserHandles, reader: ReaderHandles) {
  const pool: PlateVisual[] = [];
  for (let i = 0; i < 3; i++) {
    const v = new PlateVisual();
    v.visible = false;
    scene.add(v);
    pool.push(v);
  }

  // Taught-point markers: small spheres at each point's TCP, selected one highlighted.
  const MAXP = 24;
  const markers = new THREE.InstancedMesh(
    new THREE.SphereGeometry(0.007, 12, 8),
    new THREE.MeshBasicMaterial({ toneMapped: false }),
    MAXP,
  );
  markers.count = 0;
  markers.frustumCulled = false;
  scene.add(markers);
  const label = makeText({ text: '', size: 0.018, font: 'semibold', color: BRAND.cbreGreen, anchorX: 'center', anchorY: 'bottom' });
  label.outlineWidth = '8%';
  label.outlineColor = 0xffffff;
  scene.add(label);
  const markerPos: THREE.Vector3[] = [];
  let pointsDirty = true;
  ctl.points.events.on('changed', () => { pointsDirty = true; });
  ctl.points.events.on('recorded', () => { pointsDirty = true; });

  const m = new THREE.Matrix4();
  const c = new THREE.Color();
  let lastSelected = -2;
  let t = 0;

  const led = (h: DispenserHandles['led'], color: number, intensity: number) => {
    h.material.emissive.setHex(color);
    h.material.emissiveIntensity = intensity;
  };

  return {
    update(dt: number, camera: THREE.Camera) {
      t += dt;
      const cell = ctl.cell;
      // Plates.
      pool.forEach((v, i) => {
        const p = cell.plates[i];
        v.visible = !!p;
        if (!p) return;
        v.setVariant(cell.variant);
        v.setPose(p.pose);
      });

      // Reader tray + LEDs.
      reader.tray.position.x = cell.tray.x;
      const blink = Math.floor(t * 3) % 2 === 0;
      switch (cell.dispenser.state) {
        case 'dispensing': led(dispenser.led, SIGNAL.manual, blink ? 1.4 : 0.2); break;
        case 'presenting': led(dispenser.led, SIGNAL.manual, 1.4); break;
        default: led(dispenser.led, SIGNAL.run, cell.plateAt('dispenser') ? 1.4 : 0.5);
      }
      switch (cell.reader.state) {
        case 'reading': led(reader.led, SIGNAL.manual, 0.4 + 1.0 * (0.5 + 0.5 * Math.sin(t * 6))); break;
        case 'done': led(reader.led, SIGNAL.run, 1.4); break;
        default: led(reader.led, SIGNAL.run, cell.trayState === 'moving' ? (blink ? 1.2 : 0.3) : 0.5);
      }

      // Point markers (only meaningful while teaching).
      const pts = ctl.points.points;
      if (pointsDirty) {
        markerPos.length = 0;
        pts.slice(0, MAXP).forEach((pt, i) => {
          const pos = new THREE.Vector3().setFromMatrixPosition(m.multiplyMatrices(BASE_TO_WORLD, fk(pt.q).tcp));
          markerPos.push(pos);
          markers.setMatrixAt(i, m.makeTranslation(pos.x, pos.y, pos.z));
        });
        markers.count = markerPos.length;
        markers.instanceMatrix.needsUpdate = true;
        pointsDirty = false;
        lastSelected = -2;
      }
      const sel = ctl.points.selected;
      if (sel !== lastSelected) {
        for (let i = 0; i < markers.count; i++) markers.setColorAt(i, c.setHex(i === sel ? BRAND.accentGreen : BRAND.sage));
        if (markers.instanceColor) markers.instanceColor.needsUpdate = true;
        const pt = pts[sel];
        label.text = pt ? pt.name : '';
        if (pt) label.position.copy(markerPos[sel]).add(new THREE.Vector3(0, 0.02, 0));
        label.sync();
        lastSelected = sel;
      }
      markers.visible = ctl.mode === 'manual';
      label.visible = markers.visible && sel >= 0;
      if (label.visible) label.quaternion.copy(camera.getWorldQuaternion(new THREE.Quaternion()));
    },
  };
}
