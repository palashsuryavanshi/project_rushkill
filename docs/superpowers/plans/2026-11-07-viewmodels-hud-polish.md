# Viewmodels, HUD Polish, Scoreboard, Minimap, and Below-Deck Removal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the approved design: a shared hands-and-irons viewmodel rig with real ADS and reload/lever/pump motion, a health-bar-only HUD, a hold-TAB scoreboard, a metre-accurate SVG minimap, and removal of the unsafe below-deck tunnel and its stairs.

**Architecture:** Pure modules own the decisions that can be tested without a browser (`viewmodelPose.ts`, `scoreboard.ts`, `minimap.ts`). `gunModels.ts` builds per-weapon geometry and anchors; `viewmodel.ts` adds shared hands and lights; `engine.ts` composes poses from the existing timers. HUD and App consume new engine callbacks and metre-based minimap data.

**Tech Stack:** React 19, TypeScript, Three.js, Vite, Node `node:test` via `tsx`, Tailwind.

**Spec:** `docs/superpowers/specs/2026-11-07-viewmodels-hud-polish-design.md`

## Global Constraints

- Live weapons and categories stay `mcw`/`AR`, `rival_9`/`SMG`, `lockwood_680`/`Shotgun`, `longbow`/`Sniper`. Display names are exactly `AR`, `SMG`, `Shotgun`, `Sniper`.
- Do not change damage, headshot multipliers, fire rates, spread, falloff, movement, respawn timing, health regen, or match-end rules.
- The only rules-adjacent change is bot kill credit for killing the player (Task 4).
- `PlayerStats.speed` stays in the payload; only its HUD display is removed.
- The sniper keeps its existing full-screen `SNIPER OPTIC` overlay and FOV zoom.
- No below-deck route remains: every waypoint is at deck level (`y ≥ −0.1`) or upper deck (`y ≈ 4.6`).
- Existing 86 tests stay green. New tests cover map removal, minimap math, scoreboard sorting, pose math, and gun-rig anchors.
- Gates before every commit and before push:
  - `npm run lint`
  - `node node_modules/tsx/dist/cli.mjs --test src/game/*.test.ts`
  - `node node_modules/vite/bin/vite.js build`
- Work on `main`. Before pushing, `git fetch origin` and confirm `origin/main` is the expected parent. Commit identity is `palashsuryavanshi <palashsuryavanshi0@proton.me>`.
- PowerShell treats stderr as an error: check `$LASTEXITCODE`; do not use `head`, `tail`, `sed`, or `awk`.

## Review Focus

1. **Walking the former stairwell cuts at x ±10.2** must be solid deck; the player must never fall through or trigger an ocean death. Pinned by Task 1's continuity test.
2. **Bot traversal** must not reference removed below-deck waypoints; the graph must stay connected and every edge must remain ≤ 12 m. Pinned by Task 1 tests plus the existing connectivity/edge tests.
3. **Holding TAB while pointer-locked** must show the board without releasing the mouse; releasing TAB, pausing, or blurring must hide it. Pinned by Task 5 browser QA and Task 9 QA.
4. **ADS on all four weapons** must center the modeled sight/scope, with no leftover screen dot; partial ADS must not snap. Pinned by Task 6's alignment test and Task 8/9 screenshots.
5. **Minimap at hull extremes and four yaw values** must keep blips inside the hull and point the arrow the way the player looks. Pinned by Task 2 tests and Task 9 QA.

---

### Task 1: Remove the below-deck tunnel and maintenance stairs

**Files:**
- Modify: `src/game/mapHijacked.ts:196` (material), `:236` (material map), `:254-259` (hull/undertray), `:452-465` (stairwells/ledges), `:493-519` (tunnel), `:563-567` (tunnel lights), `:718`, `:730` (neighbor links), `:761-770` (maint waypoints)
- Test: `src/game/mapHijacked.test.ts`

**Interfaces:**
- Consumes: existing `buildHijackedMap(): MapData` and `BoxCollider`.
- Produces: no new API. The map keeps the same `MapData` shape; `waypoints` no longer contains `maint_*`, and no walkable collider sits below y −0.45.

- [ ] **Step 1: Write the failing tests**

Append to `src/game/mapHijacked.test.ts`:

```ts
test('no walkable geometry remains below deck', () => {
  for (const c of solid) {
    const spanX = c.max.x - c.min.x;
    const spanZ = c.max.z - c.min.z;
    if (Math.min(spanX, spanZ) >= 0.8 && c.max.y <= -0.45) {
      assert.fail(
        `below-deck surface ${spanX.toFixed(1)}x${spanZ.toFixed(1)} at y ${c.max.y.toFixed(2)}`
      );
    }
  }
});

test('both walkways are continuously decked across the former stairwell cuts', () => {
  const lanes = [
    { x: -10.2, from: -18, to: -10 },
    { x: 10.2, from: 10, to: 18 },
  ];
  for (const lane of lanes) {
    for (let z = lane.from; z <= lane.to; z += 0.5) {
      const deck = solid.some(
        (c) =>
          lane.x > c.min.x && lane.x < c.max.x &&
          z > c.min.z && z < c.max.z &&
          Math.abs(c.max.y) < 0.05
      );
      assert.ok(deck, `no deck at x ${lane.x}, z ${z}`);
    }
  }
});

test('no maintenance waypoints remain and nothing sits below deck', () => {
  assert.equal(map.waypoints.some((w) => w.id.startsWith('maint_')), false);
  for (const wp of map.waypoints) {
    assert.ok(wp.pos.y >= -0.1, `${wp.id} is below deck at y ${wp.pos.y}`);
  }
});
```

- [ ] **Step 2: Run the map test and verify it fails**

Run: `node node_modules/tsx/dist/cli.mjs --test src/game/mapHijacked.test.ts`
Expected: FAIL on `below-deck surface` and `no deck at x -10.2`; the walkway gap has no floor at that x.

- [ ] **Step 3: Remove the tunnel, stairs, and stale references**

In `src/game/mapHijacked.ts`:

1. Replace the five-piece undertray at lines 258-264 with one slab:
   `createSolidBox(21.8, 0.3, 108, 0, -0.7, 0, matDarkMetal);`
2. Delete the maintenance stair loop and the two brass rails at x ±8.55 (lines 452-459). Keep the two staggered crate clusters and the life-ring stations.
3. Delete the two outboard service ledges at x ±11.7 (lines 462-463).
4. Add full-width teak deck over both former cuts:
   - `createSolidBox(3.7, 0.4, 8, -10.35, -0.4, -14, matTeakDeck, { renderOrder: 0 });`
   - `createSolidBox(3.7, 0.4, 8, 10.35, -0.4, 14, matTeakDeck, { renderOrder: 0 });`
5. Delete the entire `// 5. BELOW-DECK MAINTENANCE TUNNEL` section, including its header, floor, walls, branches, end caps, bulkhead frames, and crate clusters (lines 493-519).
6. Delete the four tunnel light fixtures and point lights inside the `for (const z of [-24, -8, 8, 24])` loop. Change the comment to `// Warm practicals: two cabin, one lounge = 3 point lights.`
7. Delete `matTunnelMetal` (line 196) and its `[matTunnelMetal.uuid, matTunnelMetal]` entry (line 236).
8. In `port_mid`, remove `'maint_port_bottom'` from `neighbors`. In `star_south`, remove `'maint_star_bottom'`.
9. Delete all nine `maint_*` waypoint entries and the `// Maintenance tunnel` comment (lines 761-770).

- [ ] **Step 4: Run the map test and verify it passes**

Run: `node node_modules/tsx/dist/cli.mjs --test src/game/mapHijacked.test.ts`
Expected: PASS, including the existing footprint, spawn, connectivity, and edge-clearance tests.

- [ ] **Step 5: Commit**

```bash
git add src/game/mapHijacked.ts src/game/mapHijacked.test.ts
git commit -m "fix(map): remove below-deck tunnel and maintenance stairs"
```

---

### Task 2: Metre-based minimap module and SVG radar

**Files:**
- Create: `src/game/minimap.ts`
- Test: `src/game/minimap.test.ts`
- Modify: `src/components/HUD.tsx:217-277`

**Interfaces:**
- Consumes: player `{ x, z, angle }` and bots `{ id, x, z, isDead }[]` from the existing `minimapData` prop.
- Produces:
  - `MINIMAP_VIEW = { x: -12.2, y: -54, width: 24.4, height: 108 }`
  - `HULL_PATH: string`
  - `MAP_ZONES: ReadonlyArray<{ id: string; x: number; y: number; width: number; height: number }>`
  - `MAP_FEATURES: ReadonlyArray<{ id: string; kind: 'rect' | 'circle'; x: number; y: number; width?: number; height?: number; radius?: number }>`
  - `projectToMap(x: number, z: number): { x: number; y: number }`
  - `playerRotationDeg(yaw: number): number`

- [ ] **Step 1: Write the failing tests**

Create `src/game/minimap.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `node node_modules/tsx/dist/cli.mjs --test src/game/minimap.test.ts`
Expected: FAIL with `Cannot find module './minimap'`.

- [ ] **Step 3: Implement `src/game/minimap.ts`**

Export the constants and identity projection. Feature values:

- `pool`: rect `x -7.8, y -6.6, width 4.6, height 13.2`
- `lounge`: rect `x 2.8, y -7, width 5.4, height 14`
- `planter`: rect `x -1.4, y -3, width 2.8, height 6`
- `helipad`: circle `x 0, y -45, radius 5`
- `jacuzzi`: rect `x -2.6, y 47.4, width 5.2, height 5.2`

Zones: bow deck `y -54 h 18`, bow cabin `y -36 h 18`, centre `y -18 h 36`, stern cabin `y 18 h 18`, stern deck `y 36 h 18`, each `x -12.2, width 24.4`.

`HULL_PATH` stays inside the viewBox and tapers at the bow:

```ts
export const HULL_PATH =
  'M 0 -54 L 11.4 -46 L 12.2 -38 L 12.2 52 Q 12.2 54 10.2 54 L -10.2 54 Q -12.2 54 -12.2 52 L -12.2 -38 L -11.4 -46 Z';
```

`playerRotationDeg` returns `-yaw * 180 / Math.PI`, normalized into `(-180, 180]`:

```ts
export function playerRotationDeg(yaw: number): number {
  const deg = (-yaw * 180) / Math.PI;
  return ((((deg + 180) % 360) + 360) % 360) - 180;
}
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `node node_modules/tsx/dist/cli.mjs --test src/game/minimap.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Replace the HUD minimap DOM with one SVG**

In `src/components/HUD.tsx`, import the module and replace the inner `div` + absolute shapes (lines 222-277) with:

```tsx
<svg
  viewBox={`${MINIMAP_VIEW.x} ${MINIMAP_VIEW.y} ${MINIMAP_VIEW.width} ${MINIMAP_VIEW.height}`}
  preserveAspectRatio="xMidYMid meet"
  className="w-full h-36"
  role="img"
  aria-label="Afterglow radar"
>
  <path d={HULL_PATH} fill="#1e293b" stroke="#64748b" strokeWidth={0.35} />
  {MAP_ZONES.map((zone) => (
    <rect
      key={zone.id}
      x={zone.x} y={zone.y} width={zone.width} height={zone.height}
      fill="none" stroke="#334155" strokeWidth={0.25}
    />
  ))}
  {MAP_FEATURES.map((f) =>
    f.kind === 'circle' ? (
      <circle key={f.id} cx={f.x} cy={f.y} r={f.radius ?? 0} fill="rgba(34,211,238,0.18)" stroke="rgba(34,211,238,0.6)" strokeWidth={0.3} />
    ) : (
      <rect key={f.id} x={f.x} y={f.y} width={f.width} height={f.height} fill="rgba(253,230,138,0.15)" stroke="rgba(253,230,138,0.6)" strokeWidth={0.3} />
    )
  )}
  {minimapData.bots.map((b) =>
    b.isDead ? null : (
      <circle key={b.id} cx={b.x} cy={b.z} r={1.5} fill="#ef4444" stroke="#7f1d1d" strokeWidth={0.3} />
    )
  )}
  <g transform={`translate(${minimapData.playerPos.x} ${minimapData.playerPos.z}) rotate(${playerRotationDeg(minimapData.playerPos.angle)})`}>
    <circle r={1.8} fill="#22d3ee" stroke="#fff" strokeWidth={0.35} />
    <path d="M 0 -3.2 L 1.8 1.6 L 0 0.6 L -1.8 1.6 Z" fill="#a5f3fc" />
  </g>
</svg>
```

Use explicit `fill`/`stroke` attributes on every SVG shape so rendering does not depend on Tailwind JIT class detection.

- [ ] **Step 6: Verify in the browser**

Run the dev server and open a match. At bow deck, centre pool, lounge, and stern deck, confirm the player dot stays inside the hull outline and the arrow points where the camera looks at yaw 0, ±90°, and 180°. Check 0 console errors.

- [ ] **Step 7: Commit**

```bash
git add src/game/minimap.ts src/game/minimap.test.ts src/components/HUD.tsx
git commit -m "feat(hud): rebuild minimap in map metres"
```

---

### Task 3: HUD health-bar cleanup and ADS dot removal

**Files:**
- Modify: `src/components/HUD.tsx:127-131` (ADS dot), `:364-409` (health/speed card)

**Interfaces:**
- Consumes: existing `stats.hp`, `stats.maxHp`, `ghostHp`, `stats.speed` (spread only), `stats.isAds`.
- Produces: no new API. `PlayerStats` is unchanged.

- [ ] **Step 1: Remove the numeric HP and speed readout**

Replace the card header and bar block so the card contains only the health bar plus the existing streak/K/D row:

```tsx
<div className="bg-slate-950/85 border border-slate-800 p-4 rounded-2xl shadow-2xl flex flex-col gap-2.5">
  <div className={`relative w-full h-3.5 bg-slate-900 rounded-full overflow-hidden border border-slate-700/80 ${stats.hp / stats.maxHp < 0.3 ? 'animate-pulse' : ''}`}>
    <div className="absolute left-0 top-0 bottom-0 bg-red-400/80 transition-all duration-300" style={{ width: `${(ghostHp / stats.maxHp) * 100}%` }} />
    <div className="absolute left-0 top-0 bottom-0 bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-75" style={{ width: `${(stats.hp / stats.maxHp) * 100}%` }} />
  </div>
  {/* existing STREAK / K/D row unchanged */}
</div>
```

Delete the `HP` label, current HP number, `/ maxHp` text, and the `SPEED: … m/s` block. Change the section comment to `BOTTOM-LEFT CLUSTER: HEALTH`.

- [ ] **Step 2: Remove the ADS dot**

Delete the block at `HUD.tsx:127-131` (`{stats.isAds && (<div className="w-[5px] …">)}`). Keep the hip crosshair block (`!stats.isAds`), hitmarker, and the sniper overlay.

- [ ] **Step 3: Verify**

Run:
- `npm run lint`
- `node node_modules/vite/bin/vite.js build`

Expected: both exit 0. In the browser, damage and regen the player: only the bar and ghost bar change; no HP number, no speed text, no center dot at ADS.

- [ ] **Step 4: Commit**

```bash
git add src/components/HUD.tsx
git commit -m "feat(hud): health bar only and remove ADS dot"
```

---

### Task 4: Scoreboard data model, engine callback, and bot kill credit

**Files:**
- Create: `src/game/scoreboard.ts`
- Test: `src/game/scoreboard.test.ts`
- Modify: `src/game/engine.ts:20-32` (callback type), `:64-100` (fields), `:523-531` (`startReload`), `:756` (bot kills player), `:690-720` (player kill), `:992-1006` (notify helpers), `:1098-1110` (frame update)
- Modify: `src/App.tsx:82-86` (state), `:125-140` (engine callbacks)

**Interfaces:**
- Produces:
  - `ScoreboardEntry { id: string; name: string; score: number; kills: number; deaths: number; isPlayer: boolean; isDead: boolean }`
  - `PLAYER_SCOREBOARD_ID = 'player'`
  - `sortScoreboard(entries: ScoreboardEntry[]): ScoreboardEntry[]`
  - `buildScoreboard(entries: ScoreboardEntry[], limit = 10): { rows: ScoreboardEntry[]; pinnedPlayer: ScoreboardEntry | null; playerRank: number }`
  - `EngineCallbacks.onScoreboardUpdate: (entries: ScoreboardEntry[]) => void`
- Consumes: `this.score`, `this.kills`, `this.deaths`, `this.isPlayerDead`, and `BotState.name/kills/deaths/score/isDead`.

- [ ] **Step 1: Write the failing scoreboard tests**

Create `src/game/scoreboard.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildScoreboard,
  sortScoreboard,
  type ScoreboardEntry,
} from './scoreboard';

const entry = (
  id: string,
  score: number,
  kills: number,
  deaths: number,
  isPlayer = false
): ScoreboardEntry => ({
  id, name: id, score, kills, deaths, isPlayer, isDead: false,
});

test('sorts by score, then kills, then deaths, then name', () => {
  const sorted = sortScoreboard([
    entry('b', 100, 2, 5),
    entry('a', 100, 3, 5),
    entry('c', 100, 3, 2),
    entry('d', 50, 9, 0),
    entry('e', 100, 3, 2),
  ]);
  assert.deepEqual(sorted.map((e) => e.id), ['c', 'e', 'a', 'b', 'd']);
});

test('keeps dead entries in the standings', () => {
  const sorted = sortScoreboard([
    { ...entry('dead', 200, 2, 0), isDead: true },
    entry('live', 100, 1, 0),
  ]);
  assert.deepEqual(sorted.map((e) => e.id), ['dead', 'live']);
});

test('caps at ten rows and pins the player outside the top ten', () => {
  const entries = Array.from({ length: 14 }, (_, i) =>
    entry(`bot${i}`, 1000 - i, 10 - i, 0)
  );
  entries.push(entry('player', 5, 0, 9, true));
  const board = buildScoreboard(entries);
  assert.equal(board.rows.length, 10);
  assert.equal(board.rows.some((e) => e.isPlayer), false);
  assert.equal(board.pinnedPlayer?.id, 'player');
  assert.equal(board.playerRank, 15);
});

test('includes the player in rows when they rank inside the cap', () => {
  const entries = [entry('player', 900, 9, 1, true), entry('bot', 100, 1, 1)];
  const board = buildScoreboard(entries);
  assert.equal(board.rows[0].id, 'player');
  assert.equal(board.pinnedPlayer, null);
  assert.equal(board.playerRank, 1);
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `node node_modules/tsx/dist/cli.mjs --test src/game/scoreboard.test.ts`
Expected: FAIL with `Cannot find module './scoreboard'`.

- [ ] **Step 3: Implement `src/game/scoreboard.ts`**

```ts
export interface ScoreboardEntry {
  id: string;
  name: string;
  score: number;
  kills: number;
  deaths: number;
  isPlayer: boolean;
  isDead: boolean;
}

export const PLAYER_SCOREBOARD_ID = 'player';

export function sortScoreboard(entries: ScoreboardEntry[]): ScoreboardEntry[] {
  return [...entries].sort(
    (a, b) =>
      b.score - a.score ||
      b.kills - a.kills ||
      a.deaths - b.deaths ||
      a.name.localeCompare(b.name)
  );
}

export function buildScoreboard(entries: ScoreboardEntry[], limit = 10) {
  const sorted = sortScoreboard(entries);
  const player = sorted.find((e) => e.isPlayer) ?? null;
  const playerRank = player ? sorted.indexOf(player) + 1 : 0;
  const rows = sorted.slice(0, limit);
  const pinnedPlayer = player && !rows.includes(player) ? player : null;
  return { rows, pinnedPlayer, playerRank };
}
```

- [ ] **Step 4: Add the engine callback and periodic emitter**

In `engine.ts`:

1. Import `ScoreboardEntry, PLAYER_SCOREBOARD_ID` from `./scoreboard`.
2. Add to `EngineCallbacks`: `onScoreboardUpdate: (entries: ScoreboardEntry[]) => void;`
3. Add fields: `private lastScoreboardAt = 0;`
4. Add:

```ts
private notifyScoreboard(nowMs: number, force = false) {
  if (!force && nowMs - this.lastScoreboardAt < 500) return;
  this.lastScoreboardAt = nowMs;
  this.callbacks.onScoreboardUpdate([
    {
      id: PLAYER_SCOREBOARD_ID,
      name: 'You',
      score: this.score,
      kills: this.kills,
      deaths: this.deaths,
      isPlayer: true,
      isDead: this.isPlayerDead,
    },
    ...this.bots.map((b) => ({
      id: b.id,
      name: b.name,
      score: b.score,
      kills: b.kills,
      deaths: b.deaths,
      isPlayer: false,
      isDead: b.isDead,
    })),
  ]);
}
```

5. In the frame loop next to `this.notifyMinimap(hud.minimapDue);` (line 1105), add `this.notifyScoreboard(now);`.
6. Force an update in `killPlayer` and in the player-kill path after score changes: `this.notifyScoreboard(performance.now(), true);`
7. In the bot-kills-player branch, before `this.killPlayer(bot.name, ...)`:

```ts
bot.kills++;
bot.score += 100;
this.notifyScoreboard(performance.now(), true);
```

8. In `startMatch`/respawn reset paths, force once so the board starts populated.

- [ ] **Step 5: Wire App state**

In `App.tsx`, import `ScoreboardEntry`, add `const [scoreboard, setScoreboard] = useState<ScoreboardEntry[]>([]);`, and add the callback:

```ts
onScoreboardUpdate: (entries) => {
  setScoreboard(entries);
},
```

- [ ] **Step 6: Run the tests and build**

Run:
- `node node_modules/tsx/dist/cli.mjs --test src/game/scoreboard.test.ts`
- `npm run lint`
- `node node_modules/vite/bin/vite.js build`

Expected: 4 scoreboard tests pass, lint 0, build 0.

- [ ] **Step 7: Commit**

```bash
git add src/game/scoreboard.ts src/game/scoreboard.test.ts src/game/engine.ts src/App.tsx
git commit -m "feat(match): live scoreboard data and bot kill credit"
```

---

### Task 5: Scoreboard overlay, TAB, and RANKS button

**Files:**
- Modify: `src/components/HUD.tsx` (props, header, overlay)
- Modify: `src/App.tsx:176-199` (key handling), `:283-304` (HUD props)

**Interfaces:**
- Consumes: `ScoreboardEntry`, `buildScoreboard`, `scoreboard` from Task 4.
- Produces: HUD props `scoreboard: ScoreboardEntry[]`, `showScoreboard: boolean`, `onToggleScoreboard: () => void`.

- [ ] **Step 1: Add HUD props and header formatting**

Extend `HUDProps` with the three props. Import `buildScoreboard` and `ScoreboardEntry`. Change the timer formatter:

```ts
const timerStr = Number.isFinite(matchTimeSec)
  ? `${Math.floor(matchTimeSec / 60).toString().padStart(2, '0')}:${Math.floor(matchTimeSec % 60).toString().padStart(2, '0')}`
  : '∞';
```

- [ ] **Step 2: Render the board**

Add `const board = buildScoreboard(scoreboard);` near the top of the component, then render when `showScoreboard`:

```tsx
{showScoreboard && (
  <div className="absolute inset-0 z-40 flex items-center justify-center bg-slate-950/60 backdrop-blur-[2px] pointer-events-none">
    <div className="w-[min(92vw,44rem)] bg-slate-950/95 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-slate-800">
        <span className="font-black tracking-widest text-amber-400 uppercase">Match Standings</span>
        <span className="font-mono text-sm text-slate-300">{timerStr} · {stats.kills}/{scoreLimit}</span>
      </div>
      <div className="grid grid-cols-[2rem_1fr_4rem_3rem_3rem_4rem] gap-2 px-5 py-2 text-[10px] uppercase tracking-widest text-slate-500 border-b border-slate-800">
        <span>#</span><span>Player</span><span className="text-right">Score</span><span className="text-right">K</span><span className="text-right">D</span><span className="text-right">K/D</span>
      </div>
      {board.rows.map((row, i) => (
        <div key={row.id} className={`grid grid-cols-[2rem_1fr_4rem_3rem_3rem_4rem] gap-2 px-5 py-2 text-sm ${row.isPlayer ? 'bg-amber-400/15 text-amber-100' : 'text-slate-200'} ${row.isDead ? 'opacity-50' : ''}`}>
          <span className="font-mono text-slate-500">{i + 1}</span>
          <span className="font-bold truncate">{row.name}{row.isDead ? ' · DOWN' : ''}</span>
          <span className="text-right font-mono tabular-nums">{row.score}</span>
          <span className="text-right font-mono tabular-nums">{row.kills}</span>
          <span className="text-right font-mono tabular-nums">{row.deaths}</span>
          <span className="text-right font-mono tabular-nums">{row.deaths === 0 ? row.kills.toFixed(2) : (row.kills / row.deaths).toFixed(2)}</span>
        </div>
      ))}
      {board.pinnedPlayer && (
        <div className="grid grid-cols-[2rem_1fr_4rem_3rem_3rem_4rem] gap-2 px-5 py-2 text-sm bg-amber-400/15 text-amber-100 border-t border-slate-700">
          <span className="font-mono text-slate-500">{board.playerRank}</span>
          <span className="font-bold truncate">You</span>
          <span className="text-right font-mono tabular-nums">{board.pinnedPlayer.score}</span>
          <span className="text-right font-mono tabular-nums">{board.pinnedPlayer.kills}</span>
          <span className="text-right font-mono tabular-nums">{board.pinnedPlayer.deaths}</span>
          <span className="text-right font-mono tabular-nums">{board.pinnedPlayer.deaths === 0 ? board.pinnedPlayer.kills.toFixed(2) : (board.pinnedPlayer.kills / board.pinnedPlayer.deaths).toFixed(2)}</span>
        </div>
      )}
    </div>
  </div>
)}
```

- [ ] **Step 3: Add TAB and RANKS input**

In `App.tsx`:

- Add `const [showScoreboard, setShowScoreboard] = useState(false);`
- In `handleKeyDown`, before the Escape branch:

```ts
if (e.code === 'Tab') {
  e.preventDefault();
  if (!e.repeat && gameState === 'playing') setShowScoreboard(true);
  return;
}
```

- Add a `keyup` listener in the same effect:

```ts
const handleKeyUp = (e: KeyboardEvent) => {
  if (e.code === 'Tab') {
    e.preventDefault();
    setShowScoreboard(false);
  }
};
window.addEventListener('keyup', handleKeyUp);
```

- Clear it on pause, match end, and blur: call `setShowScoreboard(false)` in the Escape branch, in the `onMatchEnd` callback, and in a `window.blur` listener. Remove both listeners in the cleanup.
- Pass `scoreboard={scoreboard}`, `showScoreboard={showScoreboard && gameState === 'playing'}`, and `onToggleScoreboard={() => setShowScoreboard((v) => !v)}` to `HUD`.

In `HUD.tsx`, add a `RANKS` button beside the mute/pause utility buttons:

```tsx
<button
  onClick={(e) => { e.stopPropagation(); onToggleScoreboard(); }}
  className="px-2.5 py-1.5 rounded-lg text-[10px] font-black tracking-widest text-slate-300 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
>
  RANKS
</button>
```

- [ ] **Step 4: Verify**

Run `npm run lint` and `node node_modules/vite/bin/vite.js build`. In the browser: hold TAB during play (board shows, mouse stays locked), release (hides), press Escape (hides), click RANKS (toggles), let a bot kill you (that bot gains a kill and score on the board).

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/components/HUD.tsx
git commit -m "feat(hud): hold-TAB match scoreboard"
```

---

### Task 6: Viewmodel pose, ADS, recoil, and animation math

**Files:**
- Create: `src/game/viewmodelPose.ts`
- Test: `src/game/viewmodelPose.test.ts`

**Interfaces:**
- Consumes: `WeaponCategory` from `./types`.
- Produces:
  - `type CycleKind = 'none' | 'pump' | 'lever'`
  - `interface PoseOffsets { weaponPos; weaponRot; leftHandPos; leftHandRot; magazineDrop; boltBack; pumpBack; leverAngle }` (each vector `{x,y,z}`)
  - `ZERO_POSE: PoseOffsets`
  - `computeAdsPosition(sightLocal: {x,y,z}, eyeRelief: number): {x,y,z}`
  - `interface RecoilProfile { travel; pitchRad; stiffness; damping; maxOffset }`
  - `interface RecoilState { offset: number; velocity: number }`
  - `RECOIL_PROFILES: Record<WeaponCategory, RecoilProfile>`
  - `stepRecoil(state: RecoilState, profile: RecoilProfile, fired: boolean, dt: number): RecoilState`
  - `sampleReloadPose(progress: number, category: WeaponCategory): PoseOffsets`
  - `sampleCyclePose(progress: number, kind: CycleKind): PoseOffsets`

- [ ] **Step 1: Write the failing tests**

Create `src/game/viewmodelPose.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeAdsPosition,
  sampleReloadPose,
  sampleCyclePose,
  stepRecoil,
  RECOIL_PROFILES,
  ZERO_POSE,
} from './viewmodelPose';

const close = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) <= eps;

test('ADS places the rear sight on the camera axis', () => {
  for (const sight of [
    { x: 0, y: 0.09, z: -0.22 },
    { x: 0.01, y: 0.075, z: -0.18 },
    { x: 0, y: 0.11, z: -0.16 },
    { x: 0, y: 0.12, z: -0.25 },
  ]) {
    const eyeRelief = 0.3;
    const pos = computeAdsPosition(sight, eyeRelief);
    assert.ok(close(pos.x + sight.x, 0));
    assert.ok(close(pos.y + sight.y, 0));
    assert.ok(close(pos.z + sight.z, -eyeRelief));
  }
});

test('reload poses are zero at both ends and clamp out-of-range input', () => {
  for (const category of ['AR', 'SMG', 'Shotgun', 'Sniper'] as const) {
    assert.deepEqual(sampleReloadPose(0, category), ZERO_POSE);
    assert.deepEqual(sampleReloadPose(1, category), ZERO_POSE);
    assert.deepEqual(sampleReloadPose(-1, category), ZERO_POSE);
    assert.deepEqual(sampleReloadPose(2, category), ZERO_POSE);
    assert.deepEqual(sampleReloadPose(Number.NaN, category), ZERO_POSE);
  }
});

test('reloads move the expected parts mid-sequence', () => {
  const ar = sampleReloadPose(0.4, 'AR');
  assert.ok(ar.magazineDrop > 0.02, `magazineDrop ${ar.magazineDrop}`);
  assert.ok(Math.abs(ar.weaponRot.z) > 0.05, `tilt ${ar.weaponRot.z}`);

  const shotgun = sampleReloadPose(0.4, 'Shotgun');
  assert.ok(shotgun.magazineDrop === 0);
  assert.ok(Math.abs(shotgun.leftHandPos.y) > 0.01 || Math.abs(shotgun.leftHandPos.z) > 0.01);

  const sniper = sampleReloadPose(0.4, 'Sniper');
  assert.ok(sniper.leverAngle > 0.1, `leverAngle ${sniper.leverAngle}`);
});

test('cycle poses peak mid-animation and return to zero', () => {
  for (const kind of ['pump', 'lever'] as const) {
    const start = sampleCyclePose(0, kind);
    const mid = sampleCyclePose(0.5, kind);
    const end = sampleCyclePose(1, kind);
    assert.deepEqual(start, ZERO_POSE);
    assert.deepEqual(end, ZERO_POSE);
    assert.ok(
      kind === 'pump' ? mid.pumpBack > 0.02 : mid.leverAngle > 0.2,
      `${kind} did not move at mid`
    );
    assert.deepEqual(sampleCyclePose(-1, kind), ZERO_POSE);
    assert.deepEqual(sampleCyclePose(2, kind), ZERO_POSE);
  }
  assert.deepEqual(sampleCyclePose(0.5, 'none'), ZERO_POSE);
});

test('shotgun and sniper recoil settle inside their fire interval', () => {
  for (const category of ['Shotgun', 'Sniper'] as const) {
    const profile = RECOIL_PROFILES[category];
    let state = stepRecoil({ offset: 0, velocity: 0 }, profile, true, 1 / 60);
    const peak = state.offset;
    assert.ok(peak > 0);
    for (let t = 0; t < 0.7; t += 1 / 60) {
      state = stepRecoil(state, profile, false, 1 / 60);
    }
    assert.ok(Math.abs(state.offset) < peak * 0.05, `${category} offset ${state.offset}`);
  }
});

test('automatic recoil is clamped across sustained fire', () => {
  for (const category of ['AR', 'SMG'] as const) {
    const profile = RECOIL_PROFILES[category];
    let state = { offset: 0, velocity: 0 };
    for (let shot = 0; shot < 120; shot++) {
      state = stepRecoil(state, profile, true, 1 / 60);
      for (let f = 0; f < 5; f++) state = stepRecoil(state, profile, false, 1 / 60);
      assert.ok(state.offset <= profile.maxOffset + 1e-6, `${category} ${state.offset}`);
    }
  }
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `node node_modules/tsx/dist/cli.mjs --test src/game/viewmodelPose.test.ts`
Expected: FAIL with `Cannot find module './viewmodelPose'`.

- [ ] **Step 3: Implement `src/game/viewmodelPose.ts`**

Rules:

- `ZERO_POSE` is a frozen object with every field zero. Return a fresh deep clone from samplers so callers cannot mutate it.
- `computeAdsPosition` returns `{ x: -sightLocal.x, y: -sightLocal.y, z: -sightLocal.z - eyeRelief }`.
- Reload tracks use smoothstep segment easing. AR: tilt to ~−0.35 rad Z, magazine drop 0.12 m between 0.15–0.45, bolt back 0.04 at 0.75–0.9. SMG: tilt −0.4, mag drop 0.1, bolt back 0.035 at 0.75–0.9. Shotgun: tilt −0.25; left hand shells 6 times across 0.15–0.85 (`sin` pulses), no mag drop; pump at 0.82–0.95. Sniper: tilt −0.2; lever angle 0.9 rad at 0.15–0.45 and −0.0 at 0.7; bolt back 0.05 at 0.3–0.55.
- Cycle tracks: pump peaks `pumpBack = 0.06` at progress 0.5; lever peaks `leverAngle = 0.9` rad at progress 0.5; both ease in/out and return to zero at 1.
- Recoil profiles:

```ts
export const RECOIL_PROFILES: Record<WeaponCategory, RecoilProfile> = {
  AR:      { travel: 0.022, pitchRad: 0.031, stiffness: 320, damping: 26, maxOffset: 0.05 },
  SMG:     { travel: 0.018, pitchRad: 0.026, stiffness: 320, damping: 26, maxOffset: 0.045 },
  Shotgun: { travel: 0.055, pitchRad: 0.07,  stiffness: 180, damping: 18, maxOffset: 0.08 },
  Sniper:  { travel: 0.045, pitchRad: 0.052, stiffness: 180, damping: 18, maxOffset: 0.07 },
};
```

- `stepRecoil`: if `fired`, add `profile.travel` to offset (position offset is positive and applied toward the camera by the caller). Then integrate `accel = -stiffness * offset - damping * velocity`, `velocity += accel * dt`, `offset += velocity * dt`, and clamp `offset` to `[-maxOffset, maxOffset]`. Normalize non-finite `dt`/state to zero and clamp `dt` to 0.05.

- [ ] **Step 4: Run the test and verify it passes**

Run: `node node_modules/tsx/dist/cli.mjs --test src/game/viewmodelPose.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/game/viewmodelPose.ts src/game/viewmodelPose.test.ts
git commit -m "feat(viewmodel): pose, ADS, recoil, and animation math"
```

---

### Task 7: Rebuild gun models, hands, sights, and viewmodel lighting

**Files:**
- Rewrite: `src/game/gunModels.ts`
- Create: `src/game/viewmodel.ts`
- Test: `src/game/gunModels.test.ts`

**Interfaces:**
- Produces:
  - `interface GunRig` with `group`, `muzzlePos`, `muzzleFlash`, `sightRear`, `sightFront`, `magazine`, `bolt`, `pump`, `lever`, `leftHand`, `cycle: { kind: CycleKind; duration: number; startDelay: number }`, `hipPose: { position: {x,y,z}; rotation: {x,y,z} }`, `adsEyeRelief: number`
  - `buildGunModel(weapon: WeaponDef): GunRig`
  - `buildHands(): { left: THREE.Group; right: THREE.Group }`
  - `addViewmodelLights(group: THREE.Group): void`
- Consumes: `computeAdsPosition`, `CycleKind` from Task 6; `WeaponDef` from `./types`.

- [ ] **Step 1: Write the failing model test**

Create `src/game/gunModels.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { RUSH_WEAPONS } from './weapons';
import { buildGunModel, buildHands } from './gunModels';

test('all four live weapons build a complete rig', () => {
  assert.equal(RUSH_WEAPONS.length, 4);
  for (const weapon of RUSH_WEAPONS) {
    const rig = buildGunModel(weapon);
    assert.ok(rig.group.children.length >= 4, `${weapon.id} has too few parts`);
    assert.ok(rig.group.children.length <= 16, `${weapon.id} has too many parts`);
    for (const v of [rig.muzzlePos, rig.sightRear.position, rig.sightFront.position]) {
      assert.ok(Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z));
    }
    assert.ok(rig.sightRear.position.y > 0.02, `${weapon.id} rear sight is below the bore`);
    assert.ok(rig.sightRear.position.z > rig.sightFront.position.z, `${weapon.id} sight order`);
    assert.ok(rig.adsEyeRelief >= 0.05 && rig.adsEyeRelief <= 0.4);
  }
});

test('cycle kind matches the weapon class', () => {
  const kinds = Object.fromEntries(
    RUSH_WEAPONS.map((w) => [w.category, buildGunModel(w).cycle.kind])
  );
  assert.deepEqual(kinds, { AR: 'none', SMG: 'none', Shotgun: 'pump', Sniper: 'lever' });
});

test('hands build two wrist-pivoted groups', () => {
  const hands = buildHands();
  assert.ok(hands.left.isGroup);
  assert.ok(hands.right.isGroup);
  assert.ok(hands.left.children.length > 0);
  assert.ok(hands.right.children.length > 0);
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `node node_modules/tsx/dist/cli.mjs --test src/game/gunModels.test.ts`
Expected: FAIL on `sightRear` / `buildHands` missing.

- [ ] **Step 3: Implement `src/game/viewmodel.ts`**

`buildHands()` returns two `THREE.Group` wrist pivots containing:

- Palm: `BoxGeometry(0.075, 0.09, 0.11)` with rounded proportions via a smaller second box.
- Four two-segment fingers curled around local `-Z`; thumb angled inward.
- Forearm: tapered `CylinderGeometry(0.045, 0.06, 0.34, 6)` rotated to point down/back toward the bottom of the screen.
- Materials: glove `0x24272b` roughness 0.85 metalness 0.05; knuckle plate `0x3d444d`; forearm fabric `0x1b1e22`.
- Mesh count per hand ≤ 12; share geometries across both hands where possible.
- Left wrist pivot origin sits at the foregrip contact point; right wrist pivot at the pistol grip.

`addViewmodelLights(group)` adds:

```ts
const fill = new THREE.PointLight(0xffd2a0, 2.2, 1.4, 2);
fill.position.set(0.25, 0.35, 0.1);
fill.castShadow = false;
group.add(fill);

const rim = new THREE.PointLight(0x9fc6ff, 0.9, 1.2, 2);
rim.position.set(-0.3, 0.1, -0.2);
rim.castShadow = false;
group.add(rim);
```

- [ ] **Step 4: Rewrite `src/game/gunModels.ts`**

Build only the four live weapons (`mcw`, `rival_9`, `lockwood_680`, `longbow`). Delete every other branch. Per weapon:

1. Use `weapon.colors` to create cached `MeshStandardMaterial`s: body (roughness 0.55, metalness 0.35), metal (0.35/0.8), accent (0.45/0.6), polymer (0.8/0.05). Add a subtle emissive `0x2a1600` only to accent inserts at the front post tip.
2. Build receiver, barrel/handguard, stock or grip, trigger guard, magazine, and top rail from boxes/cylinders.
3. Mount a **rear sight anchor** and **front sight anchor**:
   - AR: rear aperture ring + ears at local `(0, 0.09, -0.22)`; front post at `(0, 0.09, -0.62)`.
   - SMG: rear notch at `(0, 0.075, -0.18)`; front post at `(0, 0.075, -0.46)`.
   - Shotgun: rear V-notch at `(0, 0.11, -0.16)`; brass bead at `(0, 0.11, -0.72)`.
   - Sniper: scope tube centered at `y 0.13`, ocular at `z -0.25`, objective at `z -0.75`, `adsEyeRelief 0.08`. No reticle plane.
4. Set `sightRear`/`sightFront` as `Object3D`s at those local positions, not the meshes themselves, so the pose math has a clean anchor.
5. Merge static geometry per material with `mergeGeometries` from `three/examples/jsm/utils/BufferGeometryUtils.js`. Keep animated parts separate: magazine, bolt/charging handle, pump, lever.
6. Add hands from `buildHands()`; parent the left hand to `group` at the foregrip, right hand at the grip. Add both to the returned rig.
7. Add muzzle flash at `muzzlePos` with the existing octahedron material.
8. Set hip poses: AR `(0.24,-0.22,-0.42)` rot `(0.02,0.04,0.02)`; SMG `(0.23,-0.21,-0.36)` rot `(0.02,0.05,0.03)`; Shotgun `(0.25,-0.23,-0.44)` rot `(0.03,0.03,0.02)`; Sniper `(0.26,-0.24,-0.5)` rot `(0.02,0.03,0.02)`.
9. Cycle metadata: Shotgun `{ kind:'pump', startDelay:0.15, duration:0.6 }`; Sniper `{ kind:'lever', startDelay:0.08, duration:0.63 }`; others `{ kind:'none', startDelay:0, duration:0 }`.
10. Call `addViewmodelLights(group)` once per rig.
11. Return the `GunRig` with `adsEyeRelief` and `computeAdsPosition(rig.sightRear.position, rig.adsEyeRelief)` available to the engine (engine can call it directly; do not precompute a vector that skips the function).

- [ ] **Step 5: Run the model test and verify it passes**

Run: `node node_modules/tsx/dist/cli.mjs --test src/game/gunModels.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 6: Commit**

```bash
git add src/game/gunModels.ts src/game/viewmodel.ts src/game/gunModels.test.ts
git commit -m "feat(viewmodel): rebuild guns with hands, irons, and lighting"
```

---

### Task 8: Compose the rig in the engine (ADS, reload, lever, pump, recoil)

**Files:**
- Modify: `src/game/engine.ts:5-8` (imports), `:49-70` (fields), `:298-320` (`setWeapon`), `:523-531` (`startReload`), `:540-548` (`tryFireWeapon`), `:800-860` (`killPlayer`), respawn reset, `:920-960` (`updateCameraAndWeapon`), `:1098-1110` (frame loop)

**Interfaces:**
- Consumes: Task 6's `computeAdsPosition`, `stepRecoil`, `sampleReloadPose`, `sampleCyclePose`, `ZERO_POSE`, `RECOIL_PROFILES`, and types `CycleKind`, `RecoilState`, `PoseOffsets`; Task 7's `GunRig`.
- Produces: no new public API. `updateViewmodel(dt: number): void` is private.

- [ ] **Step 1: Add state and capture rest transforms**

In `engine.ts`:

```ts
private reloadDuration = 0;
private cycleTimer = 0;
private cycleDuration = 0;
private cycleKind: CycleKind = 'none';
private recoilState: RecoilState = { offset: 0, velocity: 0 };
private shotKick = false;
private leftHandRest = new THREE.Vector3();
private magazineRestY = 0;
private boltRestZ = 0;
private pumpRestZ = 0;
private leverRestX = 0;
```

In `setWeapon`, after `this.gunRig = buildGunModel(weapon);`:

```ts
this.leftHandRest.copy(this.gunRig.leftHand.position);
this.magazineRestY = this.gunRig.magazine?.position.y ?? 0;
this.boltRestZ = this.gunRig.bolt?.position.z ?? 0;
this.pumpRestZ = this.gunRig.pump?.position.z ?? 0;
this.leverRestX = this.gunRig.lever?.rotation.x ?? 0;
this.cycleTimer = 0;
this.cycleKind = 'none';
this.recoilState = { offset: 0, velocity: 0 };
this.isReloading = false;
this.reloadTimer = 0;
this.reloadDuration = 0;
this.applyViewmodelPose(ZERO_POSE, 0, 0);
```

Delete the hardcoded initial position call that follows the build.

- [ ] **Step 2: Arm reload and cycle timers**

- In `startReload`, set `this.reloadDuration = this.activeWeapon.reloadTimeSec;` and clear the cycle: `this.cycleTimer = 0; this.cycleKind = 'none';`.
- In `tryFireWeapon`, after `this.fireTimer = fireInterval;`:

```ts
this.shotKick = true;
const cycle = this.gunRig?.cycle;
if (cycle && cycle.kind !== 'none' && !this.isReloading) {
  this.cycleKind = cycle.kind;
  this.cycleDuration = cycle.duration;
  this.cycleTimer = cycle.duration;
}
```

- [ ] **Step 3: Implement pose composition**

Add `private updateViewmodel(dt: number)`:

1. `this.adsWeight = THREE.MathUtils.damp(this.adsWeight, this.isAds ? 1 : 0, 16, dt);`
2. `const ads = computeAdsPosition(this.gunRig.sightRear.position, this.gunRig.adsEyeRelief);`
3. Lerp between `rig.hipPose.position` and `ads` by `adsWeight`. Add bob exactly as the old code did, scaled by `1 - adsWeight`, and a `Math.sin(bobTime) * 0.01 * adsWeight` breath offset.
4. `const profile = RECOIL_PROFILES[this.activeWeapon.category]; this.recoilState = stepRecoil(this.recoilState, profile, this.shotKick, dt); this.shotKick = false;`
5. `const reload = this.isReloading ? sampleReloadPose(1 - this.reloadTimer / this.reloadDuration, this.activeWeapon.category) : ZERO_POSE;`
6. Cycle:

```ts
let cycleProgress = 0;
if (this.cycleTimer > 0 && this.gunRig.cycle.kind !== 'none') {
  this.cycleTimer = Math.max(0, this.cycleTimer - dt);
  const elapsed = this.cycleDuration - this.cycleTimer;
  const span = Math.max(1e-4, this.cycleDuration - this.gunRig.cycle.startDelay);
  cycleProgress = THREE.MathUtils.clamp((elapsed - this.gunRig.cycle.startDelay) / span, 0, 1);
} else {
  this.cycleKind = 'none';
}
const cycle = this.cycleKind === 'none' ? ZERO_POSE : sampleCyclePose(cycleProgress, this.cycleKind);
```

7. Compose: add `reload.weaponPos`, `cycle.weaponPos`, `recoil.offset` to Z, and the recoil pitch to rotation X. Add translations/rotations for left hand, magazine (`position.y = magazineRestY - reload.magazineDrop`), bolt (`position.z = boltRestZ + reload.boltBack + cycle.boltBack`), pump (`position.z = pumpRestZ + reload.pumpBack + cycle.pumpBack`), lever (`rotation.x = leverRestX + reload.leverAngle + cycle.leverAngle`).
8. Apply `rig.group.position` and `rig.group.rotation` from the hip pose base plus ADS lerp plus the offsets.

Factor the "apply offsets from rest" part into `private applyViewmodelPose(pose: PoseOffsets, adsWeight: number, recoilOffset: number)` so `setWeapon` and reset paths can snap cleanly.

- [ ] **Step 4: Replace the old inline pose code**

In `updateCameraAndWeapon`, remove the `adsWeight` damp and the entire `if (this.gunRig) { … }` block that lerps positions and adds recoil. Call `this.updateViewmodel(dt);` after the camera FOV update. Keep camera recoil on `this.camera`.

- [ ] **Step 5: Reset on death and respawn**

In `killPlayer`, after clearing reload state, add:

```ts
this.cycleTimer = 0;
this.cycleKind = 'none';
this.recoilState = { offset: 0, velocity: 0 };
this.shotKick = false;
this.applyViewmodelPose(ZERO_POSE, 0, 0);
```

In the respawn path after ammo is refilled, do the same and set `this.gunRig.group.visible = true`.

- [ ] **Step 6: Verify**

Run:
- `npm run lint`
- `node node_modules/tsx/dist/cli.mjs --test src/game/*.test.ts`
- `node node_modules/vite/bin/vite.js build`

Expected: lint 0, all tests pass (86 + new), build 0.

Browser screenshots:
- Each weapon at hip and at full ADS: sights/scope centered, hands on the grip/foregrip, no ADS dot.
- AR reload at ~40% progress: magazine out, gun tilted.
- Shotgun firing: pump moves and returns before the next shell; reload visibly feeds shells.
- Sniper firing: lever throws and returns before the next shot; scope overlay still appears.
- 0 console errors, frame time near the prior 14 ms baseline.

- [ ] **Step 7: Commit**

```bash
git add src/game/engine.ts
git commit -m "feat(viewmodel): drive ADS, reload, and cycle animation"
```

---

### Task 9: Final gate, review, and push

**Files:**
- Modify: none expected beyond fixes found in review
- Docs: `docs/superpowers/specs/2026-11-07-viewmodels-hud-polish-design.md`, `docs/superpowers/plans/2026-11-07-viewmodels-hud-polish.md`

**Interfaces:**
- Consumes: completed Tasks 1-8.
- Produces: a green `main` pushed to `origin`.

- [ ] **Step 1: Run the full gate**

```bash
npm run lint
node node_modules/tsx/dist/cli.mjs --test src/game/*.test.ts
node node_modules/vite/bin/vite.js build
```

Expected: lint 0, all tests pass, build 0.

- [ ] **Step 2: Run the browser QA checklist**

1. Both walkways across the former stairwells: walk the full length at x ±10.2, jump at the seam, confirm no fall and no `The ocean` death.
2. HUD: no HP number, no speed text, no ADS dot; health/ghost bars react to damage and regen.
3. Hold TAB: board shows and pointer lock stays; release hides; Escape and window blur hide; RANKS toggles; bot kills credit the killer.
4. Minimap: player and bots inside the hull at bow, pool, lounge, stern; arrow matches yaw at 0, ±90°, 180°.
5. All four weapons hip/ADS, reload mid-sequence, shotgun pump, sniper lever, sniper overlay.
6. Match end, respawn, killfeed still correct.

- [ ] **Step 3: Review**

Dispatch a fresh reviewer against the diff from the pre-work commit. Fix every finding, rerun the gate, and rerun the affected browser checks.

- [ ] **Step 4: Commit docs**

```bash
git add docs/superpowers/specs/2026-11-07-viewmodels-hud-polish-design.md docs/superpowers/plans/2026-11-07-viewmodels-hud-polish.md
git commit -m "docs: viewmodel, HUD, scoreboard, minimap, and below-deck plan"
```

- [ ] **Step 5: Fetch, verify, and push**

```bash
git fetch origin
git log --oneline origin/main..HEAD
git status --short
git push origin main
```

Expected: the log lists only this work's commits, the working tree is clean, and `origin/main` advances to the new head.

