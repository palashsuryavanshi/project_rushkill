import test from 'node:test';
import assert from 'node:assert/strict';
import { RUSH_WEAPONS } from './weapons';
import { buildGunModel, buildHands } from './gunModels';

test('all four live weapons build a complete rig', () => {
  assert.equal(RUSH_WEAPONS.length, 4);
  for (const weapon of RUSH_WEAPONS) {
    const rig = buildGunModel(weapon);
    assert.ok(rig.group.children.length >= 4, `${weapon.id} has too few parts`);
    assert.ok(rig.group.children.length <= 16, `${weapon.id} has too many parts`);
    for (const v of [rig.muzzlePos, rig.sightRear.position, rig.sightFront.position]) {
      assert.ok(Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z));
    }
    assert.ok(rig.sightRear.position.y > 0.02, `${weapon.id} rear sight is below the bore`);
    assert.ok(rig.sightRear.position.z > rig.sightFront.position.z, `${weapon.id} sight order`);
    assert.ok(rig.adsEyeRelief >= 0.05 && rig.adsEyeRelief <= 0.4);
  }
});

test('cycle kind matches the weapon class', () => {
  const kinds = Object.fromEntries(
    RUSH_WEAPONS.map((w) => [w.category, buildGunModel(w).cycle.kind])
  );
  assert.deepEqual(kinds, { AR: 'none', SMG: 'none', Shotgun: 'pump', Sniper: 'lever' });
});

test('hands build two wrist-pivoted groups', () => {
  const hands = buildHands();
  assert.ok(hands.left.isGroup);
  assert.ok(hands.right.isGroup);
  assert.ok(hands.left.children.length > 0);
  assert.ok(hands.right.children.length > 0);
});
