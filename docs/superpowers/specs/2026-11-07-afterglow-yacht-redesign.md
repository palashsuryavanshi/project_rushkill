# Afterglow Yacht Redesign — Design

**Date:** 2026-11-07
**Status:** Approved
**Scope:** Layout, palette, lighting, map-facing HUD, spawns, and bot waypoints

## Intent

The current yacht is a single 44 m cabin in the middle of a 108 m hull. Every fight funnels down the same long corridor, the palette is nearly monochrome, and the upper deck is sealed behind bullet-blocking glass, so it cannot actually shoot out. The redesign takes the **structural ideas** of Black Ops II's Hijacked — mirrored end cabins, two full-length side walkways, a central deck hotspot, upper vantage rooms, and a below-deck service lane — and rebuilds them on our own yacht. No geometry, props, or colour values are copied.

The why: give the map a rotation loop instead of a corridor, make every third of the ship readable at a glance, and make the upper level a real power position that can be contested.

## Goals

- Two mirrored bow/stern cabins with a 36 m open central deck between them.
- A three-lane loop: port walkway, central deck, starboard walkway — plus an upper route and a below-deck route.
- Upper rooms that can shoot out over both the central deck and their end deck.
- A central hotspot with distinct cover types: pool, covered lounge, and a centre planter.
- A warm sunset palette with clear material separation (deck / hull / cover / glass / metal).
- Spawns and bot waypoints updated to the new geometry, with tests that prove connectivity.
- Minimap and map-facing copy updated to the new layout and name.

## Non-goals

- New weapons, movement mechanics, bot archetypes, or match rules.
- Ladders or climbable surfaces. The engine has no ladder state, so vertical routes are stairs.
- A full texture/asset pipeline. Detail is procedural (canvas textures) and box geometry, matching the current map builder.
- Renaming the internal `hijacked` map id, `buildHijackedMap`, or the map module in this pass.

## Anti-goals

- Copying Hijacked's exact footprint, prop placement, or colour scheme.
- A map that is visually richer but harder to read at 20 m: cover and enemies must stay legible.
- A layout that bots cannot traverse. Every route a player can take must have a waypoint path.
- Spending the frame budget on decorative boxes: merged meshes and a bounded collider count stay mandatory.

## Constraints

- Hull footprint stays 24.4 m wide × 108 m long (x −12.2..12.2, z −54..54) with the existing bow taper and surrounding ocean.
- Player: radius 0.45 m, step height 0.55 m, run 12 m/s, ADS 5.5 m/s, jump apex ~1.5 m (gravity 9.81).
- Bots climb steps ≤ 0.35 m reliably and are grounded by the highest collider under them; they have no ladder logic.
- Colliders are AABBs. Glass is walk-through but blocks bullets; every solid box is also a bullet blocker.
- Bots have no horizontal collision resolution: they drive straight at the next waypoint. Waypoint edges must therefore be short, straight, and clear of geometry.
- **Ceiling collision fix (scope addition).** `PlayerPhysics.resolveCollisions` currently treats every overlapping box as a wall, so a jumping player under a low roof or the maintenance ceiling is ejected sideways. The redesign adds ceiling handling: when a box begins above the player's chest, clamp the jump against its underside and zero upward velocity instead of pushing horizontally. This is collision correctness, not a new movement mechanic, and it is required for the lounge roof and below-deck lane. A regression test covers jumping under a low ceiling.
- Static boxes are merged per material + render order at build time. New materials must be registered in `materialByUuid`.
- The sun's PMREM environment is generated from the new sky dome instead of the neutral `RoomEnvironment`, so metals and glass pick up the sunset tint.
- Shadow map is 2048 with an orthographic camera of ±80; the sun angle must keep the whole play space inside it.
- The low graphics tier disables shadows but must still look intentional.
- The map module must keep building under `tsx` (guard `import.meta.env?.DEV`).

## Approaches Considered

1. **Two-cabin sunset charter (selected).** Split the central cabin into mirrored bow and stern cabins and open a central deck. Highest fidelity to the inspiration's flow, adds the missing rotation loop and verticality. Cost: a near-total rewrite of `mapHijacked.ts` and its tests.
2. **Central atrium.** Keep one cabin but carve a pool courtyard through it. Cheaper, but retains the single-block silhouette and loses the two-cabin loop.
3. **Visual reskin only.** Palette, materials, sky, and lighting only. Cheapest, but leaves the corridor sightlines and flat pacing untouched.

Approach 1 is selected because the layout problem is the reason for the work; the palette alone would not fix it.

## Layout

Top-down, bow at the top. Dimensions in metres. The hull rails stay at x ±12.2 and z ±54.2.

```
                 BOW  z −54
        ┌──────────────────────┐
        │  helipad H · crates  │   bow deck: z −54..−36
        │  winch · loungers    │
        ├──────────────────────┤
        │  BOW CABIN           │   z −36..−18
        │  3 rooms · stairs ↑  │   x −8.5..8.5, upper y 4.6
        │  external stair ↗    │   starboard walkway
        ├──────────────────────┤
 port   │ ▭ pool      ▢ lounge │   central deck: z −18..18
 walk   │      planter         │   pool port, covered lounge starboard
        │  maint. stair ↓      │   starboard aft, port forward
        ├──────────────────────┤
        │  STERN CABIN         │   z 18..36
        │  3 rooms · stairs ↑  │   mirrored
        │  external stair ↖    │   port walkway
        ├──────────────────────┤
        │  jacuzzi · crates    │   stern deck: z 36..54
        └──────────────────────┘
                 STERN  z 54
```

### Zones

**Bow deck, z −54..−36.** Spawn deck. Helipad circle (8 m diameter) centred at (0, −45) as the navigation landmark and original signature. Cover: crate stack port (x −7, z −40), crate stack starboard (x 7, z −40), anchor winch (0, −50), two sun loungers. A starboard external stair rises from (10.2, −47.2) to a landing at y 4.6, z −36: 14 treads at 0.33 m rise and 0.8 m run, with a door into the upper bow room. Rails around the perimeter.

**Bow cabin, z −36..−18, x −8.5..8.5.** Ground floor y 0..4.2, upper floor y 4.6..8.2.

- Three ground rooms: a central hall (x −3..3) and port/starboard rooms (x −8.5..−3 and 3..8.5). Front doorway (4 m wide) centred at z −36; rear doorway at z −18; side doorways to both walkways at z −27.
- Ground cover: bar counter in the port room, sofas in the starboard room, a partition column in the hall.
- Internal stair: x 5.8, rising from z −23.4 (y 0) to z −34.6 (y 4.6), 14 treads at 0.33 m rise and 0.8 m run. This fits inside the 18 m cabin and keeps every step inside the bots' reliable climb limit.
- Upper room: x −7..7, z −35..−19, floor 4.6, ceiling 8.2. Open on the central-deck face and the bow-deck face with waist-high railings, so it can fire out. Solid walls on the outboard sides. Doorway from the internal stair and a door to the external stair landing.
- Upper cover: console at x 4, z −30; low cabinet at x −4, z −22.

**Stern cabin, z 18..36.** Mirror of the bow cabin across z = 0: internal stair at x −5.8 running z 23.4→34.6, external stair on the port walkway from (−10.2, 47.2) to the landing at z 36.

**Central deck, z −18..18.** Open to the sky; the hotspot.

- Pool: port side, x −8.2..−2.8, z −7..7. A 0.4 m teak curb surrounds a shallow basin; water surface at y 0.08 and no collider on the water, so players can wade it. The curb is cover. A steel-and-glass viewing shelf hangs outside the port rail at x −12.2..−14.5, z −4..4, y −0.6, purely visual, with a brass frame.
- Covered lounge: starboard, x 2.8..8.2, z −7..7. Roof at y 3.2 on four columns, open sides. Inside: two sofas, a low table, a bar shelf. The roof is solid cover from above.
- Centre planter: x −1.4..1.4, z −3..3, 1.2 m high, with a small palm/mast. This is the sightline breaker between bow and stern.
- Two low benches/planters at (0, ±11) to stagger the centre lane.
- Maintenance access: starboard at x 8.5..12.2, z 10..18, descending to y −3.4 at z 18 on 10 treads at 0.34 m rise and 0.8 m run; port at x −12.2..−8.5, z −18..−10, mirrored. Both are open stairwells with brass rails and an amber light.

**Walkways, x ±8.5..±12.2, z −54..54.** Full length on both sides. Cover: one staggered crate cluster per side — port at z ≈ −10, starboard at z ≈ +14 — plus a life-ring station at z 0 and the two stairwells described above. Two clusters total, not two per side, so neither cluster lands in a stairwell.

**Upper level.** Each upper room opens over the central deck and its end deck. Railings at 1.0 m, solid side walls, no glass on the firing faces. This fixes the current map's flaw where bridge glass blocked the defenders' own bullets.

**Glass.** Exactly four teal panes: one on each outboard ground-cabin wall per cabin, set beside the walkway doorways (not on any main firing face). They stay walk-through and become bullet blockers, preserving the glass invariant with new positions.

**Maintenance deck, y −3.4..−0.4.** Central tunnel x −2.6..2.6, z −36..36, with side branches at z 14 (starboard) and z −14 (port) connecting to the two stairwells. Dark metal walls, amber cage lights every 8 m, two crate clusters, and bulkhead frames at z ±12 and ±24. This is the safe rotation lane and a close-quarters flank route.

The existing hull is two solid visual boxes spanning x ±(2.7..12.2), so the side branches and stairwells would sit inside opaque geometry. Rebuild the hull as a hollow shell: thin outer side walls, a bottom, deck underside, and the existing bow cone, leaving the interior open for the service corridors. The player never sees outside the hull except at the stairwell openings; the ocean plane stays below. This is a geometry rebuild, not an engine change.

## Palette

A warm sunset charter. Saturated colour is reserved for water and hazards; architecture stays low-saturation so enemy silhouettes read.

| Role | Hex | Notes |
|---|---|---|
| Hull ivory | `#f1e4cf` | roughness 0.42, metalness 0.05 |
| Hull shadow trim | `#d9c3a4` | recesses and toe kicks |
| Teak deck | `#9c5f36` | roughness 0.68, procedural plank texture |
| Teak highlight | `#b3784a` | stairs, pool curb |
| Cover burnt orange | `#c25a38` | crate/planter accents only |
| Navy upholstery | `#1e3446` | sofas, crates |
| Brass | `#b08a4f` | rails, frames, light cages |
| Dark metal | `#24262b` | stairs, maintenance, fittings |
| Teal glass | `#2b6f6a` | opacity 0.42, blocks bullets |
| Pool water | `#37c6b0` | emissive 0.08 |
| Ocean | `#0a4b52` | roughness 0.1, metalness 0.6 |
| Cushion cream | `#e6d6ba` | lounge seating |
| Hazard amber | `#e2a13c` | maintenance lights and stair nosings |
| Island green | `#3c5b48` | muted, desaturated from today |
| Island sand | `#d9c08a` | thin ring at the waterline |

The deck gets a 128×128 procedural teak texture (dark seams on a warm base) with `RepeatWrapping` and an SRGB colour space. Hull walls stay untextured to keep the merge cheap.

## Lighting and Sky

- **Sky:** inverted sphere with a vertical vertex/shader gradient — zenith `#3f6699`, horizon `#ffca9c`, with a soft warm glow around the sun. `fog: false`, `depthWrite: false`, render order −2. A sun billboard sits low near the stern-starboard horizon.
- **Fog:** `FogExp2(#e6a983, 0.0026)`, so islands fade but remain visible.
- **Sun:** directional `#ffd0a0`, intensity 2.4, position `(38, 30, 58)`, targeting the origin. Low and warm, casting long shadows from stern-starboard toward the bow.
- **Shadows:** 2048 map, bounds ±85, near 0.5, far 220, same bias values as today.
- **Hemisphere:** sky `#a9c9e8`, ground `#5d4335`, intensity 0.65.
- **Interior practicals:** warm `#ffb46b` point lights in each cabin (0.8 intensity, 12 m), `#ffc07a` in the lounge (0.6, 10 m), and four amber `#ffa53a` tunnel lights spaced every ~16 m (0.7, 9 m) with emissive fixture meshes between them. Total real point lights: **7**. This cap keeps forward-rendering cost predictable.
- **Environment:** replace the neutral `RoomEnvironment` PMREM with one generated from the sky dome, so brass, chrome, and glass reflect the sunset instead of a grey studio.
- Keep ACES tone mapping and exposure 1.05.
- Low tier: shadows off; sky, materials, and practicals stay, so the palette survives.

## Readability, Cover, and Pacing

- **Three lanes:** port walkway (fast, exposed), central deck (cover-dense, close range), starboard walkway (fast, exposed). Cabins connect the lanes at both ends; the maintenance tunnel connects them safely below.
- **Sightlines:** the centre planter and lounge roof break the bow-to-stern line. The longest intentional sightline is the side walkway (~100 m), which rewards the sniper but exposes the shooter to upper rooms.
- **Vertical risk/reward:** upper rooms see both the central deck and their end deck, but are open to walkway fire and can be reached by two stairs. No bullet-blocking glass on firing faces.
- **Cover rhythm:** spawn deck (medium) → cabin (tight) → central deck (dense) → cabin (tight) → spawn deck (medium), with the maintenance tunnel as the quiet/safe beat.
- **Enemy readability:** warm, low-saturation architecture; navy and burnt-orange cover; bots keep their saturated team colours.

## Spawns

Eight spawn points, mirrored:

1. Bow centre `(0, 0.1, −46)`
2. Bow port `(−9.5, 0.1, −42)`
3. Bow starboard `(9.5, 0.1, −42)`
4. Stern centre `(0, 0.1, 46)`
5. Stern port `(−9.5, 0.1, 42)`
6. Stern starboard `(9.5, 0.1, 42)`
7. Upper bow `(0, 4.6, −28)`
8. Upper stern `(0, 4.6, 28)`

Every spawn must sit above solid deck and outside every collider footprint. `pickSafestSpawn` keeps working unchanged.

## Waypoints

Approximately 38 nodes, all connected. Edges are short (≤ 12 m), straight, and clear of geometry: bots have no horizontal collision resolution, so an edge through a wall would make them grind against it. Required ids/prefixes:

- `bow_heli` — kept because bot AI prefers it for sniper personalities.
- `upper_bow`, `upper_stern` — `upper` prefix is used by the sniper preference.
- `port_*`, `star_*` — prefixes used by the flanker preference.
- Cabin ground: hall, port room, starboard room, stair bottom, stair top.
- Central: `center_north`, `pool_edge`, `lounge`, `center_south`.
- Walkways: north/mid/south on each side, plus the external stair bottom/top.
- Maintenance: port/starboard access bottoms, tunnel junctions at `(±2.6, −3.3, ±14)`, and tunnel north/centre/south.

Stairs get a bottom and top waypoint so bots walk the treads instead of pathing into the stairwell wall. The graph must be connected: a BFS from `bow_heli` must reach every node. The test also samples each edge at 1 m intervals and asserts no solid collider intersects the segment at chest height (0.9 m above the local floor), so a connected graph cannot hide a wall-crossing edge.

## HUD and Naming

- User-facing map name becomes **AFTERGLOW**; subtitle **Sunset Charter Arena**.
- Loadout line: “Equip your primary firearm for the Afterglow yacht match.”
- Game-over copy references Afterglow instead of Hijacked.
- Minimap label becomes **AFTERGLOW RADAR**.
- Minimap wireframe: two amber cabin blocks at the ends, a cyan pool block on the port side of the centre, a cream lounge block to starboard, the bow `H`, and the stern jacuzzi. Keep the existing coordinate normalisation (x / 26 × 40, z / 110 × 80) so blips stay aligned.
- Keep the internal map id `hijacked` and the `buildHijackedMap` symbol to avoid touching config and imports.

## Performance Budget

- Build time ≤ 60 ms (today 24 ms).
- ≤ 260 colliders, ≤ 300 bullet blockers (today 107 / 111).
- Static geometry still merged per material + render order; target ≤ 140 draw calls.
- ≤ 8 real point lights total.
- Texture budget: one 128×128 deck texture; no per-object textures.
- Low graphics tier must stay playable without shadows.

## Verification

- `npm run lint` (tsc) exits 0.
- `node node_modules/tsx/dist/cli.mjs --test src/game/*.test.ts` passes.
- `node node_modules/vite/bin/vite.js build` succeeds.
- New/updated tests:
  - Waypoint graph is connected, every neighbour id exists, and every edge is clear of solid colliders at chest height.
  - Every spawn sits above a collider and outside all collider footprints.
  - All four glass panes are bullet blockers, absent from movement colliders, and in their new outboard positions.
  - Map bounds and collider/blocker budgets stay inside the limits.
  - Jumping under a low ceiling clamps at the ceiling and does not eject the player horizontally.
  - Existing physics/combat/respawn tests still pass.
- Browser: start a match, confirm no console errors, capture screenshots from the bow, central deck, upper room, and maintenance tunnel, and report the HUD FPS.

## Left to the Builder

- Exact prop counts and decorative placement inside the zones above.
- Sky shader implementation details and the sun billboard art.
- Plank texture pattern details.
- Whether to keep the stern flag and radar-scanner props from the current map.
- Final tuning of waypoint coordinates to eliminate bot stuck spots found in playtesting.
- Stairwell railings and hatch trim details within the stated footprints.
