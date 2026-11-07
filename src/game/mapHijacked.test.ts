import test from 'node:test';
import assert from 'node:assert/strict';
import { buildHijackedMap } from './mapHijacked';

test('the map blocks bullets on solid geometry and glass', () => {
  const map = buildHijackedMap();

  assert.ok(map.bulletBlockers.length > map.colliders.length, 'glass must add bullet-only blockers');
  assert.equal(map.bulletBlockers.length - map.colliders.length, 4, 'four glass panes block bullets');
});

test('the port glass pane is a bullet blocker', () => {
  const map = buildHijackedMap();
  const portGlass = map.bulletBlockers.find(
    (b) =>
      Math.abs(b.min.x + 8.7) < 1e-6 &&
      Math.abs(b.max.x + 8.3) < 1e-6 &&
      Math.abs(b.min.y - 0.2) < 1e-6 &&
      Math.abs(b.max.y - 4.0) < 1e-6 &&
      Math.abs(b.min.z + 8) < 1e-6 &&
      Math.abs(b.max.z - 8) < 1e-6
  );

  assert.ok(portGlass, 'port glass pane must be registered as cover');
  assert.equal(map.colliders.includes(portGlass!), false, 'glass stays walkthroughable');
});
