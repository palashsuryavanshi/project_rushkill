# Armory Class Roster Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce the armory to one weapon per class and show only class names, with a `A killed B` killfeed.

**Architecture:** The weapon data is the single source of names, so `name` becomes the class label. Components already print `weapon.name` / `entry.weapon` and need only duplicate-label cleanup. Bot weapon choice and the killfeed line become pure, tested functions.

**Tech Stack:** TypeScript, React, Three.js, node:test via tsx.

**Spec:** `docs/superpowers/specs/2026-11-07-armory-class-roster-design.md`

## Global Constraints

- Exactly four weapons: `mcw` (AR), `rival_9` (SMG), `lockwood_680` (Shotgun), `longbow` (Sniper).
- `WeaponDef.name` equals its category: `AR`, `SMG`, `Shotgun`, `Sniper`.
- No stat, model, recoil, spread, or bot-difficulty changes.
- No removed weapon id may remain in reachable logic.
- Verification before each commit: `npm run lint`, `node node_modules/tsx/dist/cli.mjs --test src/game/*.test.ts`, `node node_modules/vite/bin/vite.js build`.

## Review Focus

- A saved loadout or bot referencing a removed id must not crash or silently become the AR: `getWeaponById` falls back, and bots must never request a removed id.
- Killfeed with a headshot must still show the `HS` tag, and must not print the weapon name.
- The pause loadout and title screen must not show `AR (AR)` duplicates.
- The pump shotgun must not fire continuously when the mouse is held (the removed `riveter` was the only automatic shotgun).

---

### Task 1: Four-weapon roster with class names

**Files:**
- Modify: `src/game/weapons.ts:3-378`
- Test: `src/game/rules.test.ts:6-13`

**Interfaces:**
- Produces: `RUSH_WEAPONS: WeaponDef[]` of length 4; `getWeaponById(id)` unchanged; ids `mcw`, `rival_9`, `lockwood_680`, `longbow`.

- [ ] **Step 1: Replace the roster test with class assertions**

```ts
test('the armory holds exactly one weapon per class', () => {
  assert.equal(RUSH_WEAPONS.length, 4);
  const categories = RUSH_WEAPONS.map((w) => w.category).sort();
  assert.deepEqual(categories, ['AR', 'SMG', 'Shotgun', 'Sniper']);
});

test('weapons are named by class only', () => {
  for (const w of RUSH_WEAPONS) assert.equal(w.name, w.category);
});

test('the kept weapon ids are MCW, Rival-9, Lockwood 680, Longbow', () => {
  assert.deepEqual(RUSH_WEAPONS.map((w) => w.id).sort(), ['lockwood_680', 'longbow', 'mcw', 'rival_9']);
});
```

- [ ] **Step 2: Run it and confirm the old 12-gun roster fails**

Run: `node node_modules/tsx/dist/cli.mjs --test src/game/rules.test.ts`
Expected: FAIL on `4 !== 12`.

- [ ] **Step 3: Delete the eight non-kept entries and set `name` to the category**

Keep `mcw`, `rival_9`, `lockwood_680`, `longbow` objects and every stat verbatim. Change only `name` to `'AR'`, `'SMG'`, `'Shotgun'`, `'Sniper'`.

- [ ] **Step 4: Run the tests**

Run: `node node_modules/tsx/dist/cli.mjs --test src/game/*.test.ts`
Expected: PASS, 61 tests.

- [ ] **Step 5: Commit**

```bash
git add src/game/weapons.ts src/game/rules.test.ts
git commit -m "feat(armory): one weapon per class, class-only names"
```

### Task 2: Bot weapons never reference removed ids

**Files:**
- Modify: `src/game/botAI.ts:275-306`
- Test: `src/game/botAI.test.ts`

**Interfaces:**
- Produces: `pickBotWeaponId(personality: BotPersonality, index: number): string`, always one of the four roster ids.
- Consumes: `RUSH_WEAPONS` from Task 1.

- [ ] **Step 1: Write the failing test**

```ts
test('every bot personality picks a weapon that still exists', () => {
  const personalities: BotPersonality[] = ['assault', 'sniper', 'defender', 'flanker', 'support', 'balanced'];
  const ids = new Set(RUSH_WEAPONS.map((w) => w.id));
  for (const p of personalities) {
    for (const i of [0, 1]) assert.ok(ids.has(pickBotWeaponId(p, i)), `${p} picked ${pickBotWeaponId(p, i)}`);
  }
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `node node_modules/tsx/dist/cli.mjs --test src/game/botAI.test.ts`
Expected: FAIL, `pickBotWeaponId` is not exported.

- [ ] **Step 3: Extract the switch into `pickBotWeaponId`**

Move the `switch (personality)` from `createBot` into an exported function. Mapping: assault `index % 2 === 0 ? 'rival_9' : 'mcw'`; sniper `'longbow'`; defender `'mcw'`; flanker `index % 2 === 0 ? 'lockwood_680' : 'rival_9'`; support `'lockwood_680'`; balanced `'mcw'`. `createBot` calls it, then `getWeaponById`.

- [ ] **Step 4: Run the tests**

Run: `node node_modules/tsx/dist/cli.mjs --test src/game/botAI.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game/botAI.ts src/game/botAI.test.ts
git commit -m "fix(bots): draw weapons only from the four-class roster"
```

### Task 3: Killfeed reads `A killed B`

**Files:**
- Create: `src/game/killfeed.ts`
- Create: `src/game/killfeed.test.ts`
- Modify: `src/components/HUD.tsx:330-345`

**Interfaces:**
- Produces: `formatKillfeed(entry: Pick<KillfeedEntry, 'killer' | 'victim'>): string`.
- Consumes: `KillfeedEntry` from `types.ts`.

- [ ] **Step 1: Write the failing test**

```ts
test('killfeed reads killer killed victim', () => {
  assert.equal(formatKillfeed({ killer: 'Viper', victim: 'You' }), 'Viper killed You');
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `node node_modules/tsx/dist/cli.mjs --test src/game/killfeed.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement and use it**

`formatKillfeed` returns `` `${entry.killer} killed ${entry.victim}` ``. In the HUD, replace the killer/weapon-badge/victim spans with one span using `formatKillfeed(entry)`, keeping the `HS` tag beside it when `entry.isHeadshot`.

- [ ] **Step 4: Run the tests**

Run: `node node_modules/tsx/dist/cli.mjs --test src/game/killfeed.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game/killfeed.ts src/game/killfeed.test.ts src/components/HUD.tsx
git commit -m "feat(hud): killfeed reads A killed B"
```

### Task 4: Class-only labels and the pump-shotgun fix

**Files:**
- Modify: `src/components/LoadoutScreen.tsx:115,172`
- Modify: `src/components/TitleScreen.tsx:170`
- Modify: `src/components/MainMenu.tsx:88`
- Modify: `src/components/GameOverModal.tsx:86`
- Modify: `src/components/GameSetupScreen.tsx:358-364`
- Modify: `src/components/HUD.tsx:117`
- Modify: `src/game/engine.ts:831`

**Interfaces:**
- Consumes: class-labelled `WeaponDef.name` from Task 1.

- [ ] **Step 1: De-duplicate labels**

Where a component renders `name (category)` and both are now equal, render the class once. In `LoadoutScreen` the tab label becomes `{cat}` (drop the `s`). The selected line becomes `{selectedWeapon.name} • {selectedWeapon.features}`.

- [ ] **Step 2: Replace the setup-screen gun lists**

Replace the four hard-coded name strings with the class name (`{cat}`), so Holger/SVA/MTZ/Striker/Haymaker/Riveter/KV/KATT no longer appear.

- [ ] **Step 3: Fix the sniper optic caption**

`0.50 CAL OPTIC {weapon.name}` becomes `SNIPER OPTIC`.

- [ ] **Step 4: Drop the removed `riveter` id from full-auto fire**

In `engine.ts`, the held-fire condition becomes `category === 'AR' || category === 'SMG'`.

- [ ] **Step 5: Verify and commit**

Run: `npm run lint` → exit 0. Run the full test suite → all pass. Run the Vite build → `built in`.
Expected: the pump shotgun fires once per click.

```bash
git add src/components src/game/engine.ts
git commit -m "feat(ui): show class names only across armory and HUD"
```

### Task 5: End-to-end verification

- [ ] **Step 1: Browser check**

Open http://localhost:3000, confirm the title screen and armory show four classes with no gun names, start a match, and confirm no console errors. Watch the killfeed for `A killed B`.

- [ ] **Step 2: Push**

```bash
git fetch origin && git push origin main
```

Expected: `origin/main` equals local `HEAD`.
