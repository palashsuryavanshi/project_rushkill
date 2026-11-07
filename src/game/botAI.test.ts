import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isLineOfSightClear,
  isPointInVisionCone,
  calculateReactionDelay,
  normalizeAngleDiff,
  pickBotWeaponId,
  DIFFICULTY_SETTINGS,
} from './botAI';
import type { BotPersonality } from './botAI';
import { RUSH_WEAPONS } from './weapons';
import { BoxCollider } from './mapHijacked';

test('every bot personality picks a weapon that still exists', () => {
  const personalities: BotPersonality[] = ['assault', 'sniper', 'defender', 'flanker', 'support', 'balanced'];
  const ids = new Set(RUSH_WEAPONS.map((w) => w.id));

  for (const personality of personalities) {
    for (const index of [0, 1]) {
      const id = pickBotWeaponId(personality, index);
      assert.ok(ids.has(id), `${personality} picked missing weapon ${id}`);
    }
  }
});

test('isLineOfSightClear returns true when no obstacles intersect ray', () => {
  const from = { x: 0, y: 1.6, z: -20 };
  const to = { x: 0, y: 1.6, z: 20 };
  const colliders: BoxCollider[] = [];

  const clear = isLineOfSightClear(from, to, colliders);
  assert.equal(clear, true);
});

test('isLineOfSightClear returns false when wall collider blocks direct ray', () => {
  const from = { x: 0, y: 1.6, z: -20 };
  const to = { x: 0, y: 1.6, z: 20 };
  // Solid cabin wall at Z = 0
  const colliders: BoxCollider[] = [
    {
      min: { x: -10, y: 0, z: -0.5 } as any,
      max: { x: 10, y: 5.0, z: 0.5 } as any,
    },
  ];

  const clear = isLineOfSightClear(from, to, colliders);
  assert.equal(clear, false);
});

test('isLineOfSightClear returns true when obstacle is off to the side', () => {
  const from = { x: 0, y: 1.6, z: -20 };
  const to = { x: 0, y: 1.6, z: 20 };
  // Crate at X = 15 (ray is along X = 0)
  const colliders: BoxCollider[] = [
    {
      min: { x: 14, y: 0, z: -2 } as any,
      max: { x: 18, y: 3, z: 2 } as any,
    },
  ];

  const clear = isLineOfSightClear(from, to, colliders);
  assert.equal(clear, true);
});

test('isPointInVisionCone identifies targets in front vs behind back', () => {
  const from = { x: 0, z: 0 };
  // Facing towards +Z (yaw = 0)
  const yaw = 0;
  const fovDeg = 90;

  // Point in front at (0, 10)
  assert.equal(isPointInVisionCone(from, yaw, { x: 0, z: 10 }, fovDeg), true);

  // Point behind at (0, -10)
  assert.equal(isPointInVisionCone(from, yaw, { x: 0, z: -10 }, fovDeg), false);

  // Point at 30 degrees angle (in FOV)
  assert.equal(isPointInVisionCone(from, yaw, { x: 3, z: 10 }, fovDeg), true);

  // Point at 80 degrees angle (outside 90 deg cone, which is +/- 45 deg)
  assert.equal(isPointInVisionCone(from, yaw, { x: 15, z: 2 }, fovDeg), false);
});

test('calculateReactionDelay scales properly across difficulty levels', () => {
  const recruitAvg =
    (DIFFICULTY_SETTINGS.recruit.reactionDelayRange[0] + DIFFICULTY_SETTINGS.recruit.reactionDelayRange[1]) / 2;
  const eliteAvg =
    (DIFFICULTY_SETTINGS.elite.reactionDelayRange[0] + DIFFICULTY_SETTINGS.elite.reactionDelayRange[1]) / 2;

  assert.ok(recruitAvg > eliteAvg * 2.5, 'Recruit reaction should be significantly slower than Elite');

  // Test calculateReactionDelay
  const eliteDelay = calculateReactionDelay('elite', 'assault', 15);
  const recruitDelay = calculateReactionDelay('recruit', 'defender', 15);

  assert.ok(eliteDelay < recruitDelay, 'Elite assault reaction delay must be faster than recruit defender');
});

test('normalizeAngleDiff handles shortest rotational arc', () => {
  // Small positive diff
  assert.ok(Math.abs(normalizeAngleDiff(0.2, 0.1) - 0.1) < 0.0001);

  // Wrapping across boundary (-PI to +PI)
  const diffWrap = normalizeAngleDiff(Math.PI - 0.1, -Math.PI + 0.1);
  assert.ok(Math.abs(diffWrap) < 0.3, 'Should take short arc across boundary');
});
