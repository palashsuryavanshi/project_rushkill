import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateKillScore, calculateKd, calculateAccuracy, checkMatchEnd } from './rules';
import { RUSH_WEAPONS, getWeaponById, calculateShotDamage } from './weapons';

test('Rush weapon definitions contain all 4 categories', () => {
  const categories = new Set(RUSH_WEAPONS.map((w) => w.category));
  assert.equal(categories.has('AR'), true);
  assert.equal(categories.has('SMG'), true);
  assert.equal(categories.has('Shotgun'), true);
  assert.equal(categories.has('Sniper'), true);
  assert.equal(RUSH_WEAPONS.length >= 12, true);
});

test('calculateShotDamage applies headshot multipliers correctly', () => {
  const mcw = getWeaponById('mcw');
  const bodyDmg = calculateShotDamage(mcw, false, 15);
  const headDmg = calculateShotDamage(mcw, true, 15);
  assert.equal(bodyDmg, 28);
  assert.equal(headDmg, Math.round(28 * 1.5));
});

test('evaluateKillScore awards bonuses for headshots and streaks', () => {
  const normalKill = evaluateKillScore({
    isHeadshot: false,
    distance: 10,
    currentStreak: 0,
    isSliding: false,
  });
  assert.equal(normalKill.addedScore, 100);
  assert.equal(normalKill.banners.length, 0);

  const headshotStreak = evaluateKillScore({
    isHeadshot: true,
    distance: 40,
    currentStreak: 4, // 5th kill
    isSliding: true,
  });
  // 100 base + 50 headshot + 50 longshot + 25 slide + 100 bloodthirsty = 325
  assert.equal(headshotStreak.addedScore, 325);
  assert.equal(headshotStreak.banners.some((b) => b.text === 'HEADSHOT'), true);
  assert.equal(headshotStreak.banners.some((b) => b.text === 'LONGSHOT'), true);
  assert.equal(headshotStreak.banners.some((b) => b.text.includes('BLOODTHIRSTY')), true);
});

test('calculateKd handles zero deaths cleanly', () => {
  assert.equal(calculateKd(5, 0), '5.00');
  assert.equal(calculateKd(0, 0), '0.00');
  assert.equal(calculateKd(10, 4), '2.50');
});

test('calculateAccuracy calculates percentage properly', () => {
  assert.equal(calculateAccuracy(0, 0), '0%');
  assert.equal(calculateAccuracy(10, 20), '50%');
  assert.equal(calculateAccuracy(33, 100), '33%');
});

test('checkMatchEnd recognizes score limit and time exhaustion', () => {
  const ongoing = checkMatchEnd({ playerScore: 10, scoreLimit: 25, timeRemainingSec: 120 });
  assert.equal(ongoing.isOver, false);

  const scoreWin = checkMatchEnd({ playerScore: 25, scoreLimit: 25, timeRemainingSec: 60 });
  assert.equal(scoreWin.isOver, true);
  assert.equal(scoreWin.winner, 'player');

  const timeoutLoss = checkMatchEnd({ playerScore: 5, scoreLimit: 25, timeRemainingSec: 0 });
  assert.equal(timeoutLoss.isOver, true);
  assert.equal(timeoutLoss.winner, 'bots');
});
