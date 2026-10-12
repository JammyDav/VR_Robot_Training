import { emptyInput, type PendantInput } from './PendantInput';

// Keyboard stand-in for the two controllers, mapped by physical stick so the
// pendant logic is identical to the headset:
//   Space (hold)         enabling device, mid position   Shift+Space = panic squeeze
//   W/S, A/D             left stick ↕ ↔                  Arrow keys = right stick
//   Tab                  left X (jog mode)               Q (hold) = left Y (speed modifier)
//   Enter                right A                         B = right B (tap / hold)
//   Mouse click          right trigger (ray select); G = gripper shortcut

const KEYS = new Set(['Space', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab', 'KeyQ', 'Enter', 'KeyB']);

export class DesktopInput {
  private held = new Set<string>();
  private shift = false;

  constructor(target: Window = window) {
    target.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      this.shift = e.shiftKey;
      if (KEYS.has(e.code)) {
        this.held.add(e.code);
        e.preventDefault();
      }
    });
    target.addEventListener('keyup', (e) => {
      this.shift = e.shiftKey;
      this.held.delete(e.code);
    });
    target.addEventListener('blur', () => this.held.clear());
  }

  read(out: PendantInput = emptyInput()): PendantInput {
    const h = (c: string) => this.held.has(c);
    const axis = (neg: string, pos: string) => (h(pos) ? 1 : 0) - (h(neg) ? 1 : 0);
    out.enable = h('Space') ? (this.shift ? 1 : 0.5) : 0;
    out.ls.x = axis('KeyA', 'KeyD');
    out.ls.y = axis('KeyS', 'KeyW');
    out.rs.x = axis('ArrowLeft', 'ArrowRight');
    out.rs.y = axis('ArrowDown', 'ArrowUp');
    out.x = h('Tab');
    out.y = h('KeyQ');
    out.lTrigger = false;
    out.a = h('Enter');
    out.b = h('KeyB');
    out.rTrigger = false; // desktop selects with the mouse
    return out;
  }
}
