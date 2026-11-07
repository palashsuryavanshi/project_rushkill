import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  rayBox,
  findClosestBotHit,
  applySpread,
  computeShotSpread,
  drainPendingHits,
  type PendingHit,
} from './combat';
import { getWeaponById } from './weapons';
import type { BotState } from './botAI';

function fakeBot(pos: THREE.Vector3, isDead = false): BotState {
  return { pos, isDead } as unknown as BotState;
}

test('rayBox returns the entry distance when the ray hits an AABB', () => {
  const origin = new THREE.Vector3(0, 0, -5);
  const dir = new THREE.Vector3(0, 0, 1);
  const hit = rayBox(origin, dir, new THREE.Vector3(-1, -1, 0), new THREE.Vector3(1, 1, 2));
  assert.ok(hit !== null);
  assert.ok(Math.abs(hit - 5) < 1e-6);
});

test('rayBox returns null when the ray misses', () => {
  const origin = new THREE.Vector3(10, 0, -5);
  const dir = new THREE.Vector3(0, 0, 1);
  const hit = rayBox(origin, dir, new THREE.Vector3(-1, -1, 0), new THREE.Vector3(1, 1, 2));
  assert.equal(hit, null);
});

test('rayBox returns null when the box is behind the origin', () => {
  const origin = new THREE.Vector3(0, 0, 5);
  const dir = new THREE.Vector3(0, 0, 1);
  const hit = rayBox(origin, dir, new THREE.Vector3(-1, -1, 0), new THREE.Vector3(1, 1, 2));
  assert.equal(hit, null);
});

test('findClosestBotHit returns the nearest alive bot along the ray', () => {
  const near = fakeBot(new THREE.Vector3(0, 0, -2));
  const far = fakeBot(new THREE.Vector3(0, 0, 4));
  const hit = findClosestBotHit(
    new THREE.Vector3(0, 1.0, -10),
    new THREE.Vector3(0, 0, 1),
    [far, near]
  );
  assert.ok(hit !== null);
  assert.equal(hit!.bot, near);
  assert.equal(hit!.isHead, false);
});

test('findClosestBotHit prefers the head box when aimed high', () => {
  const bot = fakeBot(new THREE.Vector3(0, 0, 0));
  const hit = findClosestBotHit(
    new THREE.Vector3(0, 1.9, -10),
    new THREE.Vector3(0, 0, 1),
    [bot]
  );
  assert.ok(hit !== null);
  assert.equal(hit!.isHead, true);
});

test('findClosestBotHit skips dead bots', () => {
  const dead = fakeBot(new THREE.Vector3(0, 0, 0), true);
  const hit = findClosestBotHit(
    new THREE.Vector3(0, 1.0, -10),
    new THREE.Vector3(0, 0, 1),
    [dead]
  );
  assert.equal(hit, null);
});

test('findClosestBotHit registers a hit on the legs', () => {
  const bot = fakeBot(new THREE.Vector3(0, 0, 0));
  const hit = findClosestBotHit(
    new THREE.Vector3(0, 0.2, -10),
    new THREE.Vector3(0, 0, 1),
    [bot]
  );
  assert.ok(hit !== null, 'a shot at the visible legs must register');
  assert.equal(hit!.isHead, false);
});

test('findClosestBotHit reaches past the default clip when given a range', () => {
  const bot = fakeBot(new THREE.Vector3(0, 0, -400));
  const hit = findClosestBotHit(
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(0, 0, -1),
    [bot],
    Infinity
  );
  assert.ok(hit !== null, 'an unlimited-range sniper shot must reach 400 m');
});

test('scoped sniper spread ignores the generic stance penalty', () => {
  const sniper = getWeaponById('longbow');
  assert.equal(computeShotSpread(sniper, true, 0, false), sniper.adsSpread);
  assert.equal(computeShotSpread(sniper, true, 12, true), sniper.adsSpread);
});

test('applySpread keeps a unit direction and is deterministic with an injected rng', () => {
  const dir = new THREE.Vector3(0, 0, -1);
  const seq = [0.25, 0.5];
  let i = 0;
  applySpread(dir, 0.1, () => seq[i++ % seq.length]);
  assert.ok(Math.abs(dir.length() - 1) < 1e-6);
});

test('applySpread with zero spread only normalizes', () => {
  const dir = new THREE.Vector3(0, 0, -2);
  applySpread(dir, 0);
  assert.ok(Math.abs(dir.length() - 1) < 1e-6);
  assert.ok(Math.abs(dir.z + 1) < 1e-6);
});

test('drainPendingHits fires due hits and drops hits on bots that died first', () => {
  const alive = fakeBot(new THREE.Vector3());
  const dead = fakeBot(new THREE.Vector3(), true);
  const pending: PendingHit[] = [
    { bot: alive, isHead: false, damage: 10, point: new THREE.Vector3(), dist: 1, delay: 0.05 },
    { bot: dead, isHead: false, damage: 10, point: new THREE.Vector3(), dist: 1, delay: 0.05 },
    { bot: alive, isHead: false, damage: 10, point: new THREE.Vector3(), dist: 1, delay: 0.5 },
  ];
  const fired: PendingHit[] = [];
  drainPendingHits(pending, 0.1, (h) => fired.push(h));

  assert.equal(fired.length, 1);
  assert.equal(fired[0].bot, alive);
  assert.equal(pending.length, 1, 'only the not-yet-due hit remains');
  assert.equal(pending[0].delay, 0.4);
});
