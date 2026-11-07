import * as THREE from 'three';

// --- Shared glove materials (one allocation for every hand on every gun) ---
const gloveMat = new THREE.MeshStandardMaterial({
  color: 0x24272b,
  roughness: 0.85,
  metalness: 0.05,
});

const knuckleMat = new THREE.MeshStandardMaterial({
  color: 0x3d444d,
  roughness: 0.7,
  metalness: 0.15,
});

const fabricMat = new THREE.MeshStandardMaterial({
  color: 0x1b1e22,
  roughness: 0.9,
  metalness: 0.02,
});

/**
 * Hand geometry built once and shared by both hands. The mesh count is fixed at
 * 12 per hand: palm, knuckle plate, four two-segment fingers (8), thumb, forearm.
 */
interface HandGeometries {
  palm: THREE.BufferGeometry;
  knuckle: THREE.BufferGeometry;
  fingerBase: THREE.BufferGeometry;
  fingerTip: THREE.BufferGeometry;
  thumb: THREE.BufferGeometry;
  forearm: THREE.BufferGeometry;
}

let handGeos: HandGeometries | null = null;

function getHandGeometries(): HandGeometries {
  if (handGeos) return handGeos;

  const forearm = new THREE.CylinderGeometry(0.045, 0.06, 0.34, 6);
  // Point the taper down and back toward the bottom of the screen.
  forearm.rotateX(-1.15);
  forearm.translate(0, -0.05, 0.09);

  handGeos = {
    palm: new THREE.BoxGeometry(0.075, 0.09, 0.11),
    knuckle: new THREE.BoxGeometry(0.07, 0.03, 0.06),
    fingerBase: new THREE.BoxGeometry(0.016, 0.02, 0.05),
    fingerTip: new THREE.BoxGeometry(0.015, 0.018, 0.045),
    thumb: new THREE.BoxGeometry(0.022, 0.022, 0.05),
    forearm,
  };
  return handGeos;
}

const FINGER_X = [-0.027, -0.009, 0.009, 0.027];

/**
 * Builds one low-poly gloved hand as a group whose origin is the wrist pivot.
 * `mirror` is +1 for the right hand and -1 for the left; it flips the thumb and
 * any lateral offsets so the two hands are true mirror images.
 */
function makeHand(mirror: number): THREE.Group {
  const g = getHandGeometries();
  const hand = new THREE.Group();

  const palm = new THREE.Mesh(g.palm, gloveMat);
  palm.position.set(0, 0, -0.055);
  hand.add(palm);

  const knuckle = new THREE.Mesh(g.knuckle, knuckleMat);
  knuckle.position.set(0, 0.03, -0.1);
  hand.add(knuckle);

  // Four two-segment fingers curled around local -Z.
  for (const fx of FINGER_X) {
    const base = new THREE.Mesh(g.fingerBase, gloveMat);
    base.position.set(fx, 0.01, -0.115);
    base.rotation.x = -0.9;
    hand.add(base);

    const tip = new THREE.Mesh(g.fingerTip, gloveMat);
    tip.position.set(fx, -0.025, -0.14);
    tip.rotation.x = -1.7;
    hand.add(tip);
  }

  const thumb = new THREE.Mesh(g.thumb, gloveMat);
  thumb.position.set(mirror * 0.04, 0.005, -0.075);
  thumb.rotation.set(-0.6, 0, mirror * 0.5);
  hand.add(thumb);

  const forearm = new THREE.Mesh(g.forearm, fabricMat);
  hand.add(forearm);

  return hand;
}

/** Builds the shared left and right gloved hands, each a wrist-pivot group. */
export function buildHands(): { left: THREE.Group; right: THREE.Group } {
  return { left: makeHand(-1), right: makeHand(1) };
}

/** Adds the warm fill and cool rim point lights that light the viewmodel. */
export function addViewmodelLights(group: THREE.Group): void {
  const fill = new THREE.PointLight(0xffd2a0, 2.2, 1.4, 2);
  fill.position.set(0.25, 0.35, 0.1);
  fill.castShadow = false;
  group.add(fill);

  const rim = new THREE.PointLight(0x9fc6ff, 0.9, 1.2, 2);
  rim.position.set(-0.3, 0.1, -0.2);
  rim.castShadow = false;
  group.add(rim);
}
