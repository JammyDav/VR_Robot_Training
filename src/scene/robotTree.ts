import * as THREE from 'three';
import { CHAIN, TOOL_OFFSET } from '../core/kinematics/chain';
import { BASE_TO_WORLD } from '../core/frames';

/**
 * Bare joint hierarchy mirroring `CHAIN`, so forward kinematics falls out of
 * the scene graph. Visuals are attached separately (robotRig.ts); this module
 * has no rendering dependencies so tests can build it headless.
 */
export interface JointTree {
  root: THREE.Group; // robot base frame
  joints: THREE.Group[]; // joint i frame (after rotation)
  tcp: THREE.Object3D;
}

const AXES = { y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1) };

export function buildJointTree(): JointTree {
  const root = new THREE.Group();
  root.name = 'robotBase';
  BASE_TO_WORLD.decompose(root.position, root.quaternion, root.scale);
  let parent: THREE.Object3D = root;
  const joints: THREE.Group[] = [];
  CHAIN.forEach((def, i) => {
    const j = new THREE.Group();
    j.name = `J${i + 1}`;
    j.userData.dynamic = true; // moving frame: never flattened into a parent batch
    j.position.set(...def.offset);
    parent.add(j);
    joints.push(j);
    parent = j;
  });
  const tcp = new THREE.Object3D();
  tcp.name = 'TCP';
  tcp.position.copy(TOOL_OFFSET);
  joints[5].add(tcp);
  return { root, joints, tcp };
}

export function applyJoints(tree: JointTree, q: ArrayLike<number>) {
  for (let i = 0; i < CHAIN.length; i++) tree.joints[i].quaternion.setFromAxisAngle(AXES[CHAIN[i].axis], q[i]);
}
