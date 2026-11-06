# Unlimited Reserve Ammo Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make reserve ammo effectively infinite; the only reload is from the clip magazine. Reload timers, capacity, damage, fire rate, spread unchanged.

**Architecture:** Replace `reserveAmmo: <n>,` with `Infinity` across all weapon definitions. Engine already handles this (needed, Math.min, isDead stores, etc.). UI renders ∞ in HUD when `stats.reserveAmmo === Infinity`.

**Tech Stack:** Vite 8 + React 19 + TypeScript, Three.js, Tailwind 4.

**Spec:** `docs/superpowers/specs/2026-11-06-unlimited-reserve-ammo-design.md`

## Global Constraints
- Only these files change: `src/game/weapons.ts`, `src/components/HUD.tsx`.
- No clip-size, reload-timing, damage, fire-rate, or spread changes.
- Engine and bot AI untouched.
- Build (`node node_modules/vite/bin/vite.js build`) and typecheck (`node node_modules/typescript/lib/tsc.js --noEmit`) must pass.
- Commit per task, push when done.

## Review Focus
1. Reserve infinite does not break the inequality gate `isReloading` check (line ~557); `Infinity > 0` already works & `Math.min(n, Infinity) === n`.
2. HUD display `Infinity` → `∞` conversion can't leak the literal "Infinity" into any other view (grep render of `reserveAmmo`).
3. No other references to `reserveAmmo` as a finite count get broken.
4. Build Pioneer report building.

---
### Task 1: Set reserveAmmo to Infinity across weapons

**Files:**
- Modify: `src/game/weapons.ts:11-368` (all `reserveAmmo: <n>,` lines)

- [ ] **Step 1:** Replace every `reserveAmmo: <number>,` with `reserveAmmo: Infinity,` (all 14 weapons).
- [ ] **Step 2:** Typecheck + bump build: `node node_modules/typescript/lib/tsc.js --noEmit && node node_modules/vite/bin/vite.js build`
- [ ] **Step 3:** Commit: `git commit -m "Ammo: unlimited reserve — clip still reloads"`

### Task 2: HUD reserve display as infinity

**Files:**
- Modify: `src/components/HUD.tsx:372-382` (reserve display)

- [ ] **Step 1:** Render `∞` when `stats.reserveAmmo === Infinity`, else `stats.reserveAmmo`.

### Task 3: Verify (manual smoke)

- [ ] **Step 1:** Owner verifies: deplete clip → reload → fire again; HUD shows ∞; reload gates fire while empty.

## Execution Handoff
Plan complete and saved to `docs/superpowers/plans/2026-11-06-unlimited-reserve-ammo.md`. Please review the plan. Then say which execution approach:
- **Subagent-driven** or **native** (which I'd recommend — likely native; two small commits).
Does the plan capture what you want?