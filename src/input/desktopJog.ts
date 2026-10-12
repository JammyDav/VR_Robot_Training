import type { Robot } from '../core/robot/Robot';
import { JOINT_COUNT, LIMITS_RAD, deg } from '../config/robotSpec';

// Stage 2 desktop jog: a thin keyboard layer over the Robot. Stage 3 routes
// this through the shared PendantInput / deadman logic instead.

export const SPEED_STEPS = [0.01, 0.05, 0.1, 0.25, 0.5, 0.75, 1] as const;

export interface DesktopJogHooks {
  toggleTriad(): void;
}

export function setupDesktopJog(robot: Robot, panel: HTMLElement, hooks: DesktopJogHooks) {
  const held = new Set<string>();

  const updateDir = () => {
    const plus = held.has('ArrowRight');
    const minus = held.has('ArrowLeft');
    robot.jogDir = plus === minus ? 0 : plus ? 1 : -1;
  };

  const stepSpeed = (dir: 1 | -1) => {
    const i = SPEED_STEPS.findIndex((s) => Math.abs(s - robot.speedOverride) < 1e-6);
    const next = Math.min(SPEED_STEPS.length - 1, Math.max(0, (i < 0 ? 3 : i) + dir));
    robot.speedOverride = SPEED_STEPS[next];
  };

  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    switch (e.key) {
      case 'ArrowUp':
        robot.jogAxis = (robot.jogAxis + JOINT_COUNT - 1) % JOINT_COUNT;
        e.preventDefault();
        break;
      case 'ArrowDown':
        robot.jogAxis = (robot.jogAxis + 1) % JOINT_COUNT;
        e.preventDefault();
        break;
      case 'ArrowLeft':
      case 'ArrowRight':
        held.add(e.key);
        updateDir();
        e.preventDefault();
        break;
      case 'g': case 'G':
        if (!e.repeat) robot.gripper.toggle();
        break;
      case 't': case 'T':
        if (!e.repeat) hooks.toggleTriad();
        break;
      case '[':
        stepSpeed(-1);
        break;
      case ']':
        stepSpeed(1);
        break;
    }
  });
  window.addEventListener('keyup', (e) => {
    if (held.delete(e.key)) updateDir();
  });
  window.addEventListener('blur', () => { held.clear(); updateDir(); });

  // Readout: joint values with a bar showing position within the joint range.
  const rows: HTMLElement[] = [];
  panel.innerHTML = '';
  const head = document.createElement('div');
  head.className = 'jog-head';
  panel.appendChild(head);
  for (let i = 0; i < JOINT_COUNT; i++) {
    const r = document.createElement('div');
    r.className = 'jog-row';
    r.innerHTML = `<span class="ax">J${i + 1}</span><span class="bar"><i></i></span><span class="val"></span>`;
    panel.appendChild(r);
    rows.push(r);
  }

  return {
    refresh() {
      head.textContent = `JOINT JOG · SPEED ${Math.round(robot.speedOverride * 100)}% · GRIPPER ${robot.gripper.state.toUpperCase()}`;
      for (let i = 0; i < JOINT_COUNT; i++) {
        const [lo, hi] = LIMITS_RAD[i];
        const r = rows[i];
        r.classList.toggle('sel', i === robot.jogAxis);
        r.classList.toggle('moving', Math.abs(robot.qd[i]) > 1e-4);
        (r.querySelector('i') as HTMLElement).style.left = `${((robot.q[i] - lo) / (hi - lo)) * 100}%`;
        (r.querySelector('.val') as HTMLElement).textContent = `${deg(robot.q[i]).toFixed(1)}°`;
      }
    },
  };
}
