import test from 'node:test';
import assert from 'node:assert/strict';
import { buildHijackedMap } from './mapHijacked';

const map = buildHijackedMap();
const solid = map.colliders;
const glass = map.bulletBlockers.filter((b) => !solid.includes(b));

test('the map fits the yacht footprint and budgets', () => {
  const xs = solid.flatMap((c) => [c.min.x, c.max.x]);
  const zs = solid.flatMap((c) => [c.min.z, c.max.z]);
  assert.ok(Math.min(...xs) >= -15 && Math.max(...xs) <= 15);
  assert.ok(Math.min(...zs) >= -56 && Math.max(...zs) <= 57);
  assert.ok(solid.length <= 260, `colliders ${solid.length}`);
  assert.ok(map.bulletBlockers.length <= 300, `blockers ${map.bulletBlockers.length}`);
});

test('exactly four ground-level glass panes block bullets and stay walk-through', () => {
  assert.equal(glass.length, 4);
  for (const pane of glass) {
    assert.equal(solid.includes(pane), false);
    assert.ok(pane.max.y <= 4.0, 'no glass on an upper firing face');
  }
});

test('no waypoint sits below the ocean-fall threshold', () => {
  for (const wp of map.waypoints) {
    assert.ok(wp.pos.y > -3.5, `${wp.id} at y ${wp.pos.y}`);
  }
});

test('every spawn sits on solid deck and outside geometry', () => {
  for (const spawn of map.spawnPoints) {
    const ground = solid.some(
      (c) =>
        spawn.x + 0.45 > c.min.x && spawn.x - 0.45 < c.max.x &&
        spawn.z + 0.45 > c.min.z && spawn.z - 0.45 < c.max.z &&
        Math.abs(c.max.y - spawn.y) < 0.2
    );
    assert.ok(ground, `no ground under spawn ${spawn.x},${spawn.y},${spawn.z}`);

    const inside = solid.some(
      (c) =>
        spawn.x > c.min.x + 0.01 && spawn.x < c.max.x - 0.01 &&
        spawn.y > c.min.y + 0.01 && spawn.y < c.max.y - 0.05 &&
        spawn.z > c.min.z + 0.01 && spawn.z < c.max.z - 0.01
    );
    assert.equal(inside, false, `spawn inside collider at ${spawn.x},${spawn.z}`);
  }
});

test('waypoint neighbours exist and link back', () => {
  const byId = new Map(map.waypoints.map((w) => [w.id, w]));
  for (const wp of map.waypoints) {
    for (const id of wp.neighbors) {
      const other = byId.get(id);
      assert.ok(other, `${wp.id} -> missing ${id}`);
      assert.ok(other!.neighbors.includes(wp.id), `${id} must link back to ${wp.id}`);
    }
  }
});

test('the waypoint graph is connected', () => {
  const byId = new Map(map.waypoints.map((w) => [w.id, w]));
  const seen = new Set<string>(['bow_heli']);
  const queue = ['bow_heli'];
  while (queue.length > 0) {
    const wp = byId.get(queue.shift()!);
    for (const id of wp?.neighbors ?? []) {
      if (!seen.has(id)) {
        seen.add(id);
        queue.push(id);
      }
    }
  }
  assert.equal(seen.size, map.waypoints.length);
});

test('flat waypoint edges are clear at chest height', () => {
  const byId = new Map(map.waypoints.map((w) => [w.id, w]));
  for (const wp of map.waypoints) {
    for (const id of wp.neighbors) {
      const other = byId.get(id)!;
      assert.ok(wp.pos.distanceTo(other.pos) <= 12, `${wp.id} -> ${id} is too long`);
      if (Math.abs(wp.pos.y - other.pos.y) >= 0.6) continue;
      const y = Math.min(wp.pos.y, other.pos.y) + 0.9;
      for (let t = 0.1; t < 1; t += 0.1) {
        const x = wp.pos.x + (other.pos.x - wp.pos.x) * t;
        const z = wp.pos.z + (other.pos.z - wp.pos.z) * t;
        const blocked = solid.some(
          (c) =>
            x > c.min.x + 0.01 && x < c.max.x - 0.01 &&
            y > c.min.y + 0.01 && y < c.max.y - 0.01 &&
            z > c.min.z + 0.01 && z < c.max.z - 0.01
        );
        assert.equal(blocked, false, `${wp.id} -> ${id} crosses a wall at t=${t}`);
      }
    }
  }
});

test('upper stair top waypoints sit on supported floor', () => {
  const byId = new Map(map.waypoints.map((w) => [w.id, w]));
  for (const id of ['bow_stair_top', 'stern_stair_top']) {
    const wp = byId.get(id);
    assert.ok(wp, `${id} is missing`);
    const supported = solid.some(
      (c) =>
        wp!.pos.x > c.min.x && wp!.pos.x < c.max.x &&
        wp!.pos.z > c.min.z && wp!.pos.z < c.max.z &&
        Math.abs(c.max.y - wp!.pos.y) < 0.2
    );
    assert.ok(supported, `${id} is over the stairwell void`);
  }
});

test('upper stair top edges run over continuous upper floor', () => {
  const byId = new Map(map.waypoints.map((w) => [w.id, w]));
  for (const id of ['bow_stair_top', 'stern_stair_top']) {
    const wp = byId.get(id)!;
    for (const neighborId of wp.neighbors) {
      const other = byId.get(neighborId)!;
      if (Math.abs(wp.pos.y - other.pos.y) >= 0.6) continue;
      for (let t = 0.05; t < 1; t += 0.05) {
        const x = wp.pos.x + (other.pos.x - wp.pos.x) * t;
        const z = wp.pos.z + (other.pos.z - wp.pos.z) * t;
        const supported = solid.some(
          (c) =>
            x > c.min.x - 0.05 && x < c.max.x + 0.05 &&
            z > c.min.z - 0.05 && z < c.max.z + 0.05 &&
            Math.abs(c.max.y - wp.pos.y) < 0.2
        );
        assert.ok(supported, `${id} -> ${neighborId} leaves the upper floor at t=${t.toFixed(2)}`);
      }
    }
  }
});

test('the port walkway is bridged across its stairwell without the cabin detour', () => {
  const byId = new Map(map.waypoints.map((w) => [w.id, w]));
  const bridge = byId.get('port_bridge');
  assert.ok(bridge, 'port_bridge is missing');
  const supported = solid.some(
    (c) =>
      bridge!.pos.x > c.min.x && bridge!.pos.x < c.max.x &&
      bridge!.pos.z > c.min.z && bridge!.pos.z < c.max.z &&
      Math.abs(c.max.y - bridge!.pos.y) < 0.2
  );
  assert.ok(supported, 'port_bridge must sit on deck');
  assert.ok(
    bridge!.neighbors.some((id) => byId.get(id)!.pos.z < -18),
    'port_bridge needs a neighbour on the north side of the stairwell'
  );
  assert.ok(
    bridge!.neighbors.some((id) => byId.get(id)!.pos.z > -10),
    'port_bridge needs a neighbour on the south side of the stairwell'
  );
});
