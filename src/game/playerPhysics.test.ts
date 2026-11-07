import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { PlayerPhysics } from './playerPhysics';
import type { BoxCollider } from './mapHijacked';

const NO_KEYS: ReadonlySet<string> = new Set<string>();
const NO_COLLIDERS: BoxCollider[] = [];

function floor(y = 0): BoxCollider {
  return {
    min: new THREE.Vector3(-10, y - 1, -10),
    max: new THREE.Vector3(10, y, 10),
  };
}

test('gravity accelerates the body downward', () => {
  const body = new PlayerPhysics();
  body.reset(new THREE.Vector3(0, 10, 0));
  body.update(0.1, { keys: NO_KEYS, yaw: 0, isAds: false, colliders: NO_COLLIDERS });
  assert.ok(body.vel.y < 0, 'vertical velocity should be downward');
});

test('the body snaps onto a walkable floor and becomes grounded', () => {
  const body = new PlayerPhysics();
  body.reset(new THREE.Vector3(0, 1, 0));
  body.vel.y = -10;
  body.update(0.1, { keys: NO_KEYS, yaw: 0, isAds: false, colliders: [floor(0)] });
  assert.ok(Math.abs(body.pos.y) < 1e-6, `expected y=0, got ${body.pos.y}`);
  assert.equal(body.isGrounded, true);
  assert.equal(body.vel.y, 0);
});

test('a buffered jump fires upward while Space is held', () => {
  const body = new PlayerPhysics();
  body.reset(new THREE.Vector3(0, 0, 0));
  body.isGrounded = true;
  body.queueJump();
  body.update(0.016, {
    keys: new Set(['Space']),
    yaw: 0,
    isAds: false,
    colliders: [floor(0)],
  });
  assert.ok(body.vel.y > 0, 'jump should give upward velocity');
});

test('a jump reaches roughly a 1.5 m apex under Earth gravity', () => {
  const body = new PlayerPhysics();
  body.reset(new THREE.Vector3(0, 0, 0));
  body.isGrounded = true;
  body.queueJump();

  const keys = new Set(['Space']);
  let maxY = 0;
  for (let i = 0; i < 240; i++) {
    body.update(1 / 120, { keys, yaw: 0, isAds: false, colliders: [floor(0)] });
    maxY = Math.max(maxY, body.pos.y);
  }

  assert.ok(maxY > 1.4 && maxY < 1.6, `expected ~1.5 m apex, got ${maxY.toFixed(3)} m`);
});

test('sliding starts when shift is held above the speed threshold', () => {
  const body = new PlayerPhysics();
  body.reset(new THREE.Vector3(0, 0, 0));
  body.isGrounded = true;
  body.vel.x = 5; // lengthSq = 25 > 16
  let slid = false;
  body.update(
    0.016,
    { keys: new Set(['ShiftLeft']), yaw: 0, isAds: false, colliders: [floor(0)] },
    { onSlide: () => { slid = true; } }
  );
  assert.equal(slid, true);
  assert.equal(body.isSliding, true);
});

test('falling in the ocean reports damage and teleports back to the deck', () => {
  const body = new PlayerPhysics();
  body.reset(new THREE.Vector3(0, -4, 0));
  let fell = false;
  body.update(
    0.016,
    { keys: NO_KEYS, yaw: 0, isAds: false, colliders: NO_COLLIDERS },
    { onOceanFall: () => { fell = true; } }
  );
  assert.equal(fell, true);
  assert.ok(Math.abs(body.pos.y - 0.1) < 1e-6);
  assert.ok(Math.abs(body.pos.z + 40) < 1e-6);
  assert.equal(body.vel.length(), 0);
});
