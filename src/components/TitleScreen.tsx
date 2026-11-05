import React, { useState, useEffect } from 'react';
import { WeaponCategory, WeaponDef } from '../game/types';
import { RUSH_WEAPONS, getWeaponsByCategory } from '../game/weapons';
import { Crosshair, Shield, Zap, Target, Flame, Play, Volume2, VolumeX } from 'lucide-react';
import { sound } from '../game/audio';

interface TitleScreenProps {
  selectedWeapon: WeaponDef;
  onSelectWeapon: (weapon: WeaponDef) => void;
  onStartGame: () => void;
}

export const TitleScreen: React.FC<TitleScreenProps> = ({
  selectedWeapon,
  onSelectWeapon,
  onStartGame,
}) => {
  const [activeCategory, setActiveCategory] = useState<WeaponCategory>(selectedWeapon.category);
  const [isMuted, setIsMuted] = useState(sound.getIsMuted());

  const categories: WeaponCategory[] = ['AR', 'SMG', 'Shotgun', 'Sniper'];
  const weaponsInCat = getWeaponsByCategory(activeCategory);

  const handleCategoryChange = (cat: WeaponCategory) => {
    setActiveCategory(cat);
    const guns = getWeaponsByCategory(cat);
    if (guns.length > 0 && selectedWeapon.category !== cat) {
      onSelectWeapon(guns[0]);
    }
  };

  // Keyboard shortcut: Enter or Space to start
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Enter' || e.code === 'Space') {
        // Prevent default space scroll
        e.preventDefault();
        onStartGame();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onStartGame]);

  const toggleMute = () => {
    const muted = sound.toggleMute();
    setIsMuted(muted);
  };

  return (
    <div className="fixed inset-0 z-40 flex flex-col justify-between p-6 pointer-events-auto bg-gradient-to-t from-black/80 via-transparent to-black/60 select-none">
      {/* Top Bar: Title & Mute */}
      <div className="flex items-start justify-between">
        {/* Custom Inline SVG Title Lockup */}
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-amber-500 rounded-lg flex items-center justify-center shadow-lg shadow-amber-500/30 border border-amber-300">
            <svg viewBox="0 0 24 24" className="w-8 h-8 text-black fill-current">
              <path d="M12 2L2 7l10 5 10-5-10-5zm0 8.5L4.5 7 12 3.2 19.5 7 12 10.5zM2 17l10 5 10-5M2 12l10 5 10-5" />
            </svg>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-3xl font-black tracking-wider text-white uppercase drop-shadow-[0_2px_10px_rgba(0,0,0,0.8)]">
                RUSHKILL
              </span>
              <span className="text-3xl font-black text-amber-400 uppercase tracking-wider">
                : FPS SHOOTER
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-slate-300">
              <span className="px-1.5 py-0.5 rounded bg-black/60 border border-white/20 text-emerald-400">
                CUSTOM ARSENAL
              </span>
              <span>•</span>
              <span className="text-sky-300">HIJACKED-INSPIRED YACHT MAP</span>
            </div>
          </div>
        </div>

        {/* Audio Mute Button */}
        <button
          onClick={toggleMute}
          tabIndex={-1}
          aria-label="Toggle Sound"
          className="p-3 bg-black/60 border border-white/20 hover:border-amber-400 text-white rounded-lg transition-colors cursor-pointer"
        >
          {isMuted ? <VolumeX className="w-5 h-5 text-red-400" /> : <Volume2 className="w-5 h-5 text-emerald-400" />}
        </button>
      </div>

      {/* Center Section: Rushkill Armory Selection */}
      <div className="max-w-4xl mx-auto w-full bg-slate-950/85 border border-slate-800 rounded-2xl p-6 shadow-2xl backdrop-blur-none">
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div>
            <h2 className="text-xl font-bold text-white uppercase tracking-wide flex items-center gap-2">
              <Crosshair className="w-5 h-5 text-amber-400" />
              SELECT RUSHKILL LOADOUT
            </h2>
            <p className="text-xs text-slate-400">Choose your weapon class for the yacht skirmish</p>
          </div>

          {/* Category Tabs */}
          <div className="flex gap-2">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => handleCategoryChange(cat)}
                className={`px-4 py-2 rounded-lg text-xs font-black tracking-wider uppercase transition-all cursor-pointer ${
                  activeCategory === cat
                    ? 'bg-amber-500 text-black shadow-md shadow-amber-500/20'
                    : 'bg-slate-900 text-slate-300 border border-slate-700 hover:border-slate-500'
                }`}
              >
                {cat}s
              </button>
            ))}
          </div>
        </div>

        {/* Weapons Grid for Selected Category */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-5">
          {weaponsInCat.map((weapon) => {
            const isSelected = selectedWeapon.id === weapon.id;
            return (
              <div
                key={weapon.id}
                onClick={() => onSelectWeapon(weapon)}
                className={`p-3.5 rounded-xl border transition-all cursor-pointer flex flex-col justify-between ${
                  isSelected
                    ? 'bg-amber-950/40 border-amber-400 shadow-lg shadow-amber-500/20'
                    : 'bg-slate-900/80 border-slate-800 hover:border-slate-600'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black px-2 py-0.5 rounded bg-black/60 text-amber-400 border border-slate-700">
                      {weapon.category}
                    </span>
                    <span className="text-[10px] font-mono text-slate-400">{weapon.fireRateRpm} RPM</span>
                  </div>
                  <h3 className="text-lg font-black text-white mt-1.5 uppercase tracking-wide">{weapon.name}</h3>
                  <div className="text-[10px] font-mono font-bold text-amber-400 mt-0.5">{weapon.features}</div>
                  <p className="text-[11px] text-slate-400 line-clamp-2 mt-1 leading-snug">{weapon.description}</p>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-800/80 grid grid-cols-3 gap-1 text-[11px] font-mono text-slate-300">
                  <div>
                    <span className="text-[9px] uppercase text-slate-500 block">DMG</span>
                    <span className="font-bold text-white">{weapon.damage}</span>
                  </div>
                  <div>
                    <span className="text-[9px] uppercase text-slate-500 block">RPM</span>
                    <span className="font-bold text-white">{weapon.fireRateRpm}</span>
                  </div>
                  <div>
                    <span className="text-[9px] uppercase text-slate-500 block">MAG</span>
                    <span className="font-bold text-white">{weapon.magSize}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Start Game CTA Handshake */}
        <div className="mt-6 pt-4 border-t border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-400">EQUIPPED:</span>
            <span className="px-3 py-1 rounded bg-slate-900 border border-slate-700 font-bold text-amber-400 text-sm">
              {selectedWeapon.name} ({selectedWeapon.category})
            </span>
          </div>

          <button
            data-start="true"
            onClick={onStartGame}
            className="px-8 py-3.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black font-black tracking-widest text-base uppercase rounded-xl shadow-lg shadow-amber-500/30 flex items-center gap-2 transform active:scale-95 transition-all cursor-pointer"
          >
            <Play className="w-5 h-5 fill-current" />
            DEPLOY TO THE YACHT
          </button>
        </div>
      </div>

      {/* Bottom Flat Control Hint (Per Game Craft Guidelines) */}
      <div className="text-center">
        <p className="text-xs font-mono font-medium tracking-wide text-slate-400 drop-shadow-[0_1px_4px_rgba(0,0,0,0.9)]">
          WASD Move • Space Jump / Bhop • Shift Slide • Right-Click ADS • Left-Click Shoot • R Reload • F Lock Mouse • Esc Pause
        </p>
      </div>
    </div>
  );
};
