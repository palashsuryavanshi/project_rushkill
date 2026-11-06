# Project Rushkill — Performance Hardening (Browser-Only) Design

**Date:** 2026-11-05
**Status:** Implemented This document covers the hardening pass only — multiplayer netcode is out of scope.

## Intent & Why
The game is browser-only today, with private multiplayer as the near-term goal and public multiplayer later. Load time and in-game lag are painful on low-end systems. The winning move is engineering debt removal in the current stack — not a stack swap (PlayCanvas / Godot-WASM either buy nothing or make load time worse and force a rewrite; both were rejected in the pre-design review).

## Goals
- Cut perceived load time: smaller initial parse, fewer render stalls on first paint.
- Cut frame cost on low-end systems: near-zero per-frame React churn, fewer draw calls, cheaper water.
- Give the user a measurable way to verify (FPS readout in settings).
- No gameplay, visual-style, or map changes. No netcode work in this pass.

## Non-goals
- No stack migration. No multiplayer architecture yet (only keep interfaces multiplayer-friendly).
- No redesign of UI/HUD appearance. No quality loss on high-end unless it's the same file both paths share and is free.

## Constraints
- Vite 8 + React 19 + Three.js r187 + Tailwind 4, existing build setup, no new dependencies unless dead code confirms one.
- Browser WebGL only.
- The other AI agent works on the same repo via GitHub — check `git fetch` before every step; never force-push.

## Findings (from recon)
1. `GameEngine.notifyStats()` and `notifyMinimap()` run **every frame** → `setStats` / `setMinimapData` re-render the HUD + minimap at 60Hz on the main thread.
2. Ocean plane is 64×64 segments (~4,100 verts), wave loop runs on the CPU every frame and re-uploads the attribute each frame.
3. Static map (crates, railings, stairs, loungers) is ~200 individual meshes from `createSolidBox` — each one a draw call.
4. Console spam: Three.js `renderOrder` material warnings (material-vs-mesh misuse) fire repeatedly; `console.*` is unguarded in production.
5. `motion` (v12) is in dependencies and imported nowhere — prune it.
6. Vite build doesn't split vendor chunks, so React + Three.js + app all fetch as one file.

## Approaches (the decision, already made with the owner)
- **A (chosen):** stay on the stack; harden it. Load/lag are engineering debt, not technology limits.
- **B:** PlayCanvas migration — rejected: same class of engine, comparable runtime size, full rewrite, no perf win.
- **C:** Godot/Unity WebGL — rejected: 10s-of-MB WASM + cross-origin isolation headers, worse load time, full rewrite.

## The Design

### 1. Kill per-frame React churn
`notifyStats()` / `notifyMinimap()` stay on the same signatures, but the engine rounds/quantizes and only emits when content changed (shallow-compare payload). Minimap pushed at 5–10 Hz, stats at 10 Hz or on any field change. Hit feed / banners / hitmarkers unchanged (discrete already).

### 2. Bundle & load path
- `vite.config.ts`: `manualChunks` for `three` and `react` vendor groups; strip `console.*` in production (`esbuild.drop`); keep single entry page.
- Prune `motion`; audit `express` / `tsx` and remove if unused by shipped code path.
- Keep lazy-loading for later (post-hack pass can split menus if still needed).

### 3. Water cost
Reduce ocean plane to 32×32 segments; keep the same wave math (cost drops ~4×). GPU-vertex shader is the next milestone, out of scope unless 32×32 looks wrong.

### 4. Merged static geometry
One mesh per material group for static solids (teak deck sections, dark carbon, white hull, chrome, crates), merged via `BufferGeometryUtils.mergeGeometries`. Colliders unchanged (physics independent of visuals). Expected draw-call drop from ~200 → ~30 for static map.

### 5. Low-graphics preset
Settings tri-state: **Auto / High / Low**. Auto suggests Low when `deviceMemory < 4 || hardwareConcurrency <= 4`. Low sets: `pixelRatio = 1` (not DPR), shadow map 1024, shadows disabled, tracer/particle caps halved, 16×16 ocean built once. High keeps current behavior. Persisted with existing settings.

### 6. Hygiene: console spam & WebGL warnings
Mechanical fix of material-`renderOrder` misalignments (renderOrder belongs on meshes) so the warning stops at the source; remove stray `console.warn` / gate behind `import.meta.env.DEV`.

### 7. FPS readout (verification aid)
Settings toggle showing smoothed FPS + frame-time in the corner (rAF delta, ~20 lines). **On by default** per owner decision; can be hidden in settings. This is the acceptance measurement tool, not a shipped product feature.

## Verification
- `npm run build` → compare before/after `dist` sizes and chunk split; confirm tree-shake of removed deps.
- Run dev server; verify HUD updates at ~10Hz; ocean waves sane at 32×32; merged map renders identically in the same views as the current build (before/after side-by-side screenshots).
- Owner verifies FPS on their low-end hardware with the toggle-on readout; hard floor is "visibly smoother than before on same machine".
- No new TypeScript errors; no console warnings in production build.

## Risks
- Merged geometry breaks if material groups are misidentified — mitigate with before/after screenshot check.
- Water at 32×32 could look flat near the bow wake — mitigate: keep amplitude identical, only segment density drops; rollback is one constant.
- Any settings change is additive — no state migration risk (new field, default Auto).

## Size
Small-medium (one focused pass, ~half a day of agent work + owner playtest). Fits the current repo flow unchanged.
