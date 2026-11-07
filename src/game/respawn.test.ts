import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { pickSafestSpawn, PLAYER_RESPAWN_SECONDS, BOT_RESPAWN_SECONDS, respawnProgress } from './respawn';

test('player respawn takes three seconds', () => {
  assert.equal(PLAYER_RESPAWN_SECONDS, 3);
});

test('bot respawn still takes ten seconds', () => {
  assert.equal(BOT_RESPAWN_SECONDS, 10);
});

test('respawnProgress goes from full to empty over the player respawn window', () => {
  assert.equal(respawnProgress(PLAYER_RESPAWN_SECONDS), 1);
  assert.equal(respawnProgress(PLAYER_RESPAWN_SECONDS / 2), 0.5);
  assert.equal(respawnProgress(0), 0);
  assert.equal(respawnProgress(-1), 0);
  assert.equal(respawnProgress(PLAYER_RESPAWN_SECONDS + 5), 1);
});

test('pickSafestSpawn chooses the spawn farthest from the nearest threat', () => {
  const spawns = [
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(100, 0, 0),
    new THREE.Vector3(50, 0, 0),
  ];
  const threats = [{ pos: new THREE.Vector3(10, 0, 0) }];

  assert.equal(pickSafestSpawn(spawns, threats), spawns[1]);
});

test('pickSafestSpawn falls back to the first spawn when there are no threats', () => {
  const spawns = [new THREE.Vector3(1, 0, 1), new THREE.Vector3(2, 0, 2)];
  assert.equal(pickSafestSpawn(spawns, []), spawns[0]);
});

test('pickSafestSpawn returns null when the map has no spawns', () => {
  assert.equal(pickSafestSpawn([], [{ pos: new THREE.Vector3() }]), null);
});
