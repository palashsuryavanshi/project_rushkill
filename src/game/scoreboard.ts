export interface ScoreboardEntry {
  id: string;
  name: string;
  score: number;
  kills: number;
  deaths: number;
  isPlayer: boolean;
  isDead: boolean;
}

export const PLAYER_SCOREBOARD_ID = 'player';

export function sortScoreboard(entries: ScoreboardEntry[]): ScoreboardEntry[] {
  return [...entries].sort(
    (a, b) =>
      b.score - a.score ||
      b.kills - a.kills ||
      a.deaths - b.deaths ||
      a.name.localeCompare(b.name)
  );
}

export function buildScoreboard(entries: ScoreboardEntry[], limit = 10) {
  const sorted = sortScoreboard(entries);
  const player = sorted.find((e) => e.isPlayer) ?? null;
  const playerRank = player ? sorted.indexOf(player) + 1 : 0;
  const rows = sorted.slice(0, limit);
  const pinnedPlayer = player && !rows.includes(player) ? player : null;
  return { rows, pinnedPlayer, playerRank };
}
