import test from 'node:test';
import assert from 'node:assert/strict';
import { MatchLoop, FPS_INTERVAL_SEC, HUD_INTERVAL_SEC } from './matchLoop';

test('advance counts down and reports no winner while time remains', () => {
  const loop = new MatchLoop(10);
  assert.equal(loop.advance(1, 0, 25), null);
  assert.equal(loop.timeRemaining, 9);
});

test('advance reports a player win when time expires above 70% of the score limit', () => {
  const loop = new MatchLoop(1);
  assert.equal(loop.advance(1.5, 18, 25), 'player');
  assert.ok(loop.timeRemaining <= 0);
});

test('advance reports a bot win when time expires below 70% of the score limit', () => {
  const loop = new MatchLoop(1);
  assert.equal(loop.advance(1.5, 5, 25), 'bots');
});

test('advance does nothing once the clock is already exhausted', () => {
  const loop = new MatchLoop(0);
  assert.equal(loop.advance(1, 0, 25), null);
  assert.equal(loop.timeRemaining, 0);
});

test('hudDue throttles stat and minimap pushes to the HUD interval', () => {
  const loop = new MatchLoop();
  assert.equal(loop.hudDue(HUD_INTERVAL_SEC / 2).statsDue, false);
  assert.equal(loop.hudDue(HUD_INTERVAL_SEC / 2).statsDue, true);

  loop.markStatsSent();
  assert.equal(loop.hudDue(0).statsDue, false);
});

test('minimap accumulation is independent from stats accumulation', () => {
  const loop = new MatchLoop();
  loop.hudDue(HUD_INTERVAL_SEC / 2);
  loop.markStatsSent();
  const due = loop.hudDue(HUD_INTERVAL_SEC / 2);
  assert.equal(due.statsDue, false);
  assert.equal(due.minimapDue, true);

  loop.markMinimapSent();
  assert.equal(loop.hudDue(0).minimapDue, false);
});

test('sampleFps emits once per second when enabled', () => {
  const loop = new MatchLoop();
  const step = 1 / 60;
  let sample = null;
  for (let i = 0; i < 60; i++) {
    sample = loop.sampleFps(step, true, 12);
  }
  assert.ok(sample, 'expected a sample after a full second');
  assert.ok(Math.abs(sample!.fps - 60) < 1.5);
  assert.ok(Math.abs(sample!.frameMs - 1000 / 60) < 1);
  assert.equal(sample!.calls, 12);
});

test('sampleFps keeps accumulating while disabled, then emits immediately', () => {
  const loop = new MatchLoop();
  for (let i = 0; i < 60; i++) {
    assert.equal(loop.sampleFps(1 / 60, false, 0), null);
  }
  const sample = loop.sampleFps(1 / 60, true, 3);
  assert.ok(sample);
  assert.ok(sample!.fps > 0);
  assert.equal(sample!.calls, 3);
});

test('FPS interval constant matches the original one-second cadence', () => {
  assert.equal(FPS_INTERVAL_SEC, 1.0);
});
