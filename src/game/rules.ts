import { StreakBanner } from './types';

export interface ScoreEventResult {
  addedScore: number;
  banners: StreakBanner[];
}

export function evaluateKillScore(params: {
  isHeadshot: boolean;
  distance: number;
  currentStreak: number;
  isSliding: boolean;
  isQuickScope?: boolean;
}): ScoreEventResult {
  let score = 100; // Base elimination score
  const banners: StreakBanner[] = [];
  const now = Date.now();

  if (params.isHeadshot) {
    score += 50;
    banners.push({
      id: `hs-${now}-${Math.random()}`,
      text: 'HEADSHOT',
      points: 50,
      type: 'headshot',
      timestamp: now,
    });
  }

  if (params.distance >= 35) {
    score += 50;
    banners.push({
      id: `ls-${now}-${Math.random()}`,
      text: 'LONGSHOT',
      points: 50,
      type: 'longshot',
      timestamp: now,
    });
  }

  if (params.isSliding) {
    score += 25;
    banners.push({
      id: `sk-${now}-${Math.random()}`,
      text: 'SLIDE KILL',
      points: 25,
      type: 'multikill',
      timestamp: now,
    });
  }

  // Streak checks
  const streak = params.currentStreak + 1;
  if (streak === 2) {
    score += 25;
    banners.push({
      id: `dk-${now}-${Math.random()}`,
      text: 'DOUBLE KILL',
      points: 25,
      type: 'multikill',
      timestamp: now,
    });
  } else if (streak === 3) {
    score += 50;
    banners.push({
      id: `tk-${now}-${Math.random()}`,
      text: '3 KILL STREAK',
      points: 50,
      type: 'streak',
      timestamp: now,
    });
  } else if (streak === 5) {
    score += 100;
    banners.push({
      id: `bt-${now}-${Math.random()}`,
      text: 'BLOODTHIRSTY (5 STREAK)',
      points: 100,
      type: 'streak',
      timestamp: now,
    });
  } else if (streak === 7) {
    score += 150;
    banners.push({
      id: `mc-${now}-${Math.random()}`,
      text: 'MERCILESS (7 STREAK)',
      points: 150,
      type: 'streak',
      timestamp: now,
    });
  } else if (streak === 10) {
    score += 250;
    banners.push({
      id: `rl-${now}-${Math.random()}`,
      text: 'RELENTLESS (10 STREAK)',
      points: 250,
      type: 'streak',
      timestamp: now,
    });
  }

  return { addedScore: score, banners };
}

export function calculateKd(kills: number, deaths: number): string {
  if (deaths === 0) return kills > 0 ? kills.toFixed(2) : '0.00';
  return (kills / deaths).toFixed(2);
}

export function calculateAccuracy(hits: number, fired: number): string {
  if (fired === 0) return '0%';
  const pct = Math.min(100, Math.round((hits / fired) * 100));
  return `${pct}%`;
}

export function checkMatchEnd(params: {
  playerScore: number;
  scoreLimit: number;
  timeRemainingSec: number;
}): { isOver: boolean; winner: 'player' | 'bots' | 'draw' | null } {
  if (params.playerScore >= params.scoreLimit) {
    return { isOver: true, winner: 'player' };
  }
  if (params.timeRemainingSec <= 0) {
    if (params.playerScore >= params.scoreLimit * 0.7) {
      return { isOver: true, winner: 'player' };
    }
    return { isOver: true, winner: 'bots' };
  }
  return { isOver: false, winner: null };
}
