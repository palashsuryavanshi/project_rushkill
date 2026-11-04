import React from 'react';
import { PlayerStats, WeaponDef } from '../game/types';
import { calculateKd, calculateAccuracy } from '../game/rules';
import { Trophy, Skull, Target, Zap, RotateCcw, Home } from 'lucide-react';

interface GameOverModalProps {
  winner: 'player' | 'bots' | 'draw';
  stats: PlayerStats;
  weapon: WeaponDef;
  onPlayAgain: () => void;
  onReturnTitle: () => void;
}

export const GameOverModal: React.FC<GameOverModalProps> = ({
  winner,
  stats,
  weapon,
  onPlayAgain,
  onReturnTitle,
}) => {
  const isVictory = winner === 'player';
  const kd = calculateKd(stats.kills, stats.deaths);
  const acc = calculateAccuracy(stats.shotsHit, stats.shotsFired);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 pointer-events-auto select-none">
      <div className="max-w-lg w-full bg-slate-950 border border-slate-800 rounded-2xl shadow-2xl p-6 flex flex-col gap-6">
        {/* Outcome Header */}
        <div className="text-center flex flex-col items-center">
          <div
            className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-3 shadow-lg ${
              isVictory
                ? 'bg-amber-500 shadow-amber-500/30 text-black'
                : 'bg-red-600 shadow-red-600/30 text-white'
            }`}
          >
            {isVictory ? <Trophy className="w-9 h-9" /> : <Skull className="w-9 h-9" />}
          </div>
          <h2 className="text-3xl font-black text-white uppercase tracking-wider">
            {isVictory ? 'VICTORY - DECK SECURED' : 'MATCH DEFEAT'}
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            {isVictory
              ? 'You dominated the Hijacked yacht skirmish!'
              : 'Enemy forces overrun the yacht deck. Regroup and redeploy.'}
          </p>
        </div>

        {/* 6 Grid Performance Metrics */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3 text-center">
            <span className="text-[10px] uppercase font-bold text-slate-500 block">KILLS</span>
            <span className="text-2xl font-black font-mono text-white tabular-nums">{stats.kills}</span>
          </div>

          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3 text-center">
            <span className="text-[10px] uppercase font-bold text-slate-500 block">DEATHS</span>
            <span className="text-2xl font-black font-mono text-white tabular-nums">{stats.deaths}</span>
          </div>

          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3 text-center">
            <span className="text-[10px] uppercase font-bold text-slate-500 block">K/D RATIO</span>
            <span className="text-2xl font-black font-mono text-amber-400 tabular-nums">{kd}</span>
          </div>

          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3 text-center">
            <span className="text-[10px] uppercase font-bold text-slate-500 block">ACCURACY</span>
            <span className="text-2xl font-black font-mono text-emerald-400 tabular-nums">{acc}</span>
          </div>

          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3 text-center">
            <span className="text-[10px] uppercase font-bold text-slate-500 block">HEADSHOTS</span>
            <span className="text-2xl font-black font-mono text-yellow-300 tabular-nums">{stats.headshots}</span>
          </div>

          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3 text-center">
            <span className="text-[10px] uppercase font-bold text-slate-500 block">MAX STREAK</span>
            <span className="text-2xl font-black font-mono text-sky-400 tabular-nums">{stats.highestStreak}</span>
          </div>
        </div>

        {/* Equipped weapon banner */}
        <div className="bg-slate-900/60 border border-slate-800/80 px-4 py-2.5 rounded-xl flex items-center justify-between text-xs font-mono">
          <span className="text-slate-400">FAVORITE WEAPON:</span>
          <span className="text-amber-400 font-bold">
            {weapon.name} ({weapon.category})
          </span>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between pt-2">
          <button
            onClick={onReturnTitle}
            className="px-5 py-3 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 text-xs font-bold uppercase rounded-xl flex items-center gap-2 transition-colors cursor-pointer"
          >
            <Home className="w-4 h-4" />
            Armory Menu
          </button>

          <button
            data-start="true"
            onClick={onPlayAgain}
            className="px-7 py-3 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black font-black uppercase text-sm tracking-wider rounded-xl shadow-lg shadow-amber-500/30 flex items-center gap-2 transition-transform active:scale-95 cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" />
            Play Again
          </button>
        </div>
      </div>
    </div>
  );
};
