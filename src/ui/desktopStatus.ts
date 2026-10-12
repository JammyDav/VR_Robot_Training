import type { Status } from './statusModel';
import { LIMITS_RAD } from '../config/robotSpec';
import type { Controller } from '../core/Controller';

/** DOM status panel for the desktop fallback (the on-screen pendant replaces it in stage 4). */
export function createDesktopStatus(panel: HTMLElement) {
  panel.innerHTML = `
    <div class="st-top"><span class="st-mode"></span><span class="st-speed"></span></div>
    <div class="st-jog"></div>
    <div class="st-enable"></div>
    <div class="st-alert"></div>
    <div class="st-rows"></div>
    <div class="st-pose"></div>
    <div class="st-warn"></div>`;
  const $ = (s: string) => panel.querySelector(s) as HTMLElement;
  const rows = $('.st-rows');
  for (let i = 0; i < 6; i++) {
    const r = document.createElement('div');
    r.className = 'jog-row';
    r.innerHTML = `<span class="ax">J${i + 1}</span><span class="bar"><i></i></span><span class="val"></span>`;
    rows.appendChild(r);
  }
  const rowEls = Array.from(rows.children) as HTMLElement[];

  return {
    render(s: Status, ctl: Controller) {
      $('.st-mode').textContent = s.mode;
      $('.st-speed').textContent = s.speed;
      $('.st-jog').textContent = s.jog;
      const en = $('.st-enable');
      en.textContent = s.enable;
      en.dataset.state = s.enableState;
      const al = $('.st-alert');
      al.textContent = s.alert ?? '';
      al.style.display = s.alert ? 'block' : 'none';
      $('.st-warn').textContent = s.warning ?? '';
      $('.st-pose').textContent = s.pose;
      s.joints.forEach((j, i) => {
        const r = rowEls[i];
        r.classList.toggle('sel', j.selected);
        r.classList.toggle('moving', j.moving);
        const [lo, hi] = LIMITS_RAD[i];
        (r.querySelector('i') as HTMLElement).style.left = `${((ctl.robot.q[i] - lo) / (hi - lo)) * 100}%`;
        (r.querySelector('.val') as HTMLElement).textContent = j.value;
      });
    },
  };
}
