import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MINIMAP_VIEW,
  MAP_ZONES,
  MAP_FEATURES,
  projectToMap,
  playerRotationDeg,
} from './minimap';

test('the minimap viewBox covers the yacht footprint in metres', () => {
  assert.deepEqual(MINIMAP_VIEW, { x: -12.2, y: -54, width: 24.4, height: 108 });
  assert.equal(MINIMAP_VIEW.y + MINIMAP_VIEW.height, 54);
});

test('projection is identity in map metres', () => {
  assert.deepEqual(projectToMap(-12.2, -54), { x: -12.2, y: -54 });
  assert.deepEqual(projectToMap(12.2, 54), { x: 12.2, y: 54 });
  assert.deepEqual(projectToMap(-5.5, 0), { x: -5.5, y: 0 });
});

test('zones tile the hull from bow to stern', () => {
  assert.equal(MAP_ZONES.length, 5);
  assert.equal(MAP_ZONES[0].y, -54);
  assert.equal(MAP_ZONES[4].y + MAP_ZONES[4].height, 54);
  for (let i = 1; i < MAP_ZONES.length; i++) {
    assert.equal(MAP_ZONES[i].y, MAP_ZONES[i - 1].y + MAP_ZONES[i - 1].height);
  }
});

test('feature centres match the map geometry', () => {
  const pool = MAP_FEATURES.find((f) => f.id === 'pool')!;
  assert.equal(pool.x + pool.width! / 2, -5.5);
  assert.equal(pool.y + pool.height! / 2, 0);
  const lounge = MAP_FEATURES.find((f) => f.id === 'lounge')!;
  assert.equal(lounge.x + lounge.width! / 2, 5.5);
  const helipad = MAP_FEATURES.find((f) => f.id === 'helipad')!;
  assert.equal(helipad.kind, 'circle');
  assert.deepEqual({ x: helipad.x, y: helipad.y, r: helipad.radius }, { x: 0, y: -45, r: 5 });
});

test('player rotation is bow-up: positive yaw turns counter-clockwise', () => {
  assert.equal(playerRotationDeg(0), 0);
  assert.equal(playerRotationDeg(Math.PI / 2), -90);
  assert.equal(playerRotationDeg(Math.PI), -180);
  assert.equal(playerRotationDeg(2 * Math.PI), 0);
});