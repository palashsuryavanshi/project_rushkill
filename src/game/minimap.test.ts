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

test('jacuzzi and planter are centred on the hull axis', () => {
  const jacuzzi = MAP_FEATURES.find((f) => f.id === 'jacuzzi')!;
  assert.deepEqual(
    { x: jacuzzi.x + jacuzzi.width! / 2, y: jacuzzi.y + jacuzzi.height! / 2 },
    { x: 0, y: 50 }
  );
  const planter = MAP_FEATURES.find((f) => f.id === 'planter')!;
  assert.deepEqual(
    { x: planter.x + planter.width! / 2, y: planter.y + planter.height! / 2 },
    { x: 0, y: 0 }
  );
});

test('every feature lies inside the minimap viewBox', () => {
  const minX = MINIMAP_VIEW.x;
  const minY = MINIMAP_VIEW.y;
  const maxX = MINIMAP_VIEW.x + MINIMAP_VIEW.width;
  const maxY = MINIMAP_VIEW.y + MINIMAP_VIEW.height;

  for (const feature of MAP_FEATURES) {
    if (feature.kind === 'circle') {
      const r = feature.radius ?? 0;
      assert.ok(feature.x - r >= minX, `${feature.id} left edge`);
      assert.ok(feature.x + r <= maxX, `${feature.id} right edge`);
      assert.ok(feature.y - r >= minY, `${feature.id} top edge`);
      assert.ok(feature.y + r <= maxY, `${feature.id} bottom edge`);
    } else {
      assert.ok(feature.x >= minX, `${feature.id} left edge`);
      assert.ok(feature.x + feature.width! <= maxX, `${feature.id} right edge`);
      assert.ok(feature.y >= minY, `${feature.id} top edge`);
      assert.ok(feature.y + feature.height! <= maxY, `${feature.id} bottom edge`);
    }
  }
});

test('player rotation is bow-up: positive yaw turns counter-clockwise', () => {
  assert.equal(playerRotationDeg(0), 0);
  assert.equal(playerRotationDeg(Math.PI / 2), -90);
  assert.equal(playerRotationDeg(Math.PI), -180);
  assert.equal(playerRotationDeg(2 * Math.PI), 0);
});
