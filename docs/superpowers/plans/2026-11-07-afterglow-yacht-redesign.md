# Afterglow Yacht Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the yacht as an original two-cabin sunset arena inspired by Hijacked's structure, with working spawns, bot waypoints, minimap, and a warm palette.

**Architecture:** Keep the single `buildHijackedMap()` entry point and `MapData` contract. Rebuild its geometry in place, add a ceiling-resolution fix to `PlayerPhysics`, then swap the scene environment/lighting and update map-facing UI copy and minimap. All geometry stays merged per material and every route stays waypoint-driven.

**Tech Stack:** TypeScript, Three.js, React, node:test, Vite.

**Spec:** `docs/superpowers/specs/2026-11-07-afterglow-yacht-redesign.md`

## Global Constraints

- Hull footprint stays x −12.2..12.2, z −54..54; rails at x ±12.2 and z ±54.2.
- Player: radius 0.45, step height 0.55, height 1.8 (1.0 sliding), run 12 m/s, jump apex ~1.5 m.
- Bots climb treads ≤ 0.35 m; the 4.6 m cabin flights use 14 treads at 0.33 m rise × 0.8 m run; the 3.4 m maintenance descents use 10 treads at 0.34 m rise × 0.8 m run.
- Glass is walk-through (`noCollider: true`) but a bullet blocker (`blocksBullets: true`); exactly 4 panes.
- Every solid box is a bullet blocker by default.
- Waypoint edges: ≤ 12 m, bidirectional; flat edges (endpoint Δy < 0.6) must be clear of solid colliders at chest height (lower y + 0.9).
- Budgets: ≤ 260 colliders, ≤ 300 bullet blockers, ≤ 140 draw calls, ≤ 8 real point lights, map build ≤ 60 ms.
- User-facing name **AFTERGLOW**, subtitle **Sunset Charter Arena**. Internal id stays `hijacked`.
- Keep `import.meta.env?.DEV` guards so the map builds under `tsx`.
- Commit identity: `git -c user.name="palashsuryavanshi" -c user.email="palashsuryavanshi0@proton.me"`.
- Before every commit: `npm run lint`, `node node_modules/tsx/dist/cli.mjs --test src/game/*.test.ts`, `node node_modules/vite/bin/vite.js build`.

## File Structure

- `src/game/mapHijacked.ts` — all geometry, materials, sky, spawns, waypoints, map update. Rewritten in place.
- `src/game/mapHijacked.test.ts` — layout contract, spawns, waypoints, glass, budgets.
- `src/game/playerPhysics.ts` — ceiling clamp in `resolveCollisions`.
- `src/game/playerPhysics.test.ts` — low-ceiling regression.
- `src/game/engine.ts` — sky PMREM, sun/hemisphere/fog, exposure hold.
- `src/components/HUD.tsx` — minimap redraw + label.
- `src/components/GameSetupScreen.tsx`, `TitleScreen.tsx`, `LoadoutScreen.tsx`, `MainMenu.tsx`, `GameOverModal.tsx` — Afterglow copy.
- `GLOSSARY.md` — Afterglow term.

## Review Focus

- **Jumping under the lounge roof or maintenance ceiling** must clamp, not eject the player sideways.
- **A bot crossing a flat waypoint edge** must not be driven through a wall; edge clearance is tested.
- **Spawning on the upper floor** must land on the 4.6 m slab, not fall through or spawn inside geometry.
- **Walking the two stairwells** must not drop the player into the ocean (`y < -3.5` teleports to spawn).
- **Glass panes** must block bullets but remain walk-through, with no pane on an upper firing face.

---

### Task 1: Ceiling collision clamp

**Files:**
- Modify: `src/game/playerPhysics.ts:203-235`
- Test: `src/game/playerPhysics.test.ts`

**Interfaces:**
- Consumes: `PlayerPhysics.update(dt, { keys, yaw, isAds, colliders }, events)`, `BoxCollider`.
- Produces: unchanged public API; `resolveCollisions` additionally clamps upward motion under overhead boxes.

- [ ] **Step 1: Write the failing test**

```ts
test('jumping under a low ceiling clamps instead of ejecting sideways', () => {
  const body = new PlayerPhysics();
  body.reset(new THREE.Vector3(0, 0, 0));
  body.isGrounded = true;
  body.queueJump();

  const ceiling: BoxCollider = {
    min: new THREE.Vector3(-2, 2.0, -2),
    max: new THREE.Vector3(2, 2.4, 2),
  };

  for (let i = 0; i < 60; i++) {
    body.update(1 / 120, {
      keys: new Set(['Space']),
      yaw: 0,
      isAds: false,
      colliders: [floor(0), ceiling],
    });
  }

  assert.ok(body.pos.y <= 0.21, `expected y <= 0.21, got ${body.pos.y}`);
  assert.ok(Math.abs(body.pos.x) < 1e-6, `x drifted to ${body.pos.x}`);
  assert.ok(Math.abs(body.pos.z) < 1e-6, `z drifted to ${body.pos.z}`);
});
```

- [ ] **Step 2: Run it and verify failure**

Run: `node node_modules/tsx/dist/cli.mjs --test src/game/playerPhysics.test.ts`
Expected: FAIL — x or z drifts away from 0.

- [ ] **Step 3: Implement the clamp**

In `resolveCollisions`, after ground detection and before the horizontal loop, add an ascending-ceiling pass. A box is a ceiling when it overlaps the player's horizontal footprint and `c.min.y > this.pos.y + playerHeight * 0.5`. While `this.vel.y > 0` and `nextPos.y + playerHeight > c.min.y`, set `nextPos.y = c.min.y - playerHeight` and `this.vel.y = 0`. Then in the horizontal loop, skip boxes whose underside is at or above the player's head (`c.min.y >= nextPos.y + playerHeight - 0.01`) so the same box cannot also push horizontally.

- [ ] **Step 4: Run both physics files**

Run: `node node_modules/tsx/dist/cli.mjs --test src/game/playerPhysics.test.ts`
Expected: PASS, all physics tests green.

- [ ] **Step 5: Commit**

```bash
git add src/game/playerPhysics.ts src/game/playerPhysics.test.ts
git -c user.name="palashsuryavanshi" -c user.email="palashsuryavanshi0@proton.me" commit -m "fix(physics): clamp jumps against low ceilings"
```

---

### Task 2: Map layout contract tests

**Files:**
- Modify: `src/game/mapHijacked.test.ts`
- Test: same

**Interfaces:**
- Consumes: `buildHijackedMap(): MapData`, `MapData.colliders`, `.bulletBlockers`, `.spawnPoints`, `.waypoints`.
- Produces: the assertions Tasks 3–7 must satisfy.

- [ ] **Step 1: Replace the test file with the contract**

```ts
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

```ts
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
```

- [ ] **Step 2: Run it and verify failure**

Run: `node node_modules/tsx/dist/cli.mjs --test src/game/mapHijacked.test.ts`
Expected: FAIL on the four-glass or spawn/waypoint assertions against the old map.

- [ ] **Step 3: Commit the red tests**

```bash
git add src/game/mapHijacked.test.ts
git -c user.name="palashsuryavanshi" -c user.email="palashsuryavanshi0@proton.me" commit -m "test(map): pin the Afterglow layout contract"
```

### Task 3: Hull shell, decks, and zone slabs

**Files:**
- Modify: `src/game/mapHijacked.ts` (hull/deck section, ~lines 181–229)

**Interfaces:**
- Consumes: `createSolidBox(w,h,d,x,y,z,mat,options)`, `addCollider`, `addBulletBlocker`, `materialByUuid`.
- Produces: deck and hull geometry for Tasks 4–7. No new exported symbols.

- [ ] **Step 1: Add the zone constants**

At the top of `buildHijackedMap`, before geometry, define:

```ts
const ZONE = {
  bowDeck: { min: -54, max: -36 },
  bowCabin: { min: -36, max: -18 },
  center: { min: -18, max: 18 },
  sternCabin: { min: 18, max: 36 },
  sternDeck: { min: 36, max: 54 },
} as const;
```

- [ ] **Step 2: Rebuild the deck as five non-overlapping sections**

Replace the five existing teak slabs (`mapHijacked.ts:207-219`) with one full-width slab per zone: bow deck and stern deck `24.4 × 18`, central deck `24.4 × 36`, and two cabin floors `17 × 18` at x −8.5..8.5. Every slab is `0.4` thick with its top at `y = 0`. Keep `renderOrder: 0`.

- [ ] **Step 3: Rebuild the hull as a hollow shell**

Replace the two solid hull boxes (`mapHijacked.ts:185-194`) with:

- Outer port/starboard walls: `0.3 × 6.0 × 108` at x `∓12.05`, y `−6.4`.
- A bottom slab `24.4 × 0.3 × 108` at y `−6.7`.
- A deck undertray `21.8 × 0.3 × 108` at y `−0.7`, leaving the service corridors open.
- Keep the existing bow cone at `(0, −1, −66)`.

Only the outer walls and undertray register colliders. The hollow interior is intentionally walkable at `y = −3.4`.

- [ ] **Step 4: Keep rails, helipad, ocean, islands**

Keep the perimeter rails at x ±12.2 and z ±54.2. Move the helipad base to `(0, 0, −45)` and resize it to `10 × 0.15 × 10`; keep the yellow ring and `H` bars. Ocean, wake, and islands stay until Task 8 changes their materials.

- [ ] **Step 5: Run the map test**

Run: `node node_modules/tsx/dist/cli.mjs --test src/game/mapHijacked.test.ts`
Expected: budget and footprint assertions pass; glass/spawns still fail (later tasks).

- [ ] **Step 6: Commit**

```bash
git add src/game/mapHijacked.ts
git -c user.name="palashsuryavanshi" -c user.email="palashsuryavanshi0@proton.me" commit -m "feat(map): rebuild the yacht hull and five-zone deck"
```

---

### Task 4: Cabins, stairs, upper rooms, and glass

**Files:**
- Modify: `src/game/mapHijacked.ts` (cabin section, ~lines 264–378)

**Interfaces:**
- Consumes: Task 3 zone constants and `createSolidBox`.
- Produces: mirrored cabins with internal/external stairs, upper firing rooms, and 4 glass panes.

- [ ] **Step 1: Add a stair helper**

Add an internal helper:

```ts
function addStairRun(
  x: number, zStart: number, zDirection: 1 | -1,
  width: number, steps: number, rise: number, run: number,
  mat: THREE.Material
): void
```

Each tread is `createSolidBox(width, rise, run, x, i * rise, zStart + zDirection * i * run, mat)`, `i = 0..steps-1`.

- [ ] **Step 2: Build the bow cabin**

Use the spec's bow-cabin section. Ground floor: central hall x −3..3, port/starboard rooms, front/rear doorways, side doorways at z −27. Ground cover: bar counter, sofas, partition column. Internal stair: `addStairRun(7.0, -23.4, -1, 2.4, 14, 0.33, 0.8, matDarkCarbon)`. External stair: `addStairRun(10.2, -47.2, 1, 2.0, 14, 0.33, 0.8, matBrass)`, with a landing at y 4.6, z −36..−34.5.

Upper floor slab at y 4.6 with a stairwell opening at x 5.8..8.2, z −35..−23.4. Upper room x −7..7, z −35..−19, ceiling at 8.2, open on z −35 and z −19 with 1.0 m railings, solid outboard walls.

- [ ] **Step 3: Mirror the stern cabin**

Mirror every bow-cabin box across z = 0: internal stair at x −7.0 running z 23.4→34.6, external stair at x −10.2 running z 47.2→36, upper room z 19..35.

- [ ] **Step 4: Add the four glass panes**

On each outboard cabin wall, one pane beside the walkway doorway:

```ts
createSolidBox(0.4, 3.8, 4, ±8.5, 0.2, ∓27, matGlassTinted, {
  renderOrder: 1, noCollider: true, blocksBullets: true,
});
```

Use x `−8.5` and `+8.5`, and z `−27` and `+27` so the four panes are distinct and sit inside the two cabin spans (z −36..−18 and 18..36), beside the walkway doorways. No glass on upper firing faces.

- [ ] **Step 5: Run the map test**

Run: `node node_modules/tsx/dist/cli.mjs --test src/game/mapHijacked.test.ts`
Expected: glass count now passes; spawns/waypoints still fail.

- [ ] **Step 6: Commit**

```bash
git add src/game/mapHijacked.ts
git -c user.name="palashsuryavanshi" -c user.email="palashsuryavanshi0@proton.me" commit -m "feat(map): add mirrored cabins and upper firing rooms"
```

---

### Task 5: Central deck and maintenance lane

**Files:**
- Modify: `src/game/mapHijacked.ts` (central/stern/maintenance sections)

**Interfaces:**
- Consumes: Tasks 3–4 geometry.
- Produces: pool, lounge, planter, stairwells, and the below-deck tunnel.

- [ ] **Step 1: Build the central deck**

- Pool: x −8.2..−2.8, z −7..7. Curb `0.4 × 0.4` around a shallow basin; water plane at y 0.08, no collider.
- Lounge: x 2.8..8.2, z −7..7. Roof `5.4 × 0.2 × 14` at y 3.2 on four `0.25 × 3.2 × 0.25` columns. Sofas, table, bar shelf.
- Centre planter: `2.8 × 1.2 × 6` at (0, 0, 0) with a small mast/palm on top.
- Benches: `2.0 × 0.7 × 1.0` at (0, 0, ±11).

- [ ] **Step 2: Build both maintenance stairwells**

Starboard: 10 treads × 0.34 m rise from `(10.2, 0, 10)` descending to `(10.2, −3.4, 18)`. Port: mirrored at x −10.2 from z −10 to −18. Cut the central deck floor strips around x ±(8.5..12.2), z ±(10..18) so the openings are real; add 1.0 m brass rails on the open sides.

- [ ] **Step 3: Build the tunnel**

Floor `5.2 × 0.3 × 72` at y −3.4, x −2.6..2.6, z −36..36. Side walls `0.3 × 3.4 × 72` at x ±2.75. Ceiling is the deck undertray from Task 3. Side branches at z 14 (starboard) and z −14 (port) connect x ±10.2 to x ±2.6. Bulkheads at z ±12 and ±24. Two crate clusters inside.

- [ ] **Step 4: Add practical lights**

Four amber `THREE.PointLight(0xffa53a, 0.7, 9)` at `(0, -1.2, z)` for z `-24, -8, 8, 24`, each with an emissive fixture box. Add warm cabin lights (`0xffb46b`, 0.8, 12) and one lounge light (`0xffc07a`, 0.6, 10). Total point lights: 7.

- [ ] **Step 5: Run the map test**

Run: `node node_modules/tsx/dist/cli.mjs --test src/game/mapHijacked.test.ts`
Expected: budgets and spawn-ground checks approach passing.

- [ ] **Step 6: Commit**

```bash
git add src/game/mapHijacked.ts
git -c user.name="palashsuryavanshi" -c user.email="palashsuryavanshi0@proton.me" commit -m "feat(map): add central deck and maintenance lane"
```

---

### Task 6: Spawns and waypoint graph

**Files:**
- Modify: `src/game/mapHijacked.ts` (spawn/waypoint section, ~lines 532–582)

**Interfaces:**
- Consumes: Tasks 3–5 geometry.
- Produces: `spawnPoints` with 8 entries and a connected waypoint graph with the spec's ids.

- [ ] **Step 1: Replace spawns**

```ts
const spawnPoints = [
  new THREE.Vector3(0, 0.1, -46),
  new THREE.Vector3(-9.5, 0.1, -42),
  new THREE.Vector3(9.5, 0.1, -42),
  new THREE.Vector3(0, 0.1, 46),
  new THREE.Vector3(-9.5, 0.1, 42),
  new THREE.Vector3(9.5, 0.1, 42),
  new THREE.Vector3(0, 4.6, -28),
  new THREE.Vector3(0, 4.6, 28),
];
```

- [ ] **Step 2: Replace the waypoint graph**

Build ~38 nodes with these ids and areas: `bow_heli`, `bow_port`, `bow_star`, `bow_cabin_door`, `bow_hall`, `bow_port_room`, `bow_star_room`, `bow_stair_bottom`, `bow_stair_top`, `upper_bow`, `bow_ext_bottom`, `bow_ext_top`, `port_north`, `port_mid`, `port_south`, `star_north`, `star_mid`, `star_south`, `center_north`, `pool_edge`, `lounge`, `center_south`, `stern_cabin_door`, `stern_hall`, `stern_port_room`, `stern_star_room`, `stern_stair_bottom`, `stern_stair_top`, `upper_stern`, `stern_ext_bottom`, `stern_ext_top`, `stern_jacuzzi`, `maint_star_bottom`, `maint_star_junction`, `maint_port_bottom`, `maint_port_junction`, `maint_north`, `maint_center`, `maint_south`.

Every edge must be bidirectional and ≤ 12 m. Keep `bow_heli`, `upper_*`, `port_*`, and `star_*` prefixes because `botAI.ts:883-886` uses them. Use these y values: decks 0.1, upper rooms 4.6, maintenance −3.3. The junction nodes sit at `(±2.6, −3.3, ±14)` so the tunnel connections stay inside the 12 m edge limit.

- [ ] **Step 3: Run the map test**

Run: `node node_modules/tsx/dist/cli.mjs --test src/game/mapHijacked.test.ts`
Expected: PASS for footprints, budgets, glass, spawns, neighbour links, BFS connectivity, and flat-edge clearance.

- [ ] **Step 4: Commit**

```bash
git add src/game/mapHijacked.ts
git -c user.name="palashsuryavanshi" -c user.email="palashsuryavanshi0@proton.me" commit -m "feat(map): add Afterglow spawns and waypoint graph"
```

### Task 7: Sunset palette, sky, and water

**Files:**
- Modify: `src/game/mapHijacked.ts` (palette materials, ocean/islands, new sky section)

**Interfaces:**
- Consumes: existing `createSolidBox` material buckets.
- Produces: `MapData.skyDome: THREE.Mesh` for Task 8's PMREM. Update the interface:

```ts
export interface MapData {
  sceneGroup: THREE.Group;
  colliders: BoxCollider[];
  bulletBlockers: BoxCollider[];
  spawnPoints: THREE.Vector3[];
  waypoints: WaypointNode[];
  skyDome: THREE.Mesh;
  update: (time: number, dt: number) => void;
}
```

- [ ] **Step 1: Replace the palette values**

Update the existing materials to the spec's hex values: hull `#f1e4cf`, trim `#d9c3a4`, teak `#9c5f36`, teak highlight `#b3784a`, cover accent `#c25a38`, navy `#1e3446`, brass `#b08a4f`, dark metal `#24262b`, glass `#2b6f6a` (opacity 0.42), pool `#37c6b0`, ocean `#0a4b52`, cushion `#e6d6ba`, hazard `#e2a13c`, island `#3c5b48` with a `#d9c08a` sand ring.

- [ ] **Step 2: Add the procedural teak texture**

Add `makeTeakTexture(): THREE.Texture | null`. Return `null` when `typeof document === 'undefined'` so `tsx` tests still build. Otherwise draw a 128×128 canvas with a `#9c5f36` base and darker `#7a4426` seams every 12 px, set `colorSpace = THREE.SRGBColorSpace`, `wrapS/T = RepeatWrapping`, `repeat.set(8, 24)`, and assign it as `matTeakDeck.map`. Set `needsUpdate = true`.

- [ ] **Step 3: Add the sky dome**

Export nothing new; build a mesh inside `buildHijackedMap` and return it as `skyDome`:

- `SphereGeometry(400, 32, 16)`, `MeshBasicMaterial({ side: THREE.BackSide, vertexColors: true, fog: false, depthWrite: false })`.
- Vertex colours: horizon `#ffca9c` below y 0.05, zenith `#3f6699` above y 0.7, linear blend between.
- `renderOrder = -2`; add to `root`.
- Add a `CircleGeometry(14, 32)` sun disc at `(220, 26, 300)` facing the origin, `MeshBasicMaterial({ color: 0xfff1c9, fog: false })`, renderOrder −1.

- [ ] **Step 4: Retune water and islands**

Ocean `MeshStandardMaterial({ color: 0x0a4b52, roughness: 0.1, metalness: 0.6, transparent: true, opacity: 0.94, depthWrite: false })`. Keep the wave animation. Add a thin sand `CylinderGeometry` ring under each island cone. Desaturate island green to `#3c5b48`.

- [ ] **Step 5: Run the map test and build**

Run: `node node_modules/tsx/dist/cli.mjs --test src/game/mapHijacked.test.ts`
Expected: PASS under node with the texture guard returning null.
Run: `node node_modules/vite/bin/vite.js build`
Expected: success.

- [ ] **Step 6: Commit**

```bash
git add src/game/mapHijacked.ts
git -c user.name="palashsuryavanshi" -c user.email="palashsuryavanshi0@proton.me" commit -m "feat(map): apply the sunset palette and sky dome"
```

---

### Task 8: Engine sky environment and lighting

**Files:**
- Modify: `src/game/engine.ts:245-293` (initScene)
- Test: browser smoke in Task 10

**Interfaces:**
- Consumes: `mapData.skyDome`, `THREE.PMREMGenerator`.
- Produces: `scene.environment` generated from the sky dome; updated sun, hemisphere, background, and fog.

- [ ] **Step 1: Swap background and fog**

Set `this.scene.background = new THREE.Color(0xffca9c)` and `this.scene.fog = new THREE.FogExp2(0xe6a983, 0.0026)`.

- [ ] **Step 2: Generate the PMREM from the sky dome**

Replace the `RoomEnvironment` block with:

```ts
const pmrem = new THREE.PMREMGenerator(this.renderer!);
const skyScene = new THREE.Scene();
skyScene.add(this.mapData.skyDome.clone());
this.scene.environment = pmrem.fromScene(skyScene, 0.04).texture;
pmrem.dispose();
```

Remove the now-unused `RoomEnvironment` import. Build the map before this block (move `buildHijackedMap()` above the PMREM lines if needed).

- [ ] **Step 3: Retune the lights**

Sun: `0xffd0a0`, intensity `2.4`, position `(38, 30, 58)`, keep the 2048 shadow map and ±85 bounds. Hemisphere: sky `0xa9c9e8`, ground `0x5d4335`, intensity `0.65`. Keep exposure `1.05` and ACES.

- [ ] **Step 4: Run lint and build**

Run: `npm run lint`
Expected: exit 0.
Run: `node node_modules/vite/bin/vite.js build`
Expected: success.

- [ ] **Step 5: Commit**

```bash
git add src/game/engine.ts
git -c user.name="palashsuryavanshi" -c user.email="palashsuryavanshi0@proton.me" commit -m "feat(render): light the scene from the sunset sky"
```

---

### Task 9: Minimap and Afterglow copy

**Files:**
- Modify: `src/components/HUD.tsx:216-269`
- Modify: `src/components/GameSetupScreen.tsx:34-37`
- Modify: `src/components/TitleScreen.tsx:75`
- Modify: `src/components/LoadoutScreen.tsx:82`
- Modify: `src/components/MainMenu.tsx:62`
- Modify: `src/components/GameOverModal.tsx:44-45`

**Interfaces:**
- Consumes: existing `minimapData` shape and normalisation.
- Produces: user-facing Afterglow labels and a two-cabin minimap.

- [ ] **Step 1: Redraw the minimap**

In `HUD.tsx`, replace the single central cabin box with two amber blocks at roughly 30% and 70% height (the bow and stern cabins). Add a cyan pool block left of centre and a cream lounge block right of centre, keep the `H` near 17% height and the jacuzzi near 83%, and change the label to `AFTERGLOW RADAR`.

- [ ] **Step 2: Update copy**

- `GameSetupScreen`: name `Afterglow`, subtitle `Sunset Charter Arena`, description `Twin-cabin superyacht split by an open pool deck, with full-length walkways, upper vantage rooms, and a below-deck service lane.`
- `TitleScreen`: `AFTERGLOW YACHT MAP`.
- `LoadoutScreen`: `Equip your primary firearm for the Afterglow yacht match`.
- `MainMenu`: `AFTERGLOW — ORIGINAL YACHT ARENA`.
- `GameOverModal`: `You dominated the Afterglow yacht skirmish!` / `Enemy forces overrun the yacht deck. Regroup and redeploy.`

- [ ] **Step 3: Run lint**

Run: `npm run lint`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add src/components
git -c user.name="palashsuryavanshi" -c user.email="palashsuryavanshi0@proton.me" commit -m "feat(ui): label the map Afterglow and redraw the minimap"
```

---

### Task 10: Full verification, docs, and browser smoke

**Files:**
- Modify: `docs/superpowers/specs/2026-11-07-afterglow-yacht-redesign.md` (status → Approved)
- Modify: `GLOSSARY.md`

- [ ] **Step 1: Run the full gate**

```bash
npm run lint
node node_modules/tsx/dist/cli.mjs --test src/game/*.test.ts
node node_modules/vite/bin/vite.js build
```

Expected: lint exit 0, all tests pass, build succeeds.

- [ ] **Step 2: Browser smoke test**

Open `http://localhost:3000`, start a match through `RUSHKILL ARMORY` → `DEPLOY TO THE YACHT`, confirm the HUD and minimap render, capture screenshots from the bow, central deck, upper room, and maintenance tunnel, and check the console for errors. Report the HUD FPS.

- [ ] **Step 3: Update docs**

Set the spec status to `Approved`. Add to `GLOSSARY.md`:

```md
**Afterglow**:
The current yacht arena: mirrored bow/stern cabins around an open central pool deck, with full-length walkways, upper firing rooms, and a below-deck service lane.
_Avoid_: Hijacked (that is the inspiration, not this map)
```

- [ ] **Step 4: Commit and push**

```bash
git add docs GLOSSARY.md
git -c user.name="palashsuryavanshi" -c user.email="palashsuryavanshi0@proton.me" commit -m "docs: record the Afterglow map"
git push origin main
```

---

## Self-Review

- **Spec coverage:** layout zones (Tasks 3–5), palette/sky (Tasks 7–8), ceiling fix (Task 1), spawns/waypoints (Task 6), HUD/copy (Task 9), verification/docs (Task 10). No spec section is unassigned.
- **Step scan:** each step names a file, a signature, or a test; no TBDs.
- **Type consistency:** `MapData.skyDome` is added in Task 7 and consumed in Task 8; `addStairRun` and `makeTeakTexture` are defined in their own tasks and only used there.
- **Review focus:** ceiling clamp (Task 1), wall-crossing edges (Task 2), upper-floor spawns (Task 2), ocean-fall stair test is covered by the spawn/edge tests and browser pass, glass firing faces (Task 4).
- **Proportion:** the plan defers exact prop coordinates to the spec and does not reproduce implementation bodies except for the one algorithm (ceiling clamp) and the tests.


