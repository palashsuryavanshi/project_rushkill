import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildScoreboard,
  sortScoreboard,
  type ScoreboardEntry,
} from './scoreboard';

const entry = (
  id: string,
  score: number,
  kills: number,
  deaths: number,
  isPlayer = false
): ScoreboardEntry => ({
  id, name: id, score, kills, deaths, isPlayer, isDead: false,
});

test('sorts by score, then kills, then deaths, then name', () => {
  const sorted = sortScoreboard([
    entry('b', 100, 2, 5),
    entry('a', 100, 3, 5),
    entry('c', 100, 3, 2),
    entry('d', 50, 9, 0),
    entry('e', 100, 3, 2),
  ]);
  assert.deepEqual(sorted.map((e) => e.id), ['c', 'e', 'a', 'b', 'd']);
});

test('keeps dead entries in the standings', () => {
  const sorted = sortScoreboard([
    { ...entry('dead', 200, 2, 0), isDead: true },
    entry('live', 100, 1, 0),
  ]);
  assert.deepEqual(sorted.map((e) => e.id), ['dead', 'live']);
});

test('caps at ten rows and pins the player outside the top ten', () => {
  const entries = Array.from({ length: 14 }, (_, i) =>
    entry(`bot${i}`, 1000 - i, 10 - i, 0)
  );
  entries.push(entry('player', 5, 0, 9, true));
  const board = buildScoreboard(entries);
  assert.equal(board.rows.length, 10);
  assert.equal(board.rows.some((e) => e.isPlayer), false);
  assert.equal(board.pinnedPlayer?.id, 'player');
  assert.equal(board.playerRank, 15);
});

test('includes the player in rows when they rank inside the cap', () => {
  const entries = [entry('player', 900, 9, 1, true), entry('bot', 100, 1, 1)];
  const board = buildScoreboard(entries);
  assert.equal(board.rows[0].id, 'player');
  assert.equal(board.pinnedPlayer, null);
  assert.equal(board.playerRank, 1);
});
