import test from 'node:test';
import assert from 'node:assert/strict';
import {
  HealthRegen,
  HEALTH_REGEN_DELAY_SEC,
  HEALTH_REGEN_PER_SEC,
} from './healthRegen';

test('regen waits for the delay after damage', () => {
  const regen = new HealthRegen();
  regen.onDamage();

  assert.equal(regen.tick(HEALTH_REGEN_DELAY_SEC / 2, 50, 100), 50);
  assert.equal(regen.tick(HEALTH_REGEN_DELAY_SEC / 2, 50, 100), 50);
  assert.equal(regen.tick(0.1, 50, 100), 50 + HEALTH_REGEN_PER_SEC * 0.1);
});

test('regen restores health at the configured rate and caps at max', () => {
  const regen = new HealthRegen();
  regen.reset();

  const healed = regen.tick(1, 50, 100);
  assert.equal(healed, 50 + HEALTH_REGEN_PER_SEC);

  assert.equal(regen.tick(10, 95, 100), 100);
});

test('regen never revives a dead player', () => {
  const regen = new HealthRegen();
  regen.reset();
  assert.equal(regen.tick(1, 0, 100), 0);
});

test('taking damage restarts the delay', () => {
  const regen = new HealthRegen();
  regen.reset();

  assert.equal(regen.tick(1, 50, 100), 50 + HEALTH_REGEN_PER_SEC);
  regen.onDamage();
  assert.equal(regen.tick(1, 60, 100), 60);
});
