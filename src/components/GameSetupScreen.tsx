import React, { useState } from 'react';
import { MatchConfig, WeaponCategory, BotDifficulty } from '../game/types';
import {
  Compass,
  Clock,
  Target,
  Shield,
  Bot,
  ArrowRight,
  ArrowLeft,
  Lock,
  CheckCircle2,
  Zap,
} from 'lucide-react';

interface GameSetupScreenProps {
  config: MatchConfig;
  onUpdateConfig: (newConfig: MatchConfig) => void;
  onContinueToLoadout: () => void;
  onBackToMenu: () => void;
}

interface MapOption {
  id: string;
  name: string;
  subtitle: string;
  description: string;
  isAvailable: boolean;
  tag: string;
}

const MAP_OPTIONS: MapOption[] = [
  {
    id: 'hijacked',
    name: 'Hijacked',
    subtitle: 'Luxury Superyacht Arena',
    description: 'Multi-deck superyacht with open helipad, 2-story luxury salon, and expansive upper bridge deck.',
    isAvailable: true,
    tag: 'ACTIVE MAP',
  },
  {
    id: 'nuketown',
    name: 'Nuketown',
    subtitle: 'Nevada Nuclear Testing Grounds',
    description: 'High-octane close-quarters cul-de-sac between two suburban model homes and school bus cover.',
    isAvailable: false,
    tag: 'COMING SOON',
  },
  {
    id: 'raid',
    name: 'Raid',
    subtitle: 'Hollywood Hills Luxury Estate',
    description: 'Modern luxury estate featuring courtyards, swimming pool pavilion, and sculpture garden lanes.',
    isAvailable: false,
    tag: 'COMING SOON',
  },
  {
    id: 'standoff',
    name: 'Standoff',
    subtitle: 'Border Town CQB',
    description: 'Classic three-lane tactical town with central street crossfires, brick buildings, and barn perches.',
    isAvailable: false,
    tag: 'COMING SOON',
  },
];

const TIME_LIMIT_OPTIONS = [
  { label: '3 Mins', val: 3 },
  { label: '5 Mins', val: 5 },
  { label: '10 Mins', val: 10 },
  { label: 'Unlimited', val: 0 },
];

const SCORE_LIMIT_OPTIONS = [
  { label: '15 Kills', val: 15 },
  { label: '25 Kills', val: 25 },
  { label: '50 Kills', val: 50 },
  { label: '75 Kills', val: 75 },
];

const ALL_CATEGORIES: WeaponCategory[] = ['AR', 'SMG', 'Shotgun', 'Sniper'];

const DIFFICULTY_OPTIONS: { id: BotDifficulty; name: string; tag: string; desc: string; color: string }[] = [
  { id: 'recruit', name: 'Recruit', tag: 'CASUAL', desc: 'Slower reactions (0.6s), relaxed aiming, basic navigation', color: 'text-emerald-400 border-emerald-500/40' },
  { id: 'regular', name: 'Regular', tag: 'STANDARD', desc: 'Balanced reflexes (0.4s), tactical cover, active strafing', color: 'text-sky-400 border-sky-500/40' },
  { id: 'veteran', name: 'Veteran', tag: 'CHALLENGE', desc: 'Fast reflexes (0.25s), flanking routes, aggressive pushes', color: 'text-amber-400 border-amber-500/40' },
  { id: 'elite', name: 'Elite', tag: 'PRO', desc: 'Pro intuition (0.15s), high accuracy, adaptive tactics', color: 'text-rose-400 border-rose-500/40' },
];

export const GameSetupScreen: React.FC<GameSetupScreenProps> = ({
  config,
  onUpdateConfig,
  onContinueToLoadout,
  onBackToMenu,
}) => {
  const [selectedMap, setSelectedMap] = useState<string>(config.selectedMap || 'hijacked');
  const [timeLimit, setTimeLimit] = useState<number>(config.timeLimitMinutes);
  const [scoreLimit, setScoreLimit] = useState<number>(config.scoreLimit);
  const [allowedCategories, setAllowedCategories] = useState<WeaponCategory[]>(
    config.allowedCategories.length > 0 ? config.allowedCategories : ALL_CATEGORIES
  );
  const [botCount, setBotCount] = useState<number>(config.botCount);
  const [botDifficulty, setBotDifficulty] = useState<BotDifficulty>(config.botDifficulty || 'regular');

  const toggleCategory = (cat: WeaponCategory) => {
    if (allowedCategories.includes(cat)) {
      if (allowedCategories.length > 1) {
        const next = allowedCategories.filter((c) => c !== cat);
        setAllowedCategories(next);
        saveChanges({ allowedCategories: next });
      }
    } else {
      const next = [...allowedCategories, cat];
      setAllowedCategories(next);
      saveChanges({ allowedCategories: next });
    }
  };

  const applyLoadoutPreset = (categories: WeaponCategory[]) => {
    setAllowedCategories(categories);
    saveChanges({ allowedCategories: categories });
  };

  const saveChanges = (partial: Partial<MatchConfig>) => {
    const updated: MatchConfig = {
      selectedMap,
      timeLimitMinutes: timeLimit,
      scoreLimit,
      allowedCategories,
      botCount,
      botDifficulty,
      ...partial,
    };
    onUpdateConfig(updated);
  };

  const handleContinue = () => {
    saveChanges({});
    onContinueToLoadout();
  };

  return (
    <div className="fixed inset-0 z-40 flex flex-col justify-between p-6 pointer-events-auto bg-gradient-to-t from-black/90 via-black/40 to-black/70 select-none overflow-y-auto">
      {/* Top Header */}
      <div className="flex items-center justify-between pb-4 border-b border-slate-800 max-w-5xl mx-auto w-full">
        <div className="flex items-center gap-3">
          <button
            onClick={onBackToMenu}
            className="p-2.5 bg-slate-900 border border-slate-700 hover:border-slate-500 text-slate-300 hover:text-white rounded-xl transition-colors cursor-pointer flex items-center gap-1.5 text-xs font-bold"
          >
            <ArrowLeft className="w-4 h-4" />
            MAIN MENU
          </button>
          <div>
            <h1 className="text-2xl font-black text-white uppercase tracking-wider flex items-center gap-2">
              <Compass className="w-6 h-6 text-amber-400" />
              GAME SETUP & MATCH RULES
            </h1>
            <p className="text-xs text-slate-400">Configure map, match limits, weapon restrictions, and bot AI count</p>
          </div>
        </div>

        <button
          onClick={handleContinue}
          className="px-6 py-3 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black font-black uppercase text-xs tracking-wider rounded-xl shadow-lg shadow-amber-500/25 flex items-center gap-2 transition-transform active:scale-95 cursor-pointer"
        >
          <span>CONTINUE TO LOADOUT</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>

      {/* Main Configuration Grid */}
      <div className="max-w-5xl mx-auto w-full my-auto py-4 flex flex-col gap-6">
        {/* 1. MAP SELECTION */}
        <div className="bg-slate-950/85 border border-slate-800 rounded-2xl p-5 shadow-2xl">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
              <Compass className="w-4 h-4 text-amber-400" />
              1. MAP SELECTION
            </h2>
            <span className="text-xs font-mono text-slate-400">1 AVAILABLE • 3 UPCOMING</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {MAP_OPTIONS.map((map) => {
              const isSelected = selectedMap === map.id;
              return (
                <div
                  key={map.id}
                  onClick={() => {
                    if (map.isAvailable) {
                      setSelectedMap(map.id);
                      saveChanges({ selectedMap: map.id });
                    }
                  }}
                  className={`p-3.5 rounded-xl border flex flex-col justify-between transition-all ${
                    map.isAvailable
                      ? isSelected
                        ? 'bg-amber-950/40 border-amber-400 shadow-lg shadow-amber-500/20 cursor-pointer'
                        : 'bg-slate-900/80 border-slate-800 hover:border-slate-600 cursor-pointer'
                      : 'bg-slate-950/60 border-slate-900 opacity-60 cursor-not-allowed'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <span
                        className={`text-[9px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider font-mono ${
                          map.isAvailable
                            ? 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-400'
                            : 'bg-slate-800 text-slate-400'
                        }`}
                      >
                        {map.tag}
                      </span>
                      {isSelected ? (
                        <CheckCircle2 className="w-4 h-4 text-amber-400" />
                      ) : !map.isAvailable ? (
                        <Lock className="w-3.5 h-3.5 text-slate-500" />
                      ) : null}
                    </div>

                    <h3 className="text-base font-black text-white uppercase mt-2">{map.name}</h3>
                    <div className="text-[11px] font-bold text-slate-400 mt-0.5">{map.subtitle}</div>
                    <p className="text-[10px] text-slate-400 line-clamp-3 mt-1.5 leading-relaxed">
                      {map.description}
                    </p>
                  </div>

                  <div className="mt-3 pt-2 border-t border-slate-800/80 text-[10px] font-mono text-slate-400">
                    {map.isAvailable ? 'Selected & Ready' : 'Coming Soon'}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 2 & 3: MATCH LIMITS (TIME & SCORE) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Time Limit */}
          <div className="bg-slate-950/85 border border-slate-800 rounded-2xl p-5 shadow-2xl flex flex-col justify-between">
            <div>
              <h2 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2 mb-1">
                <Clock className="w-4 h-4 text-sky-400" />
                2. MATCH TIME LIMIT
              </h2>
              <p className="text-xs text-slate-400 mb-3">Duration before match ends on time</p>
            </div>

            <div className="grid grid-cols-4 gap-2">
              {TIME_LIMIT_OPTIONS.map((opt) => (
                <button
                  key={opt.val}
                  onClick={() => {
                    setTimeLimit(opt.val);
                    saveChanges({ timeLimitMinutes: opt.val });
                  }}
                  className={`py-2.5 rounded-xl text-xs font-mono font-bold uppercase transition-all cursor-pointer ${
                    timeLimit === opt.val
                      ? 'bg-sky-500 text-black shadow-md shadow-sky-500/20'
                      : 'bg-slate-900 border border-slate-800 text-slate-300 hover:border-slate-600'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Score Limit */}
          <div className="bg-slate-950/85 border border-slate-800 rounded-2xl p-5 shadow-2xl flex flex-col justify-between">
            <div>
              <h2 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2 mb-1">
                <Target className="w-4 h-4 text-emerald-400" />
                3. ELIMINATION SCORE LIMIT
              </h2>
              <p className="text-xs text-slate-400 mb-3">Number of kills required for victory</p>
            </div>

            <div className="grid grid-cols-4 gap-2">
              {SCORE_LIMIT_OPTIONS.map((opt) => (
                <button
                  key={opt.val}
                  onClick={() => {
                    setScoreLimit(opt.val);
                    saveChanges({ scoreLimit: opt.val });
                  }}
                  className={`py-2.5 rounded-xl text-xs font-mono font-bold uppercase transition-all cursor-pointer ${
                    scoreLimit === opt.val
                      ? 'bg-emerald-500 text-black shadow-md shadow-emerald-500/20'
                      : 'bg-slate-900 border border-slate-800 text-slate-300 hover:border-slate-600'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 4 & 5: RESTRICT LOADOUTS & BOT COUNT */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* 4. Restrict Loadouts (2 Cols) */}
          <div className="md:col-span-2 bg-slate-950/85 border border-slate-800 rounded-2xl p-5 shadow-2xl">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
                  <Shield className="w-4 h-4 text-amber-400" />
                  4. RESTRICT LOADOUTS (ALLOWED WEAPONS)
                </h2>
                <p className="text-xs text-slate-400">Toggle weapon categories or pick game-mode presets</p>
              </div>

              {/* Quick Presets */}
              <div className="flex gap-1.5">
                <button
                  onClick={() => applyLoadoutPreset(['AR', 'SMG', 'Shotgun', 'Sniper'])}
                  className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-700 text-[10px] font-bold text-slate-300 hover:text-white cursor-pointer"
                >
                  All
                </button>
                <button
                  onClick={() => applyLoadoutPreset(['Sniper'])}
                  className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-700 text-[10px] font-bold text-purple-300 hover:text-purple-200 cursor-pointer"
                >
                  Snipers Only
                </button>
                <button
                  onClick={() => applyLoadoutPreset(['Shotgun'])}
                  className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-700 text-[10px] font-bold text-orange-300 hover:text-orange-200 cursor-pointer"
                >
                  Shotguns Only
                </button>
                <button
                  onClick={() => applyLoadoutPreset(['AR', 'SMG'])}
                  className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-700 text-[10px] font-bold text-sky-300 hover:text-sky-200 cursor-pointer"
                >
                  ARs & SMGs
                </button>
              </div>
            </div>

            {/* Category Chips */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {ALL_CATEGORIES.map((cat) => {
                const isEnabled = allowedCategories.includes(cat);
                return (
                  <div
                    key={cat}
                    onClick={() => toggleCategory(cat)}
                    className={`p-3 rounded-xl border flex items-center justify-between transition-all cursor-pointer ${
                      isEnabled
                        ? 'bg-amber-950/40 border-amber-400/80 shadow-md shadow-amber-500/10'
                        : 'bg-slate-900/50 border-slate-800 text-slate-500'
                    }`}
                  >
                    <div>
                      <span className="text-xs font-black uppercase text-white block">{cat}s</span>
                      <span className="text-[10px] font-mono text-slate-400">{cat}</span>
                    </div>
                    <div
                      className={`w-5 h-5 rounded-md flex items-center justify-center border text-xs font-bold ${
                        isEnabled ? 'bg-amber-400 border-amber-300 text-black' : 'border-slate-700 text-transparent'
                      }`}
                    >
                      ✓
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 5. Number of Bots (1 Col) */}
          <div className="bg-slate-950/85 border border-slate-800 rounded-2xl p-5 shadow-2xl flex flex-col justify-between">
            <div>
              <h2 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2 mb-1">
                <Bot className="w-4 h-4 text-red-400" />
                5. BOT COUNT
              </h2>
              <p className="text-xs text-slate-400 mb-3">Opponent AI combatants</p>
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between font-mono">
                <span className="text-xs text-slate-400 font-bold uppercase">ENEMY BOTS</span>
                <span className="text-xl font-black text-amber-400">{botCount} BOTS</span>
              </div>

              <div className="grid grid-cols-5 gap-1.5">
                {[2, 4, 6, 8, 10].map((num) => (
                  <button
                    key={num}
                    onClick={() => {
                      setBotCount(num);
                      saveChanges({ botCount: num });
                    }}
                    className={`py-2 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer ${
                      botCount === num
                        ? 'bg-amber-500 text-black font-black'
                        : 'bg-slate-900 border border-slate-800 text-slate-300 hover:border-slate-600'
                    }`}
                  >
                    {num}
                  </button>
                ))}
              </div>

              <span className="text-[10px] text-slate-500 font-mono text-center mt-1">
                {botCount <= 4 ? 'Tactical 1v4 Skirmish' : botCount <= 6 ? 'Standard Free-For-All' : 'Full Chaos Carnage'}
              </span>
            </div>
          </div>
        </div>

        {/* 6. BOT AI DIFFICULTY & BEHAVIOR */}
        <div className="bg-slate-950/85 border border-slate-800 rounded-2xl p-5 shadow-2xl">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-400" />
                6. BOT AI DIFFICULTY & TACTICAL BEHAVIOR
              </h2>
              <p className="text-xs text-slate-400">Controls reaction delays, aim inaccuracy, cover usage, and perception</p>
            </div>
            <span className="text-xs font-mono text-amber-400 font-bold uppercase">
              ACTIVE: {botDifficulty.toUpperCase()}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {DIFFICULTY_OPTIONS.map((diff) => {
              const isSelected = botDifficulty === diff.id;
              return (
                <div
                  key={diff.id}
                  onClick={() => {
                    setBotDifficulty(diff.id);
                    saveChanges({ botDifficulty: diff.id });
                  }}
                  className={`p-3.5 rounded-xl border flex flex-col justify-between transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-amber-950/40 border-amber-400 shadow-lg shadow-amber-500/20'
                      : 'bg-slate-900/80 border-slate-800 hover:border-slate-600'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <span className={`text-[9px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider font-mono border ${diff.color}`}>
                        {diff.tag}
                      </span>
                      {isSelected && <CheckCircle2 className="w-4 h-4 text-amber-400" />}
                    </div>

                    <h3 className="text-sm font-black text-white uppercase mt-2">{diff.name}</h3>
                    <p className="text-[10px] text-slate-400 mt-1 leading-relaxed">{diff.desc}</p>
                  </div>

                  <div className="mt-2.5 pt-2 border-t border-slate-800/80 text-[10px] font-mono text-slate-400">
                    {diff.id === 'recruit' && 'Reaction: ~0.65s · Spread: Wide'}
                    {diff.id === 'regular' && 'Reaction: ~0.42s · Spread: Moderate'}
                    {diff.id === 'veteran' && 'Reaction: ~0.26s · Spread: Tight'}
                    {diff.id === 'elite' && 'Reaction: ~0.16s · Spread: Laser'}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Footer Navigation */}
      <div className="flex items-center justify-between pt-4 border-t border-slate-800 max-w-5xl mx-auto w-full">
        <button
          onClick={onBackToMenu}
          className="px-5 py-3 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 text-xs font-bold uppercase rounded-xl flex items-center gap-2 cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          Cancel & Back
        </button>

        <button
          onClick={handleContinue}
          className="px-8 py-3.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black font-black uppercase text-sm tracking-wider rounded-xl shadow-lg shadow-amber-500/30 flex items-center gap-2 transition-transform active:scale-95 cursor-pointer"
        >
          <span>CHOOSE LOADOUT & DEPLOY</span>
          <ArrowRight className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
};
