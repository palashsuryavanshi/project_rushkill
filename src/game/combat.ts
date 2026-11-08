import * as THREE from 'three';
import type { BotState } from './botAI';
import type { WeaponDef } from './types';

/**
 * Combat geometry + the single-registration projectile queue.
 *
 * Extracted from GameEngine so the hot path (ray vs AABB, spread, delayed hits)
 * is pure, unit-testable, and has one reason to change. GameEngine keeps the
 * stateful orchestration (ammo, recoil, callbacks).
 */

/** Near/far clip used by the original engine ray test. */
export const RAY_NEAR = 0.1;
export const RAY_FAR = 300;

/**
 * Slab ray-vs-AABB intersection.
 * Returns the entry distance along `dir`, or null when the segment misses.
 * `dir` does not need to be normalized for correctness, but all engine callers
 * pass a normalized direction.
 */
export function rayBox(
  origin: THREE.Vector3,
  dir: THREE.Vector3,
  min: THREE.Vector3,
  max: THREE.Vector3,
  near = RAY_NEAR,
  far = RAY_FAR
): number | null {
  let tmin = near;
  let tmax = far;

  for (const axis of ['x', 'y', 'z'] as const) {
    const o = origin[axis];
    const d = dir[axis];
    if (Math.abs(d) < 1e-8) {
      if (o < min[axis] || o > max[axis]) return null;
      continue;
    }
    let t1 = (min[axis] - o) / d;
    let t2 = (max[axis] - o) / d;
    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
    }
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return null;
  }

  return tmax >= near ? tmin : null;
}

export interface BotHit {
  bot: BotState;
  isHead: boolean;
  point: THREE.Vector3;
  dist: number;
}

/** True when the world blocks the shot before it reaches the target. */
export function isBlockedByCover(coverDist: number | null, targetDist: number): boolean {
  return coverDist !== null && coverDist < targetDist;
}

function pointInsideBox(p: THREE.Vector3, min: THREE.Vector3, max: THREE.Vector3): boolean {
  return (
    p.x >= min.x && p.x <= max.x &&
    p.y >= min.y && p.y <= max.y &&
    p.z >= min.z && p.z <= max.z
  );
}

/**
 * Nearest bullet-blocking box along the ray, or null when nothing is hit.
 * Boxes containing the origin are skipped so a player standing in decorative
 * geometry does not shoot their own cover.
 */
export function findClosestBoxHit(
  origin: THREE.Vector3,
  dir: THREE.Vector3,
  boxes: readonly { min: THREE.Vector3; max: THREE.Vector3 }[],
  maxRange: number = RAY_FAR
): number | null {
  let closest: number | null = null;

  for (const box of boxes) {
    if (pointInsideBox(origin, box.min, box.max)) continue;
    const hit = rayBox(origin, dir, box.min, box.max, RAY_NEAR, maxRange);
    if (hit !== null && (closest === null || hit < closest)) closest = hit;
  }

  return closest;
}

/**
 * Rotation-agnostic padded AABB hit test against every alive bot.
 * Prefers the head box when it is at least as close as the body box (within
 * the original 0.15 tolerance) and returns the closest bot along the ray.
 */
export function findClosestBotHit(
  origin: THREE.Vector3,
  dir: THREE.Vector3,
  bots: readonly BotState[],
  maxRange: number = RAY_FAR
): BotHit | null {
  let closest: BotHit | null = null;
  let closestDist = Infinity;

  for (const bot of bots) {
    if (bot.isDead) continue;
    const px = bot.pos.x;
    const py = bot.pos.y;
    const pz = bot.pos.z;

    const bodyHit = rayBox(
      origin,
      dir,
      new THREE.Vector3(px - 0.6, py + 0.05, pz - 0.5),
      new THREE.Vector3(px + 0.6, py + 1.4, pz + 0.5),
      RAY_NEAR,
      maxRange
    );
    const headHit = rayBox(
      origin,
      dir,
      new THREE.Vector3(px - 0.4, py + 1.4, pz - 0.4),
      new THREE.Vector3(px + 0.4, py + 2.1, pz + 0.4),
      RAY_NEAR,
      maxRange
    );

    if (headHit !== null && (bodyHit === null || headHit <= bodyHit + 0.15)) {
      if (headHit < closestDist) {
        closestDist = headHit;
        closest = {
          bot,
          isHead: true,
          point: origin.clone().addScaledVector(dir, headHit),
          dist: headHit,
        };
      }
    } else if (bodyHit !== null) {
      if (bodyHit < closestDist) {
        closestDist = bodyHit;
        closest = {
          bot,
          isHead: false,
          point: origin.clone().addScaledVector(dir, bodyHit),
          dist: bodyHit,
        };
      }
    }
  }

  return closest;
}

/** Aim direction plus the recoil state the next shot will inherit. */
export interface ShotAim {
  dir: THREE.Vector3;
  recoilPitch: number;
  recoilYaw: number;
}

/**
 * Resolve the direction of a shot from the pre-kick view angles.
 *
 * Recoil is applied *after* the direction is built: the round leaves along the
 * reticle the player saw, and only the following shot inherits the kick. Doing
 * it the other way made every scoped sniper round fly its own recoil arc
 * (~5.2 degrees = ~2.7 m high at 30 m, ~7 m at 80 m) while the scope stayed put.
 */
export function resolveShotAim(
  pitch: number,
  yaw: number,
  recoilPitch: number,
  recoilYaw: number,
  recoilVertical: number,
  recoilHorizontal: number,
  rng: () => number = Math.random
): ShotAim {
  const dir = new THREE.Vector3(0, 0, -1);
  dir.applyEuler(new THREE.Euler(pitch + recoilPitch, yaw + recoilYaw, 0, 'YXZ'));

  return {
    dir,
    recoilPitch: recoilPitch + recoilVertical,
    recoilYaw: recoilYaw + (rng() - 0.5) * recoilHorizontal,
  };
}

/**
 * Spread cone for one shot. Scoped sniper shots get only the optic's own
 * cone: the generic stance penalty is ~2 m of error at 100 m, which made
 * visually centred long shots miss.
 */
export function computeShotSpread(
  weapon: WeaponDef,
  isAds: boolean,
  speed: number,
  isSliding: boolean
): number {
  const base = isAds ? weapon.adsSpread : weapon.hipSpread;
  if (weapon.category === 'Sniper' && isAds) return base;

  const movementSpread = speed * 0.002;
  const stanceSpread = isSliding ? 0.08 : 0.02;
  return base + movementSpread + stanceSpread;
}

/**
 * Apply a circular spread cone to an aim direction (mutates and re-normalizes).
 * `rng` is injectable so tests are deterministic.
 */
export function applySpread(
  dir: THREE.Vector3,
  spreadRad: number,
  rng: () => number = Math.random
): void {
  if (spreadRad > 0) {
    const angle = rng() * Math.PI * 2;
    const r = rng() * spreadRad;
    dir.x += Math.cos(angle) * r;
    dir.y += Math.sin(angle) * r;
  }
  dir.normalize();
}

/** A shot that has been resolved but whose damage is delayed by travel time. */
export interface PendingHit {
  bot: BotState;
  isHead: boolean;
  damage: number;
  point: THREE.Vector3;
  dist: number;
  delay: number;
}

/**
 * Advance the pending-hit queue. Delayed shots whose bot died before impact are
 * dropped (the original behavior). Mutates `pendingHits` in place.
 */
export function drainPendingHits(
  pendingHits: PendingHit[],
  dt: number,
  onHit: (hit: PendingHit) => void
): void {
  for (let i = pendingHits.length - 1; i >= 0; i--) {
    const pending = pendingHits[i];
    pending.delay -= dt;
    if (pending.delay > 0) continue;
    if (!pending.bot.isDead) onHit(pending);
    pendingHits.splice(i, 1);
  }
}
