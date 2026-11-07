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
    const centreZ = (pane.min.z + pane.max.z) / 2;
    assert.ok(Math.abs(centreZ) >= 30, `glass at z ${centreZ} must sit beside a doorway, not fill it`);
  }

  // The 2 m walkway doorways at z ∓27 stay open at chest height on both sides.
  for (const x of [-8.5, 8.5]) {
    for (const doorZ of [-27, 27]) {
      for (let z = doorZ - 0.9; z <= doorZ + 0.9; z += 0.2) {
        const blocked = solid.some(
          (c) =>
            x > c.min.x + 0.01 && x < c.max.x - 0.01 &&
            0.9 > c.min.y + 0.01 && 0.9 < c.max.y - 0.01 &&
            z > c.min.z + 0.01 && z < c.max.z - 0.01
        );
        assert.equal(blocked, false, `walkway doorway at x ${x}, z ${z.toFixed(2)} is walled shut`);
      }
    }
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

test('every spawn has 1.9 m of clear headroom over its footprint', () => {
  for (const spawn of map.spawnPoints) {
    const overhead = solid.filter(
      (c) =>
        spawn.x + 0.45 > c.min.x && spawn.x - 0.45 < c.max.x &&
        spawn.z + 0.45 > c.min.z && spawn.z - 0.45 < c.max.z &&
        c.min.y > spawn.y + 0.2 && c.min.y < spawn.y + 1.9
    );
    assert.equal(
      overhead.length,
      0,
      `spawn ${spawn.x},${spawn.y},${spawn.z} is under a collider at y ${overhead.map((c) => c.min.y.toFixed(2)).join(',')}`
    );
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

const BRIDGE_LANES = [
  {
    side: 'port',
    bridgeIds: ['port_bridge_north', 'port_bridge_south'],
    cut: { min: -18, max: -10 },
    northOfCut: (z: number) => z < -18,
    southOfCut: (z: number) => z > -10,
  },
  {
    side: 'starboard',
    bridgeIds: ['star_bridge_north', 'star_bridge_south'],
    cut: { min: 10, max: 18 },
    northOfCut: (z: number) => z > 18,
    southOfCut: (z: number) => z < 10,
  },
];

test('both walkways are bridged on solid floor across their stairwells', () => {
  const byId = new Map(map.waypoints.map((w) => [w.id, w]));

  for (const lane of BRIDGE_LANES) {
    const checked = new Set<string>();

    for (const id of lane.bridgeIds) {
      const bridge = byId.get(id);
      assert.ok(bridge, `${id} is missing`);

      for (const neighborId of bridge!.neighbors) {
        const other = byId.get(neighborId);
        assert.ok(other, `${id} -> missing ${neighborId}`);
        if (Math.abs(bridge!.pos.y - other!.pos.y) >= 0.6) continue;
        const key = [id, neighborId].sort().join('|');
        if (checked.has(key)) continue;
        checked.add(key);

        for (let t = 0.05; t < 1; t += 0.05) {
          const x = bridge!.pos.x + (other!.pos.x - bridge!.pos.x) * t;
          const z = bridge!.pos.z + (other!.pos.z - bridge!.pos.z) * t;
          const supported = solid.some(
            (c) =>
              x > c.min.x - 0.05 && x < c.max.x + 0.05 &&
              z > c.min.z - 0.05 && z < c.max.z + 0.05 &&
              c.max.y <= bridge!.pos.y + 0.05 &&
              c.max.y >= bridge!.pos.y - 0.6
          );
          assert.ok(supported, `${id} -> ${neighborId} has no floor at t=${t.toFixed(2)}`);
        }
      }
    }

    // Both bridge ends must reach across the stairwell cut, not dead-end on it.
    for (const id of lane.bridgeIds) {
      const wp = byId.get(id)!;
      const inCut = wp.pos.z > lane.cut.min && wp.pos.z < lane.cut.max;
      assert.equal(inCut, false, `${id} sits inside the ${lane.side} stairwell cut`);
    }
    assert.ok(
      byId.get(lane.bridgeIds[0])!.neighbors.some((id) => lane.northOfCut(byId.get(id)!.pos.z)),
      `${lane.bridgeIds[0]} needs a neighbour north of the ${lane.side} stairwell`
    );
    assert.ok(
      byId.get(lane.bridgeIds[1])!.neighbors.some((id) => lane.southOfCut(byId.get(id)!.pos.z)),
      `${lane.bridgeIds[1]} needs a neighbour south of the ${lane.side} stairwell`
    );
  }
});

test('both walkways carry staggered crate cover clear of the stairwells', () => {
  for (const side of [-1, 1]) {
    const cut = side < 0 ? { min: -18, max: -10 } : { min: 10, max: 18 };
    const outboard = (c: (typeof solid)[number]) => (side < 0 ? c.max.x < -10.4 : c.min.x > 10.4);

    const caps = solid.filter(
      (c) => c.min.y > 0.9 && c.max.y >= 1.2 && c.max.y <= 1.7 && outboard(c)
    );
    assert.equal(caps.length, 1, `${side < 0 ? 'port' : 'starboard'} walkway needs one crate cluster`);

    const cap = caps[0];
    assert.ok(
      cap.max.z < cut.min || cap.min.z > cut.max,
      `${side < 0 ? 'port' : 'starboard'} crate cluster sits in the stairwell`
    );

    const base = solid.some(
      (c) =>
        c.min.y >= 0 && c.max.y >= 0.9 && c.max.y <= 1.1 &&
        c.min.x < cap.max.x && c.max.x > cap.min.x &&
        c.min.z < cap.max.z && c.max.z > cap.min.z
    );
    assert.ok(base, `${side < 0 ? 'port' : 'starboard'} crate cluster has no base box`);
  }
});

test('both upper firing faces are railed across the internal-stair mouth', () => {
  for (const m of [1, -1]) {
    const faceZ = -35 * m;
    const lo = Math.min(3.4 * m, 5.8 * m);
    const hi = Math.max(3.4 * m, 5.8 * m);

    const rails = solid.filter(
      (c) =>
        c.min.y >= 4.5 && c.max.y >= 5.4 && c.max.y <= 6.0 &&
        c.min.z <= faceZ + 0.2 && c.max.z >= faceZ - 0.2 &&
        c.max.x > lo && c.min.x < hi
    );
    assert.ok(rails.length > 0, `no railing on the firing face at z ${faceZ}`);

    const coveredLo = Math.min(...rails.map((r) => r.min.x));
    const coveredHi = Math.max(...rails.map((r) => r.max.x));
    assert.ok(
      coveredLo <= lo + 0.2 && coveredHi >= hi - 0.2,
      `stair mouth ${lo}..${hi} at z ${faceZ} is unguarded (rail spans ${coveredLo}..${coveredHi})`
    );
  }
});
