# Armory: one weapon per class, class-only names

Status: accepted (2026-11-07)

## Intent

The armory currently offers twelve named guns across four classes. That is more choice than the game needs and it forces every screen to print a gun name. The armory becomes four classes with one representative each, identified only by class.

## Goals

- Keep exactly one weapon per class: MCW (AR), Rival-9 (SMG), Lockwood 680 (Shotgun), Longbow (Sniper).
- Remove individual gun names everywhere: armory, title screen, pause loadout, HUD, killfeed, game-over screen, match setup.
- Label the classes exactly `AR`, `SMG`, `Shotgun`, `Sniper`.
- Killfeed reads `A killed B` instead of showing a weapon badge between the names.

## Non-goals

- No changes to weapon stats, recoil, spread, damage, models, or bot difficulty.
- Match setup still restricts by class, not by gun.
- Unreachable model branches for removed ids stay in `gunModels.ts`; deleting them is separate cleanup.

## Approaches

**A — Rename the `name` field in the weapon data (chosen).** One edit at the source; every consumer that already prints `weapon.name` or `entry.weapon` becomes class-only. Trade-off: the name is no longer a proper noun, so anything that wants a gun name later must add a field.

**B — Keep names in data and map to class labels in each component.** Leaves the data truthful but requires six components to know the mapping, and new surfaces can forget it. Rejected as more places to drift.

**C — Add a separate `displayName`.** Cleanest long term, but two name fields for four weapons that no longer have names is overhead with no user-visible benefit. Rejected.

## Decisions

- `RUSH_WEAPONS` holds exactly four entries. Ids stay (`mcw`, `rival_9`, `lockwood_680`, `longbow`) because the 3D model builder keys off them.
- `name` becomes the class label: `AR`, `SMG`, `Shotgun`, `Sniper`.
- Category tabs show the class without pluralizing (`AR`, not `ARs`).
- Labels that currently read `name (category)` collapse to the class once, so the UI never shows `AR (AR)`.
- The match setup screen stops listing removed gun names and shows the class.
- Bots draw from the four remaining weapons by personality: assault/flanker use SMG or shotgun, sniper uses the sniper, defender/support use AR or shotgun. No personality may reference a removed id.
- The engine's full-auto check drops the removed `riveter` id; automatic fire is AR and SMG only. The remaining shotgun is pump-action.
- Killfeed renders `killer killed victim` with the optional `HS` tag, and drops the weapon badge.

## Verification

- Unit tests: exactly four weapons, one per class, each `name === category`; existing damage, regen, respawn, and bot tests still pass.
- `tsc --noEmit` and the Vite production build pass.
- Browser: armory shows four classes with no gun names; a match starts; killfeed reads `A killed B`.
