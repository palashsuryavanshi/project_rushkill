import { PlayerStats } from './types';

// Shallow compare of the stats payload, ignoring nothing — every field is meaningful.
// reloadProgress is quantized to 0.01 steps by the caller so micro-float churn doesn't spam.
export function statsChanged(a: PlayerStats | null, b: PlayerStats): boolean {
  if (!a) return true;
  return (
    a.hp !== b.hp || a.maxHp !== b.maxHp || a.ammo !== b.ammo ||
    a.reserveAmmo !== b.reserveAmmo || a.isReloading !== b.isReloading ||
    a.reloadProgress !== b.reloadProgress || a.isAds !== b.isAds ||
    a.score !== b.score || a.kills !== b.kills || a.deaths !== b.deaths ||
    a.streak !== b.streak || a.highestStreak !== b.highestStreak ||
    a.headshots !== b.headshots || a.shotsFired !== b.shotsFired ||
    a.shotsHit !== b.shotsHit || a.speed !== b.speed ||
    a.isSliding !== b.isSliding || a.isGrounded !== b.isGrounded
  );
}

export interface LastMinimap { x: number; z: number; angle: number }

// Canonical wrap of an angle into [-π, π], robust against extra full wraps.
export function wrapAngle(angle: number): number {
  return ((angle + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
}

// Quantized compare: skip if player moved < 0.05u and angle changed < 0.01 rad
export function minimapChanged(last: LastMinimap | null, x: number, z: number, angle: number): boolean {
  if (!last) return true;
  const dx = last.x - x, dz = last.z - z;
  const da = Math.abs(wrapAngle(last.angle - angle));
  return dx * dx + dz * dz > 0.0025 || Math.abs(da) > 0.01;
}
