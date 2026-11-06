# Unlimited Reserve Ammo Design (Project Rushkill)

**Date:** 2026-11-06
**Size:** small change
**Status:** Approved
**Spec:** This document

## Intent & why
Make every weapon's reserve supply effectively infinite — only the clip magazine has to be reloaded.

## Approach (chosen)
Set `reserveAmmo: Infinity` across all 14 entries of `RUSH_WEAPONS` in `src/game/weapons.ts`, Leave engine behavior intact.
- `engine.ts` `startReload()` already computes `needed = magSize - ammo; reloadAmount = Math.min(needed, reserveAmmo) → needed`.
- `tryFire()` already gates `if (this.ammo <= 0) { sound.playMechanicalClick; if (reserveAmmo > 0) startReload() }` → `Infinity > 0` keeps reloads available.
- HUD reserve value infinity → rendered as `∞`.

## Files touched
- `src/game/weapons.ts` — replace `reserveAmmo: <n>,` lines with `reserveAmmo: Infinity,`.
- `src/components/HUD.tsx` — render `∞` when `stats.reserveAmmo === Infinity`.
- (No changes to App.tsx / GameSetupScreen / pause modal.)

## Verification
- `tsc --noEmit` and `npm run build` pass.
- Manual: deplete clip → reload fires → fire again; HUD shows ∞; reload gates fire while clip empty.
