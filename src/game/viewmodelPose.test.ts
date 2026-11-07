import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeAdsPosition,
  sampleReloadPose,
  sampleCyclePose,
  stepRecoil,
  RECOIL_PROFILES,
  ZERO_POSE,
} from './viewmodelPose';

const close = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) <= eps;

test('ADS places the rear sight on the camera axis', () => {
  for (const sight of [
    { x: 0, y: 0.09, z: -0.22 },
    { x: 0.01, y: 0.075, z: -0.18 },
    { x: 0, y: 0.11, z: -0.16 },
    { x: 0, y: 0.12, z: -0.25 },
  ]) {
    const eyeRelief = 0.3;
    const pos = computeAdsPosition(sight, eyeRelief);
    assert.ok(close(pos.x + sight.x, 0));
    assert.ok(close(pos.y + sight.y, 0));
    assert.ok(close(pos.z + sight.z, -eyeRelief));
  }
});

test('reload poses are zero at both ends and clamp out-of-range input', () => {
  for (const category of ['AR', 'SMG', 'Shotgun', 'Sniper'] as const) {
    assert.deepEqual(sampleReloadPose(0, category), ZERO_POSE);
    assert.deepEqual(sampleReloadPose(1, category), ZERO_POSE);
    assert.deepEqual(sampleReloadPose(-1, category), ZERO_POSE);
    assert.deepEqual(sampleReloadPose(2, category), ZERO_POSE);
    assert.deepEqual(sampleReloadPose(Number.NaN, category), ZERO_POSE);
  }
});

test('reloads move the expected parts mid-sequence', () => {
  const ar = sampleReloadPose(0.4, 'AR');
  assert.ok(ar.magazineDrop > 0.02, `magazineDrop ${ar.magazineDrop}`);
  assert.ok(Math.abs(ar.weaponRot.z) > 0.05, `tilt ${ar.weaponRot.z}`);

  const shotgun = sampleReloadPose(0.4, 'Shotgun');
  assert.ok(shotgun.magazineDrop === 0);
  assert.ok(Math.abs(shotgun.leftHandPos.y) > 0.01 || Math.abs(shotgun.leftHandPos.z) > 0.01);

  const sniper = sampleReloadPose(0.4, 'Sniper');
  assert.ok(sniper.leverAngle > 0.1, `leverAngle ${sniper.leverAngle}`);
});

test('cycle poses peak mid-animation and return to zero', () => {
  for (const kind of ['pump', 'lever'] as const) {
    const start = sampleCyclePose(0, kind);
    const mid = sampleCyclePose(0.5, kind);
    const end = sampleCyclePose(1, kind);
    assert.deepEqual(start, ZERO_POSE);
    assert.deepEqual(end, ZERO_POSE);
    assert.ok(
      kind === 'pump' ? mid.pumpBack > 0.02 : mid.leverAngle > 0.2,
      `${kind} did not move at mid`
    );
    assert.deepEqual(sampleCyclePose(-1, kind), ZERO_POSE);
    assert.deepEqual(sampleCyclePose(2, kind), ZERO_POSE);
  }
  assert.deepEqual(sampleCyclePose(0.5, 'none'), ZERO_POSE);
});

test('shotgun and sniper recoil settle inside their fire interval', () => {
  for (const category of ['Shotgun', 'Sniper'] as const) {
    const profile = RECOIL_PROFILES[category];
    let state = stepRecoil({ offset: 0, velocity: 0 }, profile, true, 1 / 60);
    const peak = state.offset;
    assert.ok(peak > 0);
    for (let t = 0; t < 0.7; t += 1 / 60) {
      state = stepRecoil(state, profile, false, 1 / 60);
    }
    assert.ok(Math.abs(state.offset) < peak * 0.05, `${category} offset ${state.offset}`);
  }
});

test('automatic recoil is clamped across sustained fire', () => {
  for (const category of ['AR', 'SMG'] as const) {
    const profile = RECOIL_PROFILES[category];
    let state = { offset: 0, velocity: 0 };
    for (let shot = 0; shot < 120; shot++) {
      state = stepRecoil(state, profile, true, 1 / 60);
      for (let f = 0; f < 5; f++) state = stepRecoil(state, profile, false, 1 / 60);
      assert.ok(state.offset <= profile.maxOffset + 1e-6, `${category} ${state.offset}`);
    }
  }
});
