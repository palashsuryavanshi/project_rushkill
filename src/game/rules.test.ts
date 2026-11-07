import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateKillScore, calculateKd, calculateAccuracy, checkMatchEnd } from './rules';
import { RUSH_WEAPONS, getWeaponById, calculateShotDamage, calculateShotTotalDamage } from './weapons';

test('the armory holds exactly one weapon per class', () => {
  assert.equal(RUSH_WEAPONS.length, 4);
  const categories = RUSH_WEAPONS.map((w) => w.category).sort();
  assert.deepEqual(categories, ['AR', 'SMG', 'Shotgun', 'Sniper']);
});

test('weapons are named by class only', () => {
  for (const w of RUSH_WEAPONS) assert.equal(w.name, w.category);
});

test('the kept weapon ids are MCW, Rival-9, Lockwood 680, Longbow', () => {
  assert.deepEqual(RUSH_WEAPONS.map((w) => w.id).sort(), ['lockwood_680', 'longbow', 'mcw', 'rival_9']);
});

test('calculateShotDamage applies headshot multipliers correctly', () => {
  const mcw = getWeaponById('mcw');
  const bodyDmg = calculateShotDamage(mcw, false, 15);
  const headDmg = calculateShotDamage(mcw, true, 15);
  assert.equal(bodyDmg, 28);
  assert.equal(headDmg, Math.round(28 * 1.5));
});

test('AR and SMG keep full damage at long range (no falloff)', () => {
  const ar = RUSH_WEAPONS.find((w) => w.category === 'AR')!;
  const smg = RUSH_WEAPONS.find((w) => w.category === 'SMG')!;

  assert.equal(calculateShotDamage(ar, false, 120), ar.damage);
  assert.equal(calculateShotDamage(smg, false, 120), smg.damage);
});

test('sniper damage falls off 20% every 30 m and never runs out of range', () => {
  const sniper = RUSH_WEAPONS.find((w) => w.category === 'Sniper')!;

  assert.equal(calculateShotDamage(sniper, false, 29), sniper.damage);
  assert.equal(calculateShotDamage(sniper, false, 30), Math.round(sniper.damage * 0.8));
  assert.equal(calculateShotDamage(sniper, false, 60), Math.round(sniper.damage * 0.8 ** 2));
  assert.equal(calculateShotDamage(sniper, false, 90), Math.round(sniper.damage * 0.8 ** 3));
  assert.equal(
    calculateShotDamage(sniper, true, 60),
    Math.round(sniper.damage * 0.8 ** 2 * sniper.headshotMultiplier)
  );
  assert.ok(calculateShotDamage(sniper, false, 1000) >= 1, 'long shots still deal at least 1 damage');
});

test('shotgun deals full damage inside 20 m and nothing beyond it', () => {
  const shotgun = RUSH_WEAPONS.find((w) => w.category === 'Shotgun')!;

  assert.equal(calculateShotDamage(shotgun, false, 19.9), shotgun.damage);
  assert.equal(calculateShotDamage(shotgun, false, 20.1), 0);
  assert.equal(calculateShotDamage(shotgun, true, 25), 0, 'headshots must not bypass the cutoff');
});

test('shotgun total damage stays zero beyond the cutoff (pellets do not floor it to 1)', () => {
  const shotgun = RUSH_WEAPONS.find((w) => w.category === 'Shotgun')!;
  const pellets = Math.max(1, shotgun.pellets || 1);

  assert.equal(calculateShotTotalDamage(shotgun, false, 25), 0);
  assert.equal(calculateShotTotalDamage(shotgun, false, 5), Math.round(shotgun.damage * pellets));
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
