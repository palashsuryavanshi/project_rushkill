# Gameplay tuning: range, respawns, and gravity

Status: accepted (2026-11-07)

## Intent

Finish the gameplay design that was deferred while the engine was split. The goal is a simpler, more predictable combat model and a real death penalty instead of instant respawns.

## Goals

- Remove range falloff from AR and SMG damage.
- Give shotguns a hard 20 m range instead of gradual falloff.
- Give the sniper unlimited range with 20% damage falloff per 30 m.
- Make the player wait 3 seconds to respawn; bots keep their 10 second respawn.
- Use 1:1 Earth gravity for players and bots, with jump velocities scaled to preserve a good arc.

## Non-goals

- Reserve ammo stays infinite; reloads remain clip-only.
- Pointer-lock input is unchanged (CTRL+F toggle).
- No changes to recoil, spread, bot accuracy, or map geometry.

## Decisions

**1A — Shotgun cutoff.** Pellets beyond 20 m are treated as a miss: no damage, no hitmarker, no kill credit, no floating number. The tracer still shows where the shot landed. This avoids the previous falloff curve, which made long-range shotgun hits feel inconsistent.

**2A — Player respawn.** On death the player freezes movement and firing, keeps the camera where they died, and sees a dimmed `ELIMINATED` overlay with a draining 3 second loading bar (no numeric countdown). Look-around stays enabled. Bots ignore the dead player. The respawn point is the map spawn farthest from the nearest live bot, so a respawn is not an instant second death. Bots keep their 10 second respawn.

**3A — Gravity and jump.** Gravity is `-9.81` for players and bots. The player jump is `5.42 m/s`, giving a ~1.5 m apex and ~1.1 s airtime. The bot jump is `4.9 m/s`, preserving its previous ~1.2 m apex. The 1.5 m apex clears 1 m ledges without the floaty 2.1 m arc that a pure height-preserving scale would produce.

## Follow-up: health regen and respawn loadout

**Health regen.** Player only. Damage starts a 4 second delay; after it, health returns at 20 HP/s up to max. Any new damage restarts the delay, and a dead player never regenerates — respawn is the only way back from 0 HP. Bots keep their fixed health.

**Respawn loadout.** Respawning refills the clip to the active weapon's magazine size and cancels any in-progress reload. This is deliberate: dying is already the penalty, and returning with a partly empty clip punished the player twice. Reserve ammo is unaffected because it is already infinite.

**Crosshair and ADS.** The hip-fire crosshair and the ADS dot are now yellow with a black outline and a soft yellow glow, so they stay legible against both the bright deck and the dark interior. The ADS dot grew to 5 px.

## Follow-up: sniper precision, range, and jump repeat

**Sniper falloff.** The sniper keeps full damage inside 30 m, then loses 20% of its base damage for each additional full 30 m. A headshot multiplier applies after the falloff. There is no range ceiling: the ray reaches any distance, and damage floors at 1.

**Sniper hitbox.** The body AABB now starts at the bot's feet instead of 0.4 m up, so shots on the visible legs register. Scoped sniper shots no longer inherit the generic 0.02 rad stance penalty, which was roughly 2 m of error at 100 m and made visually centred long shots miss. Hip-fired sniper shots keep the normal movement and stance spread.

**Jump repeat.** Browsers repeat `keydown` while Space is held. Those repeats were re-buffering a jump on every frame, so holding Space chained jumps and carried far more distance than a single jump. Only a non-repeat Space press now queues a jump.

## Bug fixed in the same pass

`GameEngine` defined `onBlur` and removed it during cleanup but never registered it, so held keys and ADS could stick after the window lost focus. The listener is now registered.

## Verification

- Unit tests cover the shotgun cutoff (including the pellet-count edge case), full-damage long-range AR/SMG shots, sniper falloff per 30 m step, the leg hitbox, unlimited sniper range, scoped sniper spread, the jump apex, single-launch jump repeat, safe-spawn selection, the respawn progress curve, health regen (delay, rate, cap, dead players), and the respawn loadout.
- `tsc --noEmit`, the full node test suite, and the Vite production build all pass.
- Browser smoke test: title screen and match start render with no console errors.
