import type { Controller } from '../core/Controller';
import type { PendantLogic } from '../input/PendantLogic';
import { deg, JOINT_COUNT } from '../config/robotSpec';

const MODE_LABEL = { manual: 'MANUAL', test: 'MANUAL TEST', local: 'LOCAL' } as const;
const JOG_LABEL = { joint: 'JOINT', frame: 'FRAME', tool: 'TOOL', point: 'POINT' } as const;
const ENABLE_LABEL = { released: 'Disabled — hold enabling device', enabled: 'Enabled', panic: 'Panic release — let go fully' } as const;

export interface Status {
  mode: string;
  jog: string;
  speed: string;
  enable: string;
  enableState: Controller['enable'];
  alert: string | null; // E-stop / fault
  warning: string | null;
  joints: Array<{ label: string; value: string; selected: boolean; moving: boolean; frac: number }>;
  pose: string;
}

export function buildStatus(ctl: Controller, logic: PendantLogic): Status {
  const r = ctl.robot;
  const info = ctl.jogInfo;
  let warning: string | null = null;
  if (ctl.mode !== 'manual') warning = 'Jogging is only available in Manual.';
  else if (info.nearSingular) warning = 'Near wrist singularity — slowing';
  else if (info.blocked.length) warning = `J${info.blocked[0] + 1} at its limit`;
  else if (info.capped) warning = 'TCP speed capped at 250 mm/s';
  if (ctl.jogMode === 'point') warning = 'Point mode: teach points first (stage 5)';

  let alert: string | null = null;
  if (ctl.estop) {
    alert = ctl.enable === 'released'
      ? `EMERGENCY STOP — hold A to reset${logic.holdProgress.reset > 0 ? ` ${'■'.repeat(Math.ceil(logic.holdProgress.reset * 5))}` : ''}`
      : 'EMERGENCY STOP — release the enabling device';
  } else if (ctl.fault) alert = `FAULT — ${ctl.fault}`;
  else if (logic.holdProgress.estop > 0) alert = `E-stop in ${'■'.repeat(Math.ceil(logic.holdProgress.estop * 5))}`;

  const pose = ctl.tcpPose();
  const joints = [];
  for (let i = 0; i < JOINT_COUNT; i++) {
    joints.push({
      label: `J${i + 1}`,
      value: `${deg(r.q[i]).toFixed(1)}°`,
      selected: ctl.jogMode === 'joint' && ctl.jointAxis === i,
      moving: Math.abs(r.qd[i]) > 1e-4,
      frac: 0,
    });
  }
  return {
    mode: MODE_LABEL[ctl.mode],
    jog: JOG_LABEL[ctl.jogMode] + ((ctl.jogMode === 'frame' || ctl.jogMode === 'tool') ? (ctl.rotation ? ' · ROTATE' : ' · TRANSLATE') : ''),
    speed: `${Math.round(ctl.speedOverride * 100)}%`,
    enable: ENABLE_LABEL[ctl.enable],
    enableState: ctl.enable,
    alert,
    warning,
    joints,
    pose: `X ${pose.x.toFixed(1)}  Y ${pose.y.toFixed(1)}  Z ${pose.z.toFixed(1)} mm\nRx ${pose.rx.toFixed(1)}  Ry ${pose.ry.toFixed(1)}  Rz ${pose.rz.toFixed(1)}°`,
  };
}
