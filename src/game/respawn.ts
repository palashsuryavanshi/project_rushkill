import * as THREE from 'three';

/**
 * Respawn rules shared by the engine and the HUD.
 *
 * The player and bots both take ten seconds to return. The spawn picker keeps
 * the player from materialising inside a live bot, which would otherwise turn
 * a respawn into an instant second death.
 */

export const PLAYER_RESPAWN_SECONDS = 3;
export const BOT_RESPAWN_SECONDS = 10;

/**
 * Remaining share of the player respawn window, clamped to 0..1.
 * Used by the HUD to draw a draining bar instead of a numeric countdown.
 */
export function respawnProgress(remainingSec: number, totalSec = PLAYER_RESPAWN_SECONDS): number {
  if (totalSec <= 0) return 0;
  return Math.min(1, Math.max(0, remainingSec / totalSec));
}

export interface RespawnLoadout {
  ammo: number;
  isReloading: boolean;
  reloadTimer: number;
}

/** A fresh clip on respawn, with any in-progress reload cancelled. */
export function respawnLoadout(magSize: number): RespawnLoadout {
  return {
    ammo: Math.max(0, magSize),
    isReloading: false,
    reloadTimer: 0,
  };
}

export interface SpawnThreat {
  pos: THREE.Vector3;
}

/**
 * Pick the spawn point farthest from its nearest threat.
 * Returns the first spawn when there are no threats, and null for an empty map.
 */
export function pickSafestSpawn(
  spawnPoints: readonly THREE.Vector3[],
  threats: readonly SpawnThreat[]
): THREE.Vector3 | null {
  if (spawnPoints.length === 0) return null;
  if (threats.length === 0) return spawnPoints[0];

  let best = spawnPoints[0];
  let bestNearestDistSq = -Infinity;

  for (const spawn of spawnPoints) {
    let nearestDistSq = Infinity;
    for (const threat of threats) {
      nearestDistSq = Math.min(nearestDistSq, spawn.distanceToSquared(threat.pos));
    }
    if (nearestDistSq > bestNearestDistSq) {
      bestNearestDistSq = nearestDistSq;
      best = spawn;
    }
  }

  return best;
}
