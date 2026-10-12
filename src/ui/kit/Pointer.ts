import * as THREE from 'three';
import type { Panel, Widget } from './Panel';

/** Anything the ray can hit: UI panels, the gripper proxy, board widgets. */
export interface PointerTarget {
  object: THREE.Object3D;
  /** Map a hit to a widget (panels) or null for a plain target. */
  resolve?(hit: THREE.Intersection): Widget | null;
  onHover?(on: boolean, hit?: THREE.Intersection): void;
  onClick?(hit: THREE.Intersection): void;
  enabled?: () => boolean;
}

export interface PointerResult {
  hit: THREE.Intersection | null;
  widget: Widget | null;
  target: PointerTarget | null;
}

export function panelTarget(panel: Panel, enabled?: () => boolean): PointerTarget {
  return {
    object: panel.rects,
    resolve: (hit) => panel.widgetAtInstance(hit.instanceId),
    enabled: enabled ?? (() => panel.visible && isVisible(panel)),
  };
}

function isVisible(o: THREE.Object3D) {
  for (let p: THREE.Object3D | null = o; p; p = p.parent) if (!p.visible) return false;
  return true;
}

/**
 * One pointer (the right-hand ray in XR, the mouse on desktop). Tracks hover,
 * and fires a click on the press edge for whatever is under the pointer.
 */
export class Pointer {
  readonly raycaster = new THREE.Raycaster();
  private targets: PointerTarget[] = [];
  private hoverWidget: Widget | null = null;
  private hoverTarget: PointerTarget | null = null;
  private wasDown = false;
  last: PointerResult = { hit: null, widget: null, target: null };
  /** Called whenever a click lands (for haptics / audio). */
  onPress?: (r: PointerResult) => void;

  constructor() {
    this.raycaster.far = 6;
  }

  add(t: PointerTarget) { this.targets.push(t); return t; }

  update(origin: THREE.Vector3, dir: THREE.Vector3, down: boolean): PointerResult {
    this.raycaster.set(origin, dir);
    let best: { hit: THREE.Intersection; t: PointerTarget } | null = null;
    for (const t of this.targets) {
      if (t.enabled && !t.enabled()) continue;
      const hits = this.raycaster.intersectObject(t.object, true);
      for (const h of hits) {
        // Panels: ignore hits on the background-only rect unless nothing better.
        if (!best || h.distance < best.hit.distance - 1e-4) best = { hit: h, t };
        break;
      }
    }
    const widget = best?.t.resolve ? best.t.resolve(best.hit) : null;
    const target = best?.t ?? null;
    const interactive = widget ? widget.enabled && !!widget.onClick : !!target?.onClick;

    if (widget !== this.hoverWidget) {
      this.hoverWidget?.onHover?.(false);
      if (widget?.enabled) widget.onHover?.(true);
      this.hoverWidget = widget;
    }
    const plain = widget ? null : target;
    if (plain !== this.hoverTarget) {
      this.hoverTarget?.onHover?.(false);
      plain?.onHover?.(true, best?.hit);
      this.hoverTarget = plain;
    }

    if (down && !this.wasDown && best && interactive) {
      if (widget) widget.onClick!();
      else target!.onClick!(best.hit);
      this.onPress?.({ hit: best.hit, widget, target });
    }
    this.wasDown = down;
    this.last = { hit: best?.hit ?? null, widget: interactive ? widget : null, target: interactive ? target : null };
    return this.last;
  }

  clear() {
    this.hoverWidget?.onHover?.(false);
    this.hoverTarget?.onHover?.(false);
    this.hoverWidget = null;
    this.hoverTarget = null;
    this.last = { hit: null, widget: null, target: null };
  }
}
