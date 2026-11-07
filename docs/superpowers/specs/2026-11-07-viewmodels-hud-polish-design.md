# Viewmodels, HUD Polish, Scoreboard, and Minimap Fix — Design

**Date:** 2026-11-07
**Status:** Approved
**Scope:** First-person weapon and hands presentation, real iron sights/scope ADS, reload and cycle animations, HUD cleanup, TAB scoreboard, minimap coordinate correctness, and removal of the unsafe below-deck tunnel and stairs

## Intent

The game currently renders four procedural guns as floating dark boxes with a red or green dot in place of sights. There are no hands, no reload motion, and the sniper's "lever action" is a static cylinder. The HUD also shows numeric HP and a speed readout the player does not need, has no way to inspect the current match standings, and its minimap places blips in a different coordinate space than the hull it draws, so positions read wrong.

This pass makes the first-person weapon an actual weapon: gloved hands on a shared rig, iron sights that align on the camera axis, a real scope on the sniper, and authored reload/lever/pump motion tied to the existing timers. It cleans the HUD to a health bar only, adds a hold-TAB scoreboard driven by live match data, rebuilds the minimap in a single SVG coordinate space measured in map metres, and removes the below-deck tunnel and maintenance stairs that currently drop players into the hull and kill them.

## Goals

- One shared modular viewmodel rig used by all four live guns.
- Visible gloved hands and forearms that grip the weapon and participate in reload and cycle animations.
- Real iron sights on AR, SMG, and shotgun; a modeled scope on the sniper, keeping the existing full-screen scope overlay as the aiming reticle. ADS alignment computed from the sight's modeled position, not hand-tuned per gun.
- Per-weapon reload sequences and per-shot cycle animations (sniper lever, shotgun pump) that complete within the weapon's existing fire/reload timing.
- A camera-attached fill light and brighter material response so viewmodels read against sunset lighting.
- Health bar only: remove the numeric HP readout and the speed readout.
- A current-match leaderboard shown while `TAB` is held, with a touch/click alternative.
- A minimap whose hull, zones, features, player, and bots all share one metre-based coordinate space, with correct facing rotation.
- Removal of the below-deck maintenance tunnel and both maintenance stairwells, which currently drop players into the hull void and kill them via the ocean-fall check. Upper-deck stairs stay.
- Pure, testable helpers for pose math, animation sampling, scoreboard sorting, and minimap projection.

## Non-goals

- New weapons, damage, recoil, spread, fire-rate, or movement tuning.
- Audio changes; existing reload/fire sounds stay as they are.
- A new scope overlay or scope-pip rendering. The existing sniper full-screen overlay and FOV zoom stay as they are; only the 3D scope body is new.
- A second render pass or separate viewmodel scene/camera. The weapon stays a camera child.
- Third-person weapon or hand models, viewmodel shadows, or skeletal animation.
- A replacement below-deck route. The maintenance tunnel and its stairs are removed outright; the upper-deck stairs and rooms remain.
- Animation authoring tools or external model formats.
- Reworking the map layout, bot AI, or match rules.
- Persisting scoreboard or minimap state across matches.

## Constraints

- Live weapon ids and categories stay `mcw`/`AR`, `rival_9`/`SMG`, `lockwood_680`/`Shotgun`, `longbow`/`Sniper`. Dead branches in `gunModels.ts` are removed.
- `PlayerStats.speed` stays in the payload because crosshair spread uses it; only its HUD display is removed.
- Existing damage/falloff values stay untouched: sniper unlimited range with 20% falloff beyond 30 m, walls and glass block bullets.
- One weapon per class, named exactly `AR`, `SMG`, `Shotgun`, `Sniper`.
- Service respawn, 3 s respawn timer, health regen, and full clip on respawn are unchanged.
- The engine remains the source of truth for ammo, reload state, fire timing, and bot stats.
- All new viewmodel geometry is procedural Three.js primitives. No external asset pipeline.
- Added draw calls stay bounded: each gun merges static geometry per material and keeps only animated parts as separate meshes (target ≤ 12 meshes per gun including hands).
- Minimap geometry matches `mapHijacked.ts` metres: hull x −12.2..12.2, z −54..54; bow at negative z; zones at −54..−36, −36..−18, −18..18, 18..36, 36..54; pool centered (−5.5, 0) at 4.6×13.2 m; lounge roof centered (5.5, 0) at 5.4×14 m; planter 2.8×6 m at origin; helipad at (0, −45) radius 5 m; jacuzzi 5.2×5.2 m at (0, 50).
- After below-deck removal, every walkable surface and every waypoint sits at deck level (`y ≥ −0.1`) or on the upper deck (`y ≈ 4.6`). The only sub-deck colliders left are the thin exterior hull side walls.
- TAB must not release pointer lock or move browser focus, must hide on pause and window blur, and must not fire while dead or in menus.

## Architecture

### 1. Shared viewmodel rig

New module `src/game/viewmodel.ts` owns assembly and per-frame posing. `src/game/gunModels.ts` is reduced to per-weapon geometry plus sight/part anchors.

```
gunCameraRig (camera child, existing)
└── weaponGroup (animated by pose state machine)
    ├── merged static body meshes (by material)
    ├── sightRear (Object3D anchor at rear aperture center)
    ├── sightFront (Object3D anchor at front post tip)
    ├── magazine (animated mesh group)
    ├── boltGroup (animated: charging handle / bolt)
    ├── pumpGroup (shotgun only)
    ├── leverGroup (sniper only)
    ├── muzzle / muzzleFlash
    ├── leftHand (animated wrist pivot, parented to weaponGroup)
    ├── rightHand (static wrist pivot on grip)
    └── fillLight (PointLight, distance ~1.4, decay 2)
```

`GunRig` becomes:

```ts
interface GunRig {
  group: THREE.Group;            // weaponGroup
  muzzlePos: THREE.Vector3;
  muzzleFlash: THREE.Mesh;
  sightRear: THREE.Object3D;
  sightFront: THREE.Object3D;
  magazine: THREE.Object3D | null;
  bolt: THREE.Object3D | null;
  pump: THREE.Object3D | null;
  lever: THREE.Object3D | null;
  leftHand: THREE.Object3D;
  cycle: { kind: 'none' | 'pump' | 'lever'; duration: number; startDelay: number };
  adsPose: { position: THREE.Vector3; rotation: THREE.Euler };
}
```

`buildGunModel(weapon)` returns a fully assembled rig, including hands, so `engine.setWeapon` changes only the model swap and state reset.

### 2. Hands and arms

A shared `buildHands()` builds two low-poly gloved hands with forearm stubs:

- Palm: rounded box, matte charcoal glove with a subtle accent knuckle plate.
- Four fingers as two-segment boxes in a curled grip pose; thumb box.
- Forearm: tapered cylinder in dark tactical fabric, extending off-screen toward the bottom-right for the right hand and bottom-left for the left.
- Right hand is fixed to the pistol grip; left hand is fixed to the foregrip in idle and driven by reload/cycle tracks in animation.
- Hands use flat-shaded low-poly geometry and share materials across guns. Total added geometry stays under ~1.5k triangles.

Grip positions are per weapon (`gripRight`, `gripLeft` Vector3) declared next to the model, so hands sit correctly without per-frame IK.

### 3. Sights and computed ADS

Each weapon models a real sight line at a defined height above the bore:

- **AR:** rear aperture ring with protective ears and a front post inside a hood.
- **SMG:** rear notch block and a hooded front post.
- **Shotgun:** rear shallow V-notch and a brass front bead.
- **Sniper:** scope tube with objective and ocular bells and tinted lens discs. The existing `SNIPER OPTIC` full-screen HUD overlay remains the reticle, so the 3D scope carries no reticle plane; a duplicated reticle would be invisible behind the overlay and only adds geometry.

`computeAdsPose(rig, eyeRelief)` returns the weapon-group transform that puts `sightRear` on the camera axis:

```
position = -sightRearLocalPosition + (0, 0, -eyeRelief)
rotation = (0, 0, 0) unless the rig declares a canted sight
```

`eyeRelief` is 0.30 m for AR/SMG, 0.34 m for shotgun, and 0.28 m for the sniper scope (ocular close to the eye). Because the sight height is modeled rather than guessed, ADS is correct by construction. `sightFront` is modeled at the same height so it visually centers behind the rear aperture at ADS.

The existing `adsWeight` damp and per-weapon `adsZoomFov` remain. Hip pose stays weapon-specific (offset right, low, slight inward yaw) so each gun has a distinct resting silhouette.

### 4. Fill light and materials

- A warm `PointLight(0xffd2a0, ~2.2, 1.4, 2)` is parented to `weaponGroup` at roughly `(0.25, 0.35, 0.1)` in weapon space, with `castShadow = false`. Its short range keeps it off the world.
- A faint cool rim light (`PointLight(0x9fc6ff, ~0.9, 1.2, 2)`) sits at `(-0.3, 0.1, -0.2)` to separate the silhouette.
- Materials move off near-black: receiver colors from `weapon.colors.primary` lifted into a readable range, roughness 0.45–0.7, metalness 0.2–0.7 by part. The tan/bronze accents stay.
- Each gun gets 3–4 merged material groups (body, metal, accent, grip/polymer) to bound draw calls.
- Add a small amount of emissive to sight dots/fiber optic inserts only (AR/SMG front post tip), never to the whole gun.

### 5. Pose and animation state machine

Pure module `src/game/viewmodelPose.ts`:

```ts
type ViewmodelState = {
  adsWeight: number;
  reloadProgress: number;   // 0..1, 0 when not reloading
  reloadActive: boolean;
  cycleKind: 'none' | 'pump' | 'lever';
  cycleProgress: number;    // 0..1
  recoil: number;           // 0..1 spring value
  bobTime: number;
  strafe: number;
};
```

`sampleReloadPose(progress, weaponCategory)` and `sampleCyclePose(progress, kind)` return additive transforms for the weapon group, left hand, magazine/bolt/pump/lever. All curves use smoothstep segments and are clamped to `[0, 1]`; passing `NaN` or out-of-range values is normalized and covered by tests.

**Reload timelines** (normalized to `weapon.reloadTimeSec`):

| Weapon | 0–15% | 15–45% | 45–70% | 70–90% | 90–100% |
|---|---|---|---|---|---|
| AR | tilt left, hand to mag | mag drops | new mag up and seated | bolt slap | return to idle |
| SMG | tilt left, hand to mag | mag drops | new mag seated | charging handle | return to idle |
| Shotgun | tilt, hand to shell port | shell insert every `1/magSize` of the window | last shell | pump | return to idle |
| Sniper | tilt, lever opens | rounds/lifter motion | lever closes | shoulder reseat | return to idle |

The shotgun's shell rhythm runs across the middle 70% of the reload so a 2.5 s reload visibly feeds six shells.

**Cycle timelines** (triggered after each successful shot, only when not reloading):

- **Shotgun pump:** starts 0.15 s after the shot, lasts 0.45 s (fire interval is 0.75 s). Pump group travels rearward 0.06 m and back; left hand follows the pump.
- **Sniper lever:** starts 0.08 s after the shot, lasts 0.55 s (fire interval ≈ 0.70 s). Lever rotates ~50° down and back; bolt group travels 0.05 m rearward; left hand follows the lever.
- **AR/SMG:** no mechanical cycle; recoil spring only.

**Recoil:** the existing camera recoil stays. The viewmodel adds an additive spring-damper kick driven on each shot, with per-category parameters:

| Category | Travel | Pitch | Spring | Behaviour |
|---|---|---|---|---|
| AR | 0.022 m | 1.8° | stiff/fast (`k≈320`, `c≈26`) | small residual stack, clamped to 0.05 m |
| SMG | 0.018 m | 1.5° | stiff/fast (`k≈320`, `c≈26`) | small residual stack, clamped to 0.045 m |
| Shotgun | 0.055 m | 4.0° | soft (`k≈180`, `c≈18`) | fully settles inside the 0.75 s cycle |
| Sniper | 0.045 m | 3.0° | soft (`k≈180`, `c≈18`) | fully settles inside the 0.70 s cycle |

Automatic fire is expected to hold a small clamped offset rather than snapping to zero between 0.066–0.084 s rounds; "returns to rest before the next round" applies to shotgun and sniper only.

**Bob and sway:** existing bob is retained but scaled by `1 - adsWeight`; add a clamped strafe roll (±2°) and a small look-sway lag. ADS damp and reload poses compose in a fixed order: base pose → ADS lerp → bob/sway → recoil → reload/cycle additive.

**Suppression while dead:** `engine.killPlayer` and respawn reset cycle timers and snap the rig to idle; no animation runs while `isPlayerDead`.

### 6. Engine integration

- `engine.ts` keeps `isReloading`, `reloadTimer`, `fireTimer`, `adsWeight`, and camera recoil.
- Add `reloadDuration` (captured at `startReload`), `cycleTimer`, `cycleDuration`, `cycleKind`.
- On a successful shot, if category is Shotgun or Sniper and not reloading, arm the cycle state.
- `startReload` captures duration and clears any in-flight cycle.
- Per frame, build the `ViewmodelState` and call `updateViewmodel(rig, state, dt)`, which replaces the current inline `lerpVectors` / recoil position code.
- `setWeapon` rebuilds the rig, resets animation state, and applies the idle pose immediately.
- On respawn, reset ammo/reload and animation state together.

### 7. HUD cleanup

`src/components/HUD.tsx` bottom-left card changes:

- Remove the `HP` label, the large current-HP number, and the `/ maxHp` text.
- Remove the `SPEED: n m/s` readout entirely.
- Keep the health bar, widened to the card width and slightly taller, with the existing trailing ghost bar and a red low-health pulse below 30%.
- Keep the slide indicator, streak, and K/D row.
- Remove the centered 5 px ADS dot (`HUD.tsx:127`). The modeled sights become the aiming reference at ADS; a screen-centered dot would sit on the front post and defeat them. The hip crosshair, hitmarker, and sniper overlay stay.
- `stats.speed` remains in `PlayerStats` and continues to drive crosshair spread.

### 8. Scoreboard

New shared type:

```ts
interface ScoreboardEntry {
  id: string;
  name: string;
  score: number;
  kills: number;
  deaths: number;
  isPlayer: boolean;
  isDead: boolean;
}
```

Engine callback `onScoreboardUpdate(entries: ScoreboardEntry[])`:

- Built from player kills/deaths/score (player name `You`) plus each bot's existing `name`, `kills`, `deaths`, `score`, `isDead`.
- Bot kills of the player currently award no credit (`killPlayer` only increments the player's deaths), so most bots would show zero on the board. Add `killerBot.kills++` and `killerBot.score += 100` at the bot-kills-player site, matching the existing bot-vs-bot reward. This is required for the standings to be truthful; it does not change damage, player rewards, or match-end rules.
- Emitted on a 0.5 s throttle from the frame loop, independent of movement, and forced on any kill, death, or respawn so standings stay current while standing still.
- Sorting lives in pure `src/game/scoreboard.ts`: score desc, then kills desc, then deaths asc, then name asc. Dead players remain listed and dimmed.

UI:

- `HUD` renders a centered overlay panel when `showScoreboard` is true: rank, name, score, kills, deaths, K/D, with the player row highlighted and the current match timer + score goal in the header. An unlimited-time match renders the timer as `∞` rather than `Infinity:NaN`.
- App owns `scoreboard` state and `showScoreboard` state.
- Input: `keydown` Tab (`e.preventDefault()`, ignore repeats) shows; `keyup` Tab hides. Hide on `Escape`/pause, `window.blur`, and on match end. Never call `exitPointerLock`.
- A small `RANKS` button in the top utility cluster toggles the board for touch and mouse; it is the only interactive element inside the overlay.
- Board is rendered above HUD, below pause/game-over screens.

### 9. Below-deck removal

The maintenance stairwells at x ±10.2 (port z −18..−10, starboard z 10..18) descend 3.4 m into a tunnel. With the tunnel present, falling off a stair lands at y −3.3; the ocean-fall threshold is y < −3.5, so misses and gaps kill the player. The route is also unreachable from the minimap and bots path through it awkwardly. Remove it instead of patching gaps.

Changes in `src/game/mapHijacked.ts`:

- Delete the entire below-deck section: tunnel floor, four tunnel walls, side branches/landings, end caps, bulkhead frames, and tunnel crate clusters.
- Delete the two 10-tread maintenance stair runs and their two brass stair rails at x ±8.55.
- Delete the two outboard service ledges at x ±11.7, which only existed to bridge the stairwell cuts.
- Fill both walkway gaps with full-width teak deck slabs: port `3.7 × 0.4 × 8` at (−10.35, −0.4, −14), starboard at (10.35, −0.4, 14).
- Replace the five-piece deck undertray with one full slab `21.8 × 0.3 × 108` at (0, −0.7, 0) so no stairwell holes remain in the ceiling.
- Delete the four tunnel point lights and their amber fixtures; keep the two cabin lights and the lounge light (7 → 3 point lights).
- Delete the `matTunnelMetal` material and its `materialByUuid` entry.
- Remove all nine `maint_*` waypoints and the `maint_port_bottom` / `maint_star_bottom` neighbor links from `port_mid` and `star_south`.
- Keep the existing outboard bridge waypoints (`port_bridge_*`, `star_bridge_*`): they now sit on continuous deck and still provide the ≤12 m edges the graph needs.
- Keep the upper-deck stairs, upper rooms, and all deck-level geometry unchanged.

Result: the walkways are continuous at x ±10.2, there is no hole to fall through, and no route exists below y 0.

### 10. Minimap rebuild

New pure module `src/game/minimap.ts`:

```ts
export const MAP_VIEW = { minX: -12.2, maxX: 12.2, minZ: -54, maxZ: 54 };
export const HULL_PATH = '...';       // metres, bow at negative z
export const MAP_ZONES = [...];       // deck, cabins, centre
export const MAP_FEATURES = [...];    // pool, lounge, planter, helipad, jacuzzi
export function projectToMap(x: number, z: number): { x: number; y: number };
export function playerRotationDeg(yaw: number): number;
```

Rules:

- One SVG with `viewBox="-12.2 -54 24.4 108"` and `preserveAspectRatio="xMidYMid meet"`. SVG y maps directly to world z, so bow (negative z) is at the top.
- Hull, zone rectangles, pool, lounge, planter, helipad, jacuzzi, bot circles, and player arrow are all authored in metres in that space. No percentage math.
- Bots use `r = 1.5` m, player `r = 1.8` m, both with non-scaling stroke for crispness.
- Player arrow is a triangle path rotated by `-yaw` in degrees: positive yaw turns the player left, which is counter-clockwise on a bow-up map. This fixes the current `+yaw`.
- The radar panel keeps its footprint and title (`AFTERGLOW RADAR`); the inner drawing becomes a single SVG.
- Deck information is not encoded; all decks share the same x/z footprint. This is documented, not solved, in this pass.

### 11. Data flow

```
engine frame
├── notifyStats (existing)
├── notifyMinimap (existing, movement-gated)
└── notifyScoreboard (new, 0.5 s throttle + forced on kills/respawns)
        ↓
App state: stats, minimapData, scoreboard, showScoreboard
        ↓
HUD: health card, SVG radar, TAB board
```

## Failure and edge cases

- **No pointer lock / touch:** TAB board still works via the RANKS button; keyboard hiding never depends on pointer lock.
- **Weapon swap mid-reload:** `setWeapon` clears reload and cycle state and rebuilds the rig; no stale part offsets.
- **Death mid-reload or mid-cycle:** timer cleared, rig reset, no animation while dead; respawn starts idle with a full clip.
- **Reload cancelled by death or swap:** progress resets to 0; no partial magazine state is introduced.
- **Scoreboard while paused:** hidden; reopening resumes from live engine data on the next update.
- **Bot count > visible rows:** the panel caps at 10 rows sorted by rank, with the player always included (player row pinned if outside the top 10).
- **Minimap while player is dead:** player blip remains at last death position dimmed; bots continue updating.
- **Falling near the former stairwells:** full-width deck now covers both cuts, so there is no opening; the ocean-fall check still exists as a backstop for any future hole.
- **DPR / small screens:** SVG scales with the panel; blip radii stay legible because they are metre-based in a 108 m-tall viewBox.
- **Material/light cost on low tier:** fill and rim lights are cheap point lights with short range; if the low graphics preset is active, the rim light is skipped. No shadows.

## Testing

New unit tests (`node node_modules/tsx/dist/cli.mjs --test src/game/*.test.ts`):

- `viewmodelPose.test.ts`
  - ADS pose places a mock `sightRear` on the camera axis within 1e-4 for all four sight heights.
  - Reload sampling is clamped and continuous at 0 and 1, and moves the left hand and magazine by non-zero amounts mid-sequence.
  - Cycle durations stay below their weapon fire intervals (pump 0.45 < 0.75 s; lever 0.55 < 0.706 s).
  - Recoil spring: shotgun/sniper kicks fall below 5% of peak within their fire interval; AR/SMG stacked offsets stay under their clamps after 2 s of sustained fire.
- `scoreboard.test.ts`
  - Sort order: score, then kills, then deaths, then name.
  - Player is included once and flagged.
  - Dead entries remain listed.
  - Top-10 cap still includes the player.
- `minimap.test.ts`
  - `projectToMap` maps hull corners to the viewBox corners and the pool center to (−5.5, 0).
  - A point outside the hull projects outside the hull path bounds.
  - `playerRotationDeg(0) === 0`; positive yaw produces a negative rotation; ±180° is stable.
  - Feature rectangles fall inside the matching zone.
- `mapHijacked.test.ts` additions
  - No collider with a walkable footprint (both horizontal extents ≥ 0.8 m) has its top below y −0.45; this fails on the old tunnel floor and stair treads.
  - Both walkway lanes (x ±10.2) have solid deck at y 0 across the former cuts z −18..−10 and 10..18.
  - No waypoint sits below y −0.1, and no `maint_*` waypoint exists.

Existing tests (86) must stay green; weapon damage, falloff, respawn, and killfeed behavior must not change.

## Browser QA

1. Walk both walkways across the former stairwell locations: no hole, no fall, no ocean death.
2. All four weapons hip-fire and ADS: irons center on screen with no ADS dot, hands grip correctly.
2. Sniper scope: existing overlay still appears with FOV zoom, modeled scope aligns during the transition, lever animates after each shot and settles before the next.
3. Shotgun: pump animates after each shot and during the final reload step.
4. Mid-reload screenshots for each weapon; no geometry snapping or detached hands.
5. HUD: no numeric HP, no speed text, no ADS dot, health bar and ghost bar react to damage and regen.
6. TAB: hold shows board, release hides, pointer lock retained, `Escape`/blur hides it, RANKS button toggles on mouse, bot rows show real kills after a bot kills the player.
7. Minimap: player and bots stay inside the hull at bow deck, centre pool, lounge, and stern deck; facing arrow matches look direction at four yaw values.
8. Performance: 0 console errors and no regression from the previous ~71 FPS baseline on the same scene.
9. Match end and respawn still work; killfeed still reads `A killed B`.

## Rollout order

1. Below-deck tunnel and maintenance stair removal.
2. Minimap module + SVG radar.
3. HUD health-bar cleanup.
4. Scoreboard type, engine callback, App wiring, HUD overlay, TAB input.
5. Viewmodel rig, hands, fill light, sights, ADS pose, reload/cycle animations.
6. Tests, full gate, browser QA, review, push.

Steps 1–4 are independent of the viewmodel rebuild and can ship first; step 5 carries the visual risk.
