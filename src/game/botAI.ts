import * as THREE from 'three';
import { WeaponDef, BotDifficulty } from './types';
import { RUSH_WEAPONS, getWeaponById, calculateShotDamage } from './weapons';
import { WaypointNode, BoxCollider } from './mapHijacked';
import { sound } from './audio';

export type BotPersonality = 'assault' | 'sniper' | 'defender' | 'flanker' | 'support' | 'balanced';

export type AwarenessState = 'unaware' | 'suspicious' | 'alert' | 'engaged' | 'searching' | 'recovering';

export interface TargetEntity {
  id: string;
  isPlayer: boolean;
  pos: THREE.Vector3;
  hp: number;
}

export interface BotState {
  id: string;
  name: string;
  personality: BotPersonality;
  difficulty: BotDifficulty;
  awareness: AwarenessState;
  weapon: WeaponDef;
  mesh: THREE.Group;
  headMesh: THREE.Mesh;
  bodyMesh: THREE.Mesh;
  gunMesh: THREE.Group;
  healthBarMesh: THREE.Mesh;
  awarenessBadge: THREE.Sprite;
  nameSprite: THREE.Sprite;
  pos: THREE.Vector3;
  velocity: THREE.Vector3;
  yaw: number;
  targetYaw: number;
  currentWaypointId: string;
  hp: number;
  maxHp: number;
  ammo: number;
  isReloading: boolean;
  reloadTimer: number;
  isDead: boolean;
  respawnTimer: number;
  spawnGraceTimer: number; // 2.0s on spawn: no instant shooting/locking
  fireCooldown: number;
  burstShotsRemaining: number;
  burstPauseTimer: number;
  reactionTimer: number;
  currentReactionDelay: number;
  currentTargetId: string | null;
  lastKnownPosition: THREE.Vector3 | null;
  searchTimer: number;
  suspiciousTimer: number;
  suspiciousPos: THREE.Vector3 | null;
  hitFlashTimer: number;
  animTime: number;
  kills: number;
  deaths: number;
  score: number;
  strafeDir: number;
  strafeTimer: number;
  // Ragdoll cubes on death
  debrisGroup: THREE.Group;
  debrisPieces: { mesh: THREE.Mesh; vel: THREE.Vector3; rotVel: THREE.Vector3 }[];
}

const BOT_NAMES = [
  'Ghost_Ops',
  'Soap_Mac',
  'Price_Bravo',
  'Gaz_Air',
  'Roach_141',
  'Vargas_Tac',
  'Farah_K',
  'Nikolai_Pilot',
  'Simon_R',
  'Garrick_K',
];

// Difficulty parameters
export const DIFFICULTY_SETTINGS: Record<
  BotDifficulty,
  {
    reactionDelayRange: [number, number]; // seconds before firing on spotted target
    aimInaccuracyRad: number; // base angular spread error
    turnSpeedRadPerSec: number; // max angular turn rate
    visionRange: number; // max spotting distance
    hearingRangeGunfire: number;
    hearingRangeFootsteps: number;
    visionFovDeg: number; // FOV angle in degrees
    coverSeekingChance: number; // chance to seek cover when low HP or reloading
  }
> = {
  recruit: {
    reactionDelayRange: [0.55, 0.78],
    aimInaccuracyRad: 0.11,
    turnSpeedRadPerSec: 3.5,
    visionRange: 36,
    hearingRangeGunfire: 30,
    hearingRangeFootsteps: 8,
    visionFovDeg: 95,
    coverSeekingChance: 0.25,
  },
  regular: {
    reactionDelayRange: [0.35, 0.50],
    aimInaccuracyRad: 0.055,
    turnSpeedRadPerSec: 5.5,
    visionRange: 50,
    hearingRangeGunfire: 45,
    hearingRangeFootsteps: 12,
    visionFovDeg: 110,
    coverSeekingChance: 0.6,
  },
  veteran: {
    reactionDelayRange: [0.22, 0.32],
    aimInaccuracyRad: 0.028,
    turnSpeedRadPerSec: 8.5,
    visionRange: 65,
    hearingRangeGunfire: 55,
    hearingRangeFootsteps: 16,
    visionFovDeg: 125,
    coverSeekingChance: 0.85,
  },
  elite: {
    reactionDelayRange: [0.12, 0.22],
    aimInaccuracyRad: 0.014,
    turnSpeedRadPerSec: 12.0,
    visionRange: 75,
    hearingRangeGunfire: 65,
    hearingRangeFootsteps: 20,
    visionFovDeg: 140,
    coverSeekingChance: 0.95,
  },
};

// ==========================================
// PURE COLLISION & RAYCAST FUNCTIONS (UNIT TESTABLE)
// ==========================================

/**
 * Checks if line of sight between two 3D points is unblocked by any box colliders.
 * Uses slab ray-AABB intersection algorithm.
 */
export function isLineOfSightClear(
  from: { x: number; y: number; z: number },
  to: { x: number; y: number; z: number },
  colliders: BoxCollider[],
  skipThinFloors = true
): boolean {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dz = to.z - from.z;
  const distSq = dx * dx + dy * dy + dz * dz;
  if (distSq < 0.0001) return true;

  const invX = dx !== 0 ? 1 / dx : 1e9;
  const invY = dy !== 0 ? 1 / dy : 1e9;
  const invZ = dz !== 0 ? 1 / dz : 1e9;

  for (let i = 0; i < colliders.length; i++) {
    const c = colliders[i];
    const height = c.max.y - c.min.y;
    // Skip very thin horizontal floors/surfaces when shooting horizontally
    if (skipThinFloors && height < 0.45 && Math.abs(dy) < 0.5) {
      continue;
    }

    const t1x = (c.min.x - from.x) * invX;
    const t2x = (c.max.x - from.x) * invX;
    let tmin = Math.min(t1x, t2x);
    let tmax = Math.max(t1x, t2x);

    const t1y = (c.min.y - from.y) * invY;
    const t2y = (c.max.y - from.y) * invY;
    tmin = Math.max(tmin, Math.min(t1y, t2y));
    tmax = Math.min(tmax, Math.max(t1y, t2y));

    const t1z = (c.min.z - from.z) * invZ;
    const t2z = (c.max.z - from.z) * invZ;
    tmin = Math.max(tmin, Math.min(t1z, t2z));
    tmax = Math.min(tmax, Math.max(t1z, t2z));

    // If intersection exists on the segment [0.03, 0.97]
    if (tmax >= tmin && tmax > 0.03 && tmin < 0.97) {
      return false; // Vision is occluded by obstacle
    }
  }

  return true;
}

/**
 * Checks if target position lies within the bot's horizontal field-of-view cone.
 */
export function isPointInVisionCone(
  from: { x: number; z: number },
  yaw: number,
  to: { x: number; z: number },
  fovDeg: number
): boolean {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const distSq = dx * dx + dz * dz;
  if (distSq < 0.01) return true; // Direct touch

  // Forward vector calculated from yaw: (Math.sin(yaw), Math.cos(yaw))
  const fwdX = Math.sin(yaw);
  const fwdZ = Math.cos(yaw);

  const len = Math.sqrt(distSq);
  const dirX = dx / len;
  const dirZ = dz / len;

  const dot = fwdX * dirX + fwdZ * dirZ;
  const threshold = Math.cos((fovDeg * 0.5 * Math.PI) / 180);

  return dot >= threshold;
}

/**
 * Calculates reaction delay based on difficulty and personality.
 */
export function calculateReactionDelay(
  difficulty: BotDifficulty,
  personality: BotPersonality,
  distToTarget: number
): number {
  const range = DIFFICULTY_SETTINGS[difficulty].reactionDelayRange;
  let delay = range[0] + Math.random() * (range[1] - range[0]);

  // Personality adjustments
  if (personality === 'assault') delay *= 0.85; // Faster aggressive trigger
  if (personality === 'sniper') delay *= 0.9; // Focused long-range reflex
  if (personality === 'defender') delay *= 1.05; // Evaluates before engaging

  // Further targets take slightly longer to identify
  if (distToTarget > 35) {
    delay += 0.08;
  }

  return delay;
}

/**
 * Shortest angular distance between two radian angles.
 */
export function normalizeAngleDiff(target: number, current: number): number {
  let diff = (target - current) % (Math.PI * 2);
  if (diff > Math.PI) diff -= Math.PI * 2;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return diff;
}

// ==========================================
// BOT CREATION & FACTORY
// ==========================================

export function createBot(
  id: string,
  index: number,
  personality: BotPersonality,
  difficulty: BotDifficulty,
  startPos: THREE.Vector3,
  waypoints: WaypointNode[]
): BotState {
  const root = new THREE.Group();
  root.position.copy(startPos);

  let weaponId = 'mcw';
  let skinColor = 0x3b82f6; // tactical blue

  switch (personality) {
    case 'assault':
      weaponId = index % 2 === 0 ? 'rival_9' : 'mtz_556';
      skinColor = 0xef4444; // red
      break;
    case 'sniper':
      weaponId = index % 2 === 0 ? 'longbow' : 'kv_inhibitor';
      skinColor = 0x8b5cf6; // purple
      break;
    case 'defender':
      weaponId = 'holger_556';
      skinColor = 0x10b981; // emerald
      break;
    case 'flanker':
      weaponId = index % 2 === 0 ? 'striker' : 'lockwood_680';
      skinColor = 0xf59e0b; // amber
      break;
    case 'support':
      weaponId = 'amr9';
      skinColor = 0x06b6d4; // cyan
      break;
    case 'balanced':
    default:
      weaponId = 'mcw';
      skinColor = 0x3b82f6; // blue
      break;
  }

  const weapon = getWeaponById(weaponId);

  // Character Geometry
  // Torso
  const bodyGeo = new THREE.BoxGeometry(0.8, 1.0, 0.45);
  const bodyMat = new THREE.MeshStandardMaterial({
    color: skinColor,
    roughness: 0.5,
    metalness: 0.2,
  });
  const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
  bodyMesh.position.set(0, 1.1, 0);
  bodyMesh.castShadow = true;
  root.add(bodyMesh);

  // Head (Headshot Hitbox)
  const headGeo = new THREE.BoxGeometry(0.55, 0.55, 0.55);
  const headMat = new THREE.MeshStandardMaterial({
    color: 0xdeb887,
    roughness: 0.6,
  });
  const headMesh = new THREE.Mesh(headGeo, headMat);
  headMesh.position.set(0, 1.85, 0);
  headMesh.castShadow = true;
  root.add(headMesh);

  // Visor
  const visorGeo = new THREE.BoxGeometry(0.58, 0.14, 0.58);
  const visorMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
  const visor = new THREE.Mesh(visorGeo, visorMat);
  visor.position.set(0, 1.9, 0);
  root.add(visor);

  // Limbs
  const limbMat = new THREE.MeshStandardMaterial({ color: 0x22252a, roughness: 0.7 });
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.7, 0.3), limbMat);
  legL.position.set(-0.25, 0.35, 0);
  root.add(legL);

  const legR = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.7, 0.3), limbMat);
  legR.position.set(0.25, 0.35, 0);
  root.add(legR);

  // Held Weapon
  const gunGroup = new THREE.Group();
  const botGunGeo = new THREE.BoxGeometry(0.12, 0.16, 0.85);
  const botGunMat = new THREE.MeshStandardMaterial({ color: 0x1f2228, metalness: 0.7, roughness: 0.3 });
  const botGun = new THREE.Mesh(botGunGeo, botGunMat);
  botGun.position.set(0.35, 1.1, -0.4);
  gunGroup.add(botGun);
  root.add(gunGroup);

  // Overhead 3D Health Bar
  const hbGeo = new THREE.PlaneGeometry(1.0, 0.12);
  const hbMat = new THREE.MeshBasicMaterial({ color: 0x22c55e, side: THREE.DoubleSide });
  const healthBarMesh = new THREE.Mesh(hbGeo, hbMat);
  healthBarMesh.position.set(0, 2.35, 0);
  root.add(healthBarMesh);

  // Awareness Badge (Shows ?, !, or shield icon for tactical AI feel)
  const badgeCanvas = document.createElement('canvas');
  badgeCanvas.width = 64;
  badgeCanvas.height = 64;
  const badgeTexture = new THREE.CanvasTexture(badgeCanvas);
  const badgeSpriteMat = new THREE.SpriteMaterial({ map: badgeTexture, transparent: true });
  const awarenessBadge = new THREE.Sprite(badgeSpriteMat);
  awarenessBadge.scale.set(0.4, 0.4, 1);
  awarenessBadge.position.set(0, 2.7, 0);
  awarenessBadge.visible = false;
  root.add(awarenessBadge);

  // Nameplate Sprite
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
  ctx.roundRect(4, 4, 248, 56, 12);
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.font = 'bold 22px monospace';
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const botName = BOT_NAMES[index % BOT_NAMES.length];
  ctx.fillText(botName, 128, 32);

  const nameTexture = new THREE.CanvasTexture(canvas);
  const nameSpriteMat = new THREE.SpriteMaterial({ map: nameTexture });
  const nameSprite = new THREE.Sprite(nameSpriteMat);
  nameSprite.scale.set(1.5, 0.375, 1);
  nameSprite.position.set(0, 2.95, 0);
  root.add(nameSprite);

  // Death Debris Group
  const debrisGroup = new THREE.Group();
  debrisGroup.visible = false;
  const debrisPieces: { mesh: THREE.Mesh; vel: THREE.Vector3; rotVel: THREE.Vector3 }[] = [];
  for (let i = 0; i < 8; i++) {
    const cubeGeo = new THREE.BoxGeometry(0.25, 0.25, 0.25);
    const cubeMat = new THREE.MeshStandardMaterial({
      color: i % 2 === 0 ? skinColor : 0x22252a,
      roughness: 0.5,
    });
    const cubeMesh = new THREE.Mesh(cubeGeo, cubeMat);
    debrisGroup.add(cubeMesh);
    debrisPieces.push({
      mesh: cubeMesh,
      vel: new THREE.Vector3(),
      rotVel: new THREE.Vector3(),
    });
  }
  root.add(debrisGroup);

  // Nearest starting waypoint
  let closestWp = waypoints[0]?.id || '';
  let minDist = Infinity;
  for (const wp of waypoints) {
    const dist = wp.pos.distanceTo(startPos);
    if (dist < minDist) {
      minDist = dist;
      closestWp = wp.id;
    }
  }

  return {
    id,
    name: botName,
    personality,
    difficulty,
    awareness: 'unaware',
    weapon,
    mesh: root,
    headMesh,
    bodyMesh,
    gunMesh: gunGroup,
    healthBarMesh,
    awarenessBadge,
    nameSprite,
    pos: startPos.clone(),
    velocity: new THREE.Vector3(),
    yaw: 0,
    targetYaw: 0,
    currentWaypointId: closestWp,
    hp: 100,
    maxHp: 100,
    ammo: weapon.magSize,
    isReloading: false,
    reloadTimer: 0,
    isDead: false,
    respawnTimer: 0,
    spawnGraceTimer: 2.0, // 2-second grace period! Bot will not shoot or lock on immediately
    fireCooldown: 1.5,
    burstShotsRemaining: 0,
    burstPauseTimer: 0,
    reactionTimer: 0,
    currentReactionDelay: 0.4,
    currentTargetId: null,
    lastKnownPosition: null,
    searchTimer: 0,
    suspiciousTimer: 0,
    suspiciousPos: null,
    hitFlashTimer: 0,
    animTime: Math.random() * 10,
    kills: 0,
    deaths: 0,
    score: 0,
    strafeDir: Math.random() > 0.5 ? 1 : -1,
    strafeTimer: 0.5 + Math.random() * 0.8,
    debrisGroup,
    debrisPieces,
  };
}

// ==========================================
// AWARENESS BADGE SPRITE RENDERER
// ==========================================
function updateAwarenessBadge(bot: BotState) {
  if (bot.spawnGraceTimer > 0) {
    bot.awarenessBadge.visible = false;
    return;
  }

  const canvas = (bot.awarenessBadge.material as THREE.SpriteMaterial).map!.image as HTMLCanvasElement;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, 64, 64);

  if (bot.awareness === 'alert') {
    bot.awarenessBadge.visible = true;
    ctx.fillStyle = '#f59e0b'; // Amber '?'
    ctx.font = 'bold 44px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('?', 32, 32);
    (bot.awarenessBadge.material as THREE.SpriteMaterial).map!.needsUpdate = true;
  } else if (bot.awareness === 'engaged') {
    bot.awarenessBadge.visible = true;
    ctx.fillStyle = '#ef4444'; // Red '!'
    ctx.font = 'bold 46px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('!', 32, 32);
    (bot.awarenessBadge.material as THREE.SpriteMaterial).map!.needsUpdate = true;
  } else if (bot.awareness === 'searching') {
    bot.awarenessBadge.visible = true;
    ctx.fillStyle = '#38bdf8'; // Sky '🔍' or '...'
    ctx.font = 'bold 36px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('...', 32, 32);
    (bot.awarenessBadge.material as THREE.SpriteMaterial).map!.needsUpdate = true;
  } else {
    bot.awarenessBadge.visible = false;
  }
}

// ==========================================
// ADVANCED MAIN BOT UPDATE TICK
// ==========================================

export function updateBotAI(
  bot: BotState,
  dt: number,
  time: number,
  potentialTargets: TargetEntity[],
  waypoints: WaypointNode[],
  colliders: BoxCollider[],
  onBotShoot: (bot: BotState, aimDir: THREE.Vector3, targetId: string) => void
) {
  // 1. Handle Death / Respawn State
  if (bot.isDead) {
    bot.respawnTimer -= dt;
    if (bot.debrisGroup.visible) {
      bot.debrisPieces.forEach((p) => {
        p.vel.y -= 9.8 * dt;
        p.mesh.position.addScaledVector(p.vel, dt);
        p.mesh.rotation.x += p.rotVel.x * dt;
        p.mesh.rotation.y += p.rotVel.y * dt;
        if (p.mesh.position.y < -0.3) {
          p.mesh.position.y = -0.3;
          p.vel.set(0, 0, 0);
        }
      });
    }

    if (bot.respawnTimer <= 0) {
      // Respawn bot safely
      bot.isDead = false;
      bot.hp = bot.maxHp;
      bot.ammo = bot.weapon.magSize;
      bot.isReloading = false;
      bot.awareness = 'unaware';
      bot.currentTargetId = null;
      bot.lastKnownPosition = null;
      bot.spawnGraceTimer = 2.0; // 2.0 second spawn grace period!
      bot.fireCooldown = 1.0;

      bot.mesh.visible = true;
      bot.bodyMesh.visible = true;
      bot.headMesh.visible = true;
      bot.gunMesh.visible = true;
      bot.healthBarMesh.visible = true;
      bot.nameSprite.visible = true;
      bot.debrisGroup.visible = false;

      // Pick random waypoint away from players
      const validTargets = potentialTargets.filter((t) => t.hp > 0);
      const chosenWp =
        waypoints.find((w) => {
          return validTargets.every((t) => w.pos.distanceTo(t.pos) > 24);
        }) || waypoints[Math.floor(Math.random() * waypoints.length)];

      bot.pos.copy(chosenWp.pos);
      bot.currentWaypointId = chosenWp.id;
      bot.mesh.position.copy(bot.pos);
      bot.yaw = Math.random() * Math.PI * 2;
      bot.targetYaw = bot.yaw;
    }
    return;
  }

  // 2. Spawn Grace Timer Countdown
  if (bot.spawnGraceTimer > 0) {
    bot.spawnGraceTimer -= dt;
  }

  // 3. Hit Flash Decay
  if (bot.hitFlashTimer > 0) {
    bot.hitFlashTimer -= dt;
    if (bot.hitFlashTimer <= 0) {
      (bot.bodyMesh.material as THREE.MeshStandardMaterial).emissive.setHex(0x000000);
      (bot.headMesh.material as THREE.MeshStandardMaterial).emissive.setHex(0x000000);
    }
  }

  // 4. Update Health Bar
  const hpPct = Math.max(0, bot.hp / bot.maxHp);
  bot.healthBarMesh.scale.x = hpPct;
  bot.healthBarMesh.position.x = -(1 - hpPct) * 0.5;
  if (hpPct > 0.5) {
    (bot.healthBarMesh.material as THREE.MeshBasicMaterial).color.setHex(0x22c55e);
  } else if (hpPct > 0.25) {
    (bot.healthBarMesh.material as THREE.MeshBasicMaterial).color.setHex(0xeab308);
  } else {
    (bot.healthBarMesh.material as THREE.MeshBasicMaterial).color.setHex(0xef4444);
  }

  // 5. Weapon Reloading State
  if (bot.isReloading) {
    bot.reloadTimer -= dt;
    if (bot.reloadTimer <= 0) {
      bot.isReloading = false;
      bot.ammo = bot.weapon.magSize;
    }
  }

  // 6. PERCEPTION & TARGET SELECTION SYSTEM
  const diffCfg = DIFFICULTY_SETTINGS[bot.difficulty];
  let visibleTarget: TargetEntity | null = null;
  let closestVisibleDist = Infinity;

  // Eye height for raycasts
  const eyePos = { x: bot.pos.x, y: bot.pos.y + 1.6, z: bot.pos.z };

  if (bot.spawnGraceTimer <= 0) {
    for (const target of potentialTargets) {
      if (target.id === bot.id || target.hp <= 0) continue;

      const targetPos = target.pos;
      const dist = bot.pos.distanceTo(targetPos);

      // Vision range check
      if (dist > diffCfg.visionRange) continue;

      // Vision cone check (FOV angle)
      const inFov = isPointInVisionCone(
        { x: bot.pos.x, z: bot.pos.z },
        bot.yaw,
        { x: targetPos.x, z: targetPos.z },
        diffCfg.visionFovDeg
      );

      // Even if behind, bot can hear very close footsteps (< hearingRangeFootsteps)
      const isHeard = dist < diffCfg.hearingRangeFootsteps;

      if (!inFov && !isHeard) continue;

      // Target eye level
      const targetEye = { x: targetPos.x, y: targetPos.y + 1.5, z: targetPos.z };

      // Line of sight raycast against colliders!
      const hasLos = isLineOfSightClear(eyePos, targetEye, colliders);

      if (hasLos) {
        if (dist < closestVisibleDist) {
          closestVisibleDist = dist;
          visibleTarget = target;
        }
      }
    }
  }

  // State Transitions
  if (visibleTarget) {
    // We have clear visual contact with an enemy!
    bot.lastKnownPosition = visibleTarget.pos.clone();
    bot.currentTargetId = visibleTarget.id;

    if (bot.awareness === 'unaware' || bot.awareness === 'suspicious') {
      // Transition to ALERT (calculates reaction delay)
      bot.awareness = 'alert';
      bot.currentReactionDelay = calculateReactionDelay(bot.difficulty, bot.personality, closestVisibleDist);
      bot.reactionTimer = bot.currentReactionDelay;
    } else if (bot.awareness === 'alert') {
      // Reaction delay counting down
      bot.reactionTimer -= dt;
      if (bot.reactionTimer <= 0) {
        bot.awareness = 'engaged';
      }
    } else if (bot.awareness === 'searching' || bot.awareness === 'recovering') {
      // Re-acquired target while searching
      bot.awareness = 'engaged';
    }
  } else {
    // Target is NOT currently visible
    if (bot.awareness === 'engaged' || bot.awareness === 'alert') {
      // Lost sight! Transition to SEARCHING last known position
      bot.awareness = 'searching';
      bot.searchTimer = 3.5; // Investigate LKP for 3.5 seconds
    } else if (bot.awareness === 'searching') {
      bot.searchTimer -= dt;
      if (bot.searchTimer <= 0) {
        // Abandon search, resume regular patrol
        bot.awareness = 'unaware';
        bot.currentTargetId = null;
        bot.lastKnownPosition = null;
      }
    }
  }

  // Low HP check -> Recovering / Cover Seeking
  if (bot.hp < 30 && bot.awareness !== 'recovering' && Math.random() < diffCfg.coverSeekingChance * dt) {
    bot.awareness = 'recovering';
  }

  // Badge icon
  updateAwarenessBadge(bot);

  // 7. TACTICAL MOVEMENT & PATHFINDING
  const wp = waypoints.find((w) => w.id === bot.currentWaypointId) || waypoints[0];
  let moveTarget = wp.pos.clone();
  let moveSpeed = 6.0;

  // Personality & Awareness Speed & Target Selection
  switch (bot.awareness) {
    case 'engaged': {
      if (visibleTarget) {
        const dist = bot.pos.distanceTo(visibleTarget.pos);

        // Movement strategy depends on personality
        if (bot.personality === 'sniper') {
          moveSpeed = 4.0;
          if (dist < 22) {
            // Sniper creates distance
            const awayDir = new THREE.Vector3().subVectors(bot.pos, visibleTarget.pos).normalize();
            moveTarget = bot.pos.clone().addScaledVector(awayDir, 10);
          } else {
            moveTarget = bot.pos; // Hold ground and aim
          }
        } else if (bot.personality === 'assault') {
          moveSpeed = 8.2; // Sprint push
          if (dist > 14) {
            moveTarget = visibleTarget.pos;
          }
        } else if (bot.personality === 'defender') {
          moveSpeed = 5.5;
          // Stays near defensive post
          moveTarget = wp.pos;
        } else if (bot.personality === 'flanker') {
          moveSpeed = 7.5;
          // Tries to circle around
          const flankVec = new THREE.Vector3(-(visibleTarget.pos.z - bot.pos.z), 0, visibleTarget.pos.x - bot.pos.x).normalize();
          moveTarget = visibleTarget.pos.clone().addScaledVector(flankVec, 12);
        } else {
          // Balanced / Support
          moveSpeed = 6.5;
          if (dist > 20) moveTarget = visibleTarget.pos;
        }
      }
      break;
    }

    case 'searching': {
      moveSpeed = 6.5;
      if (bot.lastKnownPosition) {
        moveTarget = bot.lastKnownPosition;
      }
      break;
    }

    case 'recovering': {
      moveSpeed = 7.5;
      // Seek a waypoint that is away from threat and has cover
      const threatPos = bot.lastKnownPosition || (visibleTarget ? visibleTarget.pos : null);
      if (threatPos) {
        const coverWp = waypoints.find((w) => {
          const wDist = w.pos.distanceTo(threatPos);
          if (wDist < 15) return false;
          // Check if waypoint has broken LOS to threat
          return !isLineOfSightClear(
            { x: w.pos.x, y: w.pos.y + 1.2, z: w.pos.z },
            { x: threatPos.x, y: threatPos.y + 1.2, z: threatPos.z },
            colliders
          );
        });
        if (coverWp) {
          moveTarget = coverWp.pos;
          bot.currentWaypointId = coverWp.id;
        }
      }
      // Reload while in recovery
      if (bot.ammo < bot.weapon.magSize && !bot.isReloading) {
        bot.isReloading = true;
        bot.reloadTimer = bot.weapon.reloadTimeSec;
      }
      break;
    }

    case 'unaware':
    case 'suspicious':
    default: {
      moveSpeed = 5.2; // Normal patrol walk
      moveTarget = wp.pos;
      break;
    }
  }

  // Advance along waypoint network when near
  const toWp = new THREE.Vector3().subVectors(wp.pos, bot.pos);
  toWp.y = 0;
  if (toWp.length() < 2.0 && bot.awareness !== 'engaged') {
    if (wp.neighbors.length > 0) {
      // Pick next waypoint according to personality preference
      let nextId = wp.neighbors[Math.floor(Math.random() * wp.neighbors.length)];

      if (bot.personality === 'sniper') {
        const upperWp = wp.neighbors.find((n) => n.startsWith('upper') || n === 'bow_heli');
        if (upperWp) nextId = upperWp;
      } else if (bot.personality === 'flanker') {
        const flankWp = wp.neighbors.find((n) => n.startsWith('tunnel') || n.startsWith('port') || n.startsWith('star'));
        if (flankWp) nextId = flankWp;
      }

      bot.currentWaypointId = nextId;
    }
  }

  // Calculate horizontal velocity towards moveTarget
  const toTarget = new THREE.Vector3().subVectors(moveTarget, bot.pos);
  toTarget.y = 0;
  const distToTarget = toTarget.length();

  // Strafe mechanic while engaged (human-like combat strafing)
  bot.strafeTimer -= dt;
  if (bot.strafeTimer <= 0) {
    bot.strafeDir *= -1;
    bot.strafeTimer = 0.4 + Math.random() * 0.7;
  }

  if (distToTarget > 0.3) {
    toTarget.normalize();
    bot.velocity.copy(toTarget).multiplyScalar(moveSpeed);

    if (bot.awareness === 'engaged') {
      // Add tactical lateral strafing
      const strafeVec = new THREE.Vector3(-toTarget.z, 0, toTarget.x).multiplyScalar(
        bot.strafeDir * 2.2 * (bot.difficulty === 'elite' ? 1.4 : 1.0)
      );
      bot.velocity.add(strafeVec);
    }

    bot.pos.addScaledVector(bot.velocity, dt);
  } else {
    bot.velocity.set(0, 0, 0);
  }

  // 8. HUMAN-LIKE SMOOTH ROTATION & AIMING (NO INSTANT SNAPPING!)
  let desiredYaw = bot.yaw;

  if (visibleTarget && (bot.awareness === 'engaged' || bot.awareness === 'alert')) {
    // Face the visible enemy
    const lookVec = new THREE.Vector3().subVectors(visibleTarget.pos, bot.pos);
    lookVec.y = 0;
    if (lookVec.lengthSq() > 0.01) {
      desiredYaw = Math.atan2(lookVec.x, lookVec.z);
    }
  } else if (bot.awareness === 'searching' && bot.lastKnownPosition) {
    // Face last known position
    const lookVec = new THREE.Vector3().subVectors(bot.lastKnownPosition, bot.pos);
    lookVec.y = 0;
    if (lookVec.lengthSq() > 0.01) {
      desiredYaw = Math.atan2(lookVec.x, lookVec.z);
    }
  } else if (bot.velocity.lengthSq() > 0.1) {
    // Face movement direction
    desiredYaw = Math.atan2(bot.velocity.x, bot.velocity.z);
  }

  bot.targetYaw = desiredYaw;

  // Smooth angular interpolation clamped by max turn speed
  const angleDiff = normalizeAngleDiff(bot.targetYaw, bot.yaw);
  const maxTurnStep = diffCfg.turnSpeedRadPerSec * dt;
  const turnStep = Math.max(-maxTurnStep, Math.min(maxTurnStep, angleDiff));
  bot.yaw += turnStep;
  bot.mesh.rotation.y = bot.yaw;
  bot.mesh.position.copy(bot.pos);

  // 9. WEAPON FIRING & BURST LOGIC
  // Bots only fire when:
  // - Spawn grace period has ended
  // - Bot is not dead
  // - Bot is in 'engaged' state (reaction delay confirmed)
  // - Has a visible target with clear LOS
  // - Weapon is not reloading
  // - Within aim tolerance (bot must be facing roughly towards target)
  if (
    bot.spawnGraceTimer <= 0 &&
    bot.awareness === 'engaged' &&
    visibleTarget &&
    !bot.isReloading &&
    !bot.isDead
  ) {
    const toEnemy = new THREE.Vector3().subVectors(visibleTarget.pos, bot.pos);
    toEnemy.y = 0;
    const enemyAngle = Math.atan2(toEnemy.x, toEnemy.z);
    const aimAlignment = Math.abs(normalizeAngleDiff(enemyAngle, bot.yaw));

    // Can only pull trigger if facing within ~25 degrees of target
    if (aimAlignment < 0.45) {
      bot.fireCooldown -= dt;

      // Handle burst firing
      if (bot.burstPauseTimer > 0) {
        bot.burstPauseTimer -= dt;
      } else if (bot.fireCooldown <= 0) {
        // Execute shot
        if (bot.ammo <= 0) {
          // Trigger reload
          bot.isReloading = true;
          bot.reloadTimer = bot.weapon.reloadTimeSec;
          return;
        }

        bot.ammo--;

        // Setup weapon-specific burst cycle
        if (bot.burstShotsRemaining <= 0) {
          if (bot.weapon.category === 'AR') {
            bot.burstShotsRemaining = 3 + Math.floor(Math.random() * 2); // 3-4 round burst
          } else if (bot.weapon.category === 'SMG') {
            bot.burstShotsRemaining = 4 + Math.floor(Math.random() * 3); // 4-6 round burst
          } else {
            bot.burstShotsRemaining = 1; // Shotgun / Sniper
          }
        }

        bot.burstShotsRemaining--;

        if (bot.burstShotsRemaining <= 0) {
          // Pause between bursts
          bot.burstPauseTimer = bot.weapon.category === 'Sniper' ? 1.4 : 0.35 + Math.random() * 0.25;
        }

        // Fire rate interval
        const baseInterval = 60 / bot.weapon.fireRateRpm;
        bot.fireCooldown = baseInterval;

        // Calculate aim vector with human-like inaccuracy
        const aimDir = new THREE.Vector3().subVectors(visibleTarget.pos, bot.pos);
        aimDir.y += 1.3; // Aim at chest height
        aimDir.normalize();

        const inaccuracy = diffCfg.aimInaccuracyRad;
        aimDir.x += (Math.random() - 0.5) * inaccuracy;
        aimDir.y += (Math.random() - 0.5) * (inaccuracy * 0.7);
        aimDir.z += (Math.random() - 0.5) * inaccuracy;
        aimDir.normalize();

        onBotShoot(bot, aimDir, visibleTarget.id);
      }
    }
  }
}

// ==========================================
// BOT HIT DAMAGE & ELIMINATION
// ==========================================

export function triggerBotHit(
  bot: BotState,
  damage: number,
  isHeadshot: boolean,
  attackerId?: string
): boolean {
  if (bot.isDead) return false;

  bot.hp -= damage;
  bot.hitFlashTimer = 0.08;

  // Emissive damage flash
  const flashColor = isHeadshot ? 0xff0000 : 0xffffff;
  (bot.bodyMesh.material as THREE.MeshStandardMaterial).emissive.setHex(flashColor);
  (bot.headMesh.material as THREE.MeshStandardMaterial).emissive.setHex(flashColor);

  // If attacked from unseen direction, become alerted immediately
  if (bot.awareness === 'unaware' || bot.awareness === 'suspicious') {
    bot.awareness = 'alert';
    bot.currentReactionDelay = 0.15; // Fast reflex when taking hit
    bot.reactionTimer = 0.15;
  }

  if (bot.hp <= 0) {
    bot.isDead = true;
    bot.deaths++;
    bot.respawnTimer = 3.5;

    bot.bodyMesh.visible = false;
    bot.headMesh.visible = false;
    bot.gunMesh.visible = false;
    bot.healthBarMesh.visible = false;
    bot.awarenessBadge.visible = false;
    bot.nameSprite.visible = false;

    // Explode debris
    bot.debrisGroup.visible = true;
    bot.debrisPieces.forEach((p) => {
      p.mesh.position.set(
        (Math.random() - 0.5) * 0.5,
        1.0 + (Math.random() - 0.5) * 0.5,
        (Math.random() - 0.5) * 0.5
      );
      p.vel.set(
        (Math.random() - 0.5) * 6,
        3.0 + Math.random() * 4,
        (Math.random() - 0.5) * 6
      );
      p.rotVel.set(
        (Math.random() - 0.5) * 10,
        (Math.random() - 0.5) * 10,
        (Math.random() - 0.5) * 10
      );
    });

    return true; // Eliminated!
  }

  return false;
}
