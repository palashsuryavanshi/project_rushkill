import * as THREE from 'three';

/**
 * Respawn rules shared by the engine and the HUD.
 *
 * The player and bots both take ten seconds to return. The spawn picker keeps
 * the player from materialising inside a live bot, which would otherwise turn
 * a respawn into an instant second death.
 */

export const PLAYER_RESPAWN_SECONDS = 10;
export const BOT_RESPAWN_SECONDS = 10;

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
