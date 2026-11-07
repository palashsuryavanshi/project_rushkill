import test from 'node:test';
import assert from 'node:assert/strict';
import { pointerLockRetryDelay, LOCK_COOLDOWN_MS, LOCK_RETRY_MS } from './pointerLock';

test('pointerLockRetryDelay allows a direct user gesture immediately', () => {
  assert.equal(pointerLockRetryDelay(0, true), 0);
  assert.equal(pointerLockRetryDelay(50, true), 0);
});

test('pointerLockRetryDelay waits out the Chromium cooldown', () => {
  assert.equal(pointerLockRetryDelay(0, false), LOCK_RETRY_MS);
  assert.equal(pointerLockRetryDelay(500, false), LOCK_RETRY_MS - 500);
  assert.equal(pointerLockRetryDelay(LOCK_COOLDOWN_MS, false), 0);
  assert.equal(pointerLockRetryDelay(LOCK_COOLDOWN_MS + 500, false), 0);
});
