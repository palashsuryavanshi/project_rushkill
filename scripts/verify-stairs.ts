/**
 * Headless verification harness for the player collision resolver.
 *
 *   node scripts/verify-stairs.ts
 *
 * Covers:
 *  1. Map invariants (footprint, collider budget).
 *  2. A 226-case sweep of every way a player can approach every staircase,
 *     asserting nobody ends up in the ocean and no frame ever teleports the
 *     player more than one frame of travel (which is the signature of the
 *     min-penetration ejection bug).
 *  3. A stair-climb regression: all four staircases must still be climbable
 *     from the deck to the upper level.
 *
 * Node 24 strips TypeScript types natively, so no build step is needed. The
 * explicit .ts specifiers keep the ESM resolver happy without Vite/Jest.
 */
import * as THREE from 'three';
import { PlayerPhysics } from '../src/game/playerPhysics.ts';
import { buildHijackedMap } from '../src/game/mapHijacked.ts';
import type { BoxCollider } from '../src/game/mapHijacked.ts';

const map = buildHijackedMap();
const ALL: readonly BoxCollider[] = map.colliders;

const OCEAN_Y = -3.5;
const HULL_HALF_X = 12.2;
const HULL_HALF_Z = 54.2;
const DT = 1 / 60;

const W: ReadonlySet<string> = new Set(['KeyW']);

let failures = 0;
function check(ok: boolean, label: string, detail = ''): void {
  if (!ok) {
    failures++;
    console.log(`  FAIL  ${label}${detail ? `  ${detail}` : ''}`);
  }
}

// ---------------------------------------------------------------------------
// 1. Map invariants
// ---------------------------------------------------------------------------
console.log('\n[1] map invariants');
{
  const xs = ALL.flatMap((c) => [c.min.x, c.max.x]);
  const zs = ALL.flatMap((c) => [c.min.z, c.max.z]);
  check(Math.min(...xs) >= -15 && Math.max(...xs) <= 15, 'x within +/-15');
  check(Math.min(...zs) >= -56 && Math.max(...zs) <= 57, 'z within -56..57');
  check(ALL.length <= 260, 'collider budget', `${ALL.length}`);
  check(map.bulletBlockers.length <= 300, 'blocker budget', `${map.bulletBlockers.length}`);
  // The perimeter bulkhead must be collider-only and never bullet-blocking.
  const bulkhead = ALL.filter((c) => c.max.y === 7);
  check(bulkhead.length === 4, 'four perimeter bulkhead walls', `${bulkhead.length}`);
  check(
    bulkhead.every((b) => !map.bulletBlockers.includes(b)),
    'bulkhead is not a bullet blocker'
  );
}

// ---------------------------------------------------------------------------
// Simulator
// ---------------------------------------------------------------------------
interface RunResult {
  label: string;
  oceanFall: boolean;
  minY: number;
  maxY: number;
  finalY: number;
  maxStepXZ: number;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

function simulate(
  label: string,
  start: THREE.Vector3,
  yaw: number,
  keys: ReadonlySet<string>,
  colliders: readonly BoxCollider[],
  frames = 300,
  jumpEvery = 0,
  dt = DT
): RunResult {
  const body = new PlayerPhysics();
  body.reset(start.clone());

  let oceanFall = false;
  let minY = start.y;
  let maxY = start.y;
  let maxStepXZ = 0;
  let minX = start.x;
  let maxX = start.x;
  let minZ = start.z;
  let maxZ = start.z;

  for (let f = 0; f < frames; f++) {
    if (jumpEvery > 0 && f % jumpEvery === 0) body.queueJump();
    const before = body.pos.clone();
    body.update(dt, { keys, yaw, isAds: false, colliders }, {
      onOceanFall: () => {
        oceanFall = true;
      },
    });

    // Any single-frame horizontal displacement above this is a resolver
    // ejection, not movement (max slide speed 18 m/s * 1/60 = 0.30 m).
    const step = Math.hypot(body.pos.x - before.x, body.pos.z - before.z);
    if (step > maxStepXZ) maxStepXZ = step;

    minY = Math.min(minY, body.pos.y);
    maxY = Math.max(maxY, body.pos.y);
    minX = Math.min(minX, body.pos.x);
    maxX = Math.max(maxX, body.pos.x);
    minZ = Math.min(minZ, body.pos.z);
    maxZ = Math.max(maxZ, body.pos.z);

    if (body.pos.y < OCEAN_Y) break;
  }

  return {
    label,
    oceanFall,
    minY,
    maxY,
    finalY: body.pos.y,
    maxStepXZ,
    minX,
    maxX,
    minZ,
    maxZ,
  };
}

interface Stair {
  name: string;
  /** centre x of the treads */
  x: number;
  /** z of the first (lowest) tread */
  z: number;
  /** direction the run climbs along z */
  zDir: 1 | -1;
  width: number;
  steps: number;
  run: number;
  rise: number;
  /** y of the top tread */
  topY: number;
}

const stairs: Stair[] = [
  { name: 'bow internal', x: 4.6, z: -23.4, zDir: -1, width: 2.4, steps: 15, run: 0.8, rise: 4.6 / 15, topY: 4.6 },
  { name: 'stern internal', x: -4.6, z: 23.4, zDir: 1, width: 2.4, steps: 15, run: 0.8, rise: 4.6 / 15, topY: 4.6 },
  { name: 'bow external', x: 10.2, z: -47.2, zDir: 1, width: 2.0, steps: 14, run: 0.8, rise: 0.33, topY: 4.62 },
  { name: 'stern external', x: -10.2, z: 47.2, zDir: -1, width: 2.0, steps: 14, run: 0.8, rise: 0.33, topY: 4.62 },
];

/** yaw that makes W travel along +zDir. */
const yawFor = (zDir: 1 | -1) => (zDir > 0 ? Math.PI : 0);

// ---------------------------------------------------------------------------
// 2. Approach sweep
// ---------------------------------------------------------------------------
console.log('[2] approach sweep (every way of reaching every staircase)');
const sweep: RunResult[] = [];

for (const s of stairs) {
  // (a) Stand beside the staircase and walk into its side.
  for (const side of [-1, 1]) {
    for (const lateral of [0.2, 0.5, 0.9]) {
      const startX = s.x + side * (s.width / 2 + lateral);
      if (Math.abs(startX) > HULL_HALF_X - 0.4) continue;
      sweep.push(
        simulate(
          `${s.name} | side ${(side * lateral).toFixed(1)} | walk in`,
          new THREE.Vector3(startX, 0.1, s.z + s.zDir * 0.4),
          side > 0 ? Math.PI / 2 : -Math.PI / 2,
          W,
          ALL
        )
      );
    }
  }

  // (b) Run the run head-on, bunny hopping.
  for (const along of [-1.3, -0.5, 0.5, 1.5, 2.5]) {
    sweep.push(
      simulate(
        `${s.name} | along ${along} | hop up`,
        new THREE.Vector3(s.x, 0.1, s.z + s.zDir * along),
        yawFor(s.zDir),
        W,
        ALL,
        300,
        12
      )
    );
  }

  // (c) Stand on each tread and jump outboard.
  for (const step of [0, 2, 4, 6, 8, 10, 12, 13]) {
    if (step >= s.steps) continue;
    for (const side of [-1, 1]) {
      sweep.push(
        simulate(
          `${s.name} | tread ${step} | jump outboard`,
          new THREE.Vector3(s.x, step * s.rise + 0.05, s.z + s.zDir * step * s.run),
          side > 0 ? Math.PI / 2 : -Math.PI / 2,
          W,
          ALL
        )
      );
    }
  }

  // (d) Run the outboard walkway beside the staircase, hopping.
  for (const zOff of [-6, -3, 0, 3, 6]) {
    for (const xOff of [0, 1.0, 1.6]) {
      const x = Math.sign(s.x) * (10.2 + xOff);
      if (Math.abs(x) > HULL_HALF_X - 0.4) continue;
      for (const dir of [1, -1]) {
        sweep.push(
          simulate(
            `${s.name} | walkway x${x.toFixed(1)} dz${zOff} dir${dir} | hop`,
            new THREE.Vector3(x, 0.1, s.z + zOff),
            dir > 0 ? Math.PI : 0,
            W,
            ALL,
            300,
            12
          )
        );
      }
    }
  }
}

const falls = sweep.filter((r) => r.oceanFall || r.minY < -0.5);
const teleports = sweep.filter((r) => r.maxStepXZ > 0.32);
const outOfBounds = sweep.filter(
  (r) =>
    r.minX < -HULL_HALF_X - 0.01 ||
    r.maxX > HULL_HALF_X + 0.01 ||
    r.minZ < -HULL_HALF_Z - 0.01 ||
    r.maxZ > HULL_HALF_Z + 0.01
);

console.log(`   ${sweep.length} runs`);
for (const f of falls.slice(0, 10)) {
  console.log(
    `   fall  ${f.label}\n         minY=${f.minY.toFixed(2)} finalY=${f.finalY.toFixed(2)} maxStep=${f.maxStepXZ.toFixed(2)}`
  );
}
check(falls.length === 0, 'no ocean falls', `${falls.length}`);

for (const t of teleports.slice(0, 10)) {
  console.log(`   jump  ${t.label}  maxStep=${t.maxStepXZ.toFixed(2)}`);
}
check(teleports.length === 0, 'no resolver teleports', `${teleports.length}`);

for (const o of outOfBounds.slice(0, 10)) {
  console.log(
    `   oob   ${o.label}  x ${o.minX.toFixed(2)}..${o.maxX.toFixed(2)}  z ${o.minZ.toFixed(2)}..${o.maxZ.toFixed(2)}`
  );
}
check(outOfBounds.length === 0, 'never leaves the hull', `${outOfBounds.length}`);

// ---------------------------------------------------------------------------
// 3. Stair-climb regression
// ---------------------------------------------------------------------------
console.log('[3] stair-climb regression');
for (const s of stairs) {
  // Start one metre before the lowest tread, on the deck. Use the highest point
  // reached: after topping out the player keeps running and may walk off the
  // landing, which would make the final y misleading.
  const startZ = s.z - s.zDir * 1.0;
  const run = simulate(
    `${s.name} | climb`,
    new THREE.Vector3(s.x, 0.1, startZ),
    yawFor(s.zDir),
    W,
    ALL,
    420
  );
  const climbed = run.maxY;
  const ok = climbed > s.topY - 0.6;
  console.log(
    `   ${ok ? 'ok  ' : 'FAIL'} ${s.name.padEnd(14)} top=${s.topY.toFixed(2)} reached=${climbed.toFixed(2)}`
  );
  check(ok, `${s.name} is climbable`, `reached y=${climbed.toFixed(2)}, expected ~${s.topY.toFixed(2)}`);
}

// ---------------------------------------------------------------------------
// 4. Gameplay sanity
// ---------------------------------------------------------------------------
console.log('[4] gameplay sanity');

// The exact scene from the bug report: hop along the outboard walkway into the
// underside of the external staircase. This used to bury the player below the
// deck and eject them overboard.
for (const [x, z, dir] of [
  [10.2, -30, 0],
  [-10.2, 30, Math.PI],
] as const) {
  const run = simulate(
    `under-stair hop x${x}`,
    new THREE.Vector3(x, 0.1, z),
    dir,
    W,
    ALL,
    360,
    12
  );
  console.log(
    `   under-stair x${x}  minY=${run.minY.toFixed(2)} maxX=${run.maxX.toFixed(2)} maxStep=${run.maxStepXZ.toFixed(2)}`
  );
  check(!run.oceanFall, `under-stair x${x} does not fall`, `minY=${run.minY.toFixed(2)}`);
  check(run.minY > -0.5, `under-stair x${x} stays on deck`, `minY=${run.minY.toFixed(2)}`);
  check(run.maxStepXZ <= 0.32, `under-stair x${x} no teleport`, `maxStep=${run.maxStepXZ.toFixed(2)}`);
}

// Worst-case frame time (the engine clamps dt to 0.05) must not tunnel or eject.
let worstDtFailures = 0;
for (const s of stairs) {
  for (const side of [-1, 1]) {
    const run = simulate(
      `${s.name} side dt0.05`,
      new THREE.Vector3(s.x + side * (s.width / 2 + 0.4), 0.1, s.z + s.zDir * 0.4),
      side > 0 ? Math.PI / 2 : -Math.PI / 2,
      W,
      ALL,
      300,
      12,
      0.05
    );
    if (run.oceanFall || run.minY < -0.5 || run.maxStepXZ > 0.95) {
      worstDtFailures++;
      console.log(
        `   dt0.05 fail  ${run.label}  minY=${run.minY.toFixed(2)} maxStep=${run.maxStepXZ.toFixed(2)}`
      );
    }
  }
}
check(worstDtFailures === 0, 'worst-case frame time is safe', `${worstDtFailures}`);

// The 4 m central cabin doorway must still be walkable.
{
  const run = simulate(
    'cabin doorway',
    new THREE.Vector3(0, 0.1, -24),
    Math.PI,
    W,
    ALL,
    180
  );
  console.log(`   doorway  finalZ=${run.maxZ.toFixed(2)} maxX=${run.maxX.toFixed(2)}`);
  check(run.maxZ > -17, 'cabin doorway is walkable', `reached z=${run.maxZ.toFixed(2)}`);
  check(!run.oceanFall && run.minY > -0.5, 'cabin doorway stays on deck');
}

// ---------------------------------------------------------------------------
console.log(
  failures === 0 ? '\nALL CHECKS PASSED\n' : `\n${failures} CHECK(S) FAILED\n`
);
process.exitCode = failures === 0 ? 0 : 1;
