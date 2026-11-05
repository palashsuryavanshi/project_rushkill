import React, { useState, useEffect } from 'react';
import { WeaponCategory, WeaponDef, MatchConfig } from '../game/types';
import { RUSH_WEAPONS, getWeaponsByCategory } from '../game/weapons';
import { Crosshair, Play, ArrowLeft, ShieldAlert } from 'lucide-react';

interface LoadoutScreenProps {
  config: MatchConfig;
  selectedWeapon: WeaponDef;
  onSelectWeapon: (weapon: WeaponDef) => void;
  onDeploy: () => void;
  onBackToSetup: () => void;
}

export const LoadoutScreen: React.FC<LoadoutScreenProps> = ({
  config,
  selectedWeapon,
  onSelectWeapon,
  onDeploy,
  onBackToSetup,
}) => {
  const availableCategories = config.allowedCategories.length > 0
    ? config.allowedCategories
    : (['AR', 'SMG', 'Shotgun', 'Sniper'] as WeaponCategory[]);

  const [activeCategory, setActiveCategory] = useState<WeaponCategory>(() => {
    return availableCategories.includes(selectedWeapon.category)
      ? selectedWeapon.category
      : availableCategories[0];
  });

  // Ensure equipped weapon is legal under match rules
  useEffect(() => {
    if (!availableCategories.includes(selectedWeapon.category)) {
      const legalGuns = RUSH_WEAPONS.filter((w) => availableCategories.includes(w.category));
      if (legalGuns.length > 0) {
        onSelectWeapon(legalGuns[0]);
        setActiveCategory(legalGuns[0].category);
      }
    }
  }, [availableCategories, selectedWeapon, onSelectWeapon]);

  // Keyboard shortcut: Enter or Space to start
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Enter' || e.code === 'Space') {
        e.preventDefault();
        onDeploy();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onDeploy]);

  const weaponsInCat = getWeaponsByCategory(activeCategory);

  const handleCategoryChange = (cat: WeaponCategory) => {
    setActiveCategory(cat);
    const guns = getWeaponsByCategory(cat);
    if (guns.length > 0 && selectedWeapon.category !== cat) {
      onSelectWeapon(guns[0]);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex flex-col justify-between p-6 pointer-events-auto bg-gradient-to-t from-black/90 via-black/40 to-black/70 select-none overflow-y-auto">
      {/* Top Header */}
      <div className="flex items-center justify-between pb-4 border-b border-slate-800 max-w-5xl mx-auto w-full">
        <div className="flex items-center gap-3">
          <button
            onClick={onBackToSetup}
            className="p-2.5 bg-slate-900 border border-slate-700 hover:border-slate-500 text-slate-300 hover:text-white rounded-xl transition-colors cursor-pointer flex items-center gap-1.5 text-xs font-bold"
          >
            <ArrowLeft className="w-4 h-4" />
            GAME SETUP
          </button>
          <div>
            <h1 className="text-2xl font-black text-white uppercase tracking-wider flex items-center gap-2">
              <Crosshair className="w-6 h-6 text-amber-400" />
              SELECT RUSHKILL ARSENAL
            </h1>
            <p className="text-xs text-slate-400">
              Equip your primary firearm for the Hijacked yacht match
            </p>
          </div>
        </div>

        {/* Category Restrictions Badge */}
        {config.allowedCategories.length < 4 && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-mono font-bold">
            <ShieldAlert className="w-4 h-4" />
            <span>RESTRICTED LOADOUTS ACTIVE</span>
          </div>
        )}
      </div>

      {/* Center Armory Card */}
      <div className="max-w-5xl mx-auto w-full my-auto bg-slate-950/90 border border-slate-800 rounded-2xl p-6 shadow-2xl backdrop-blur-none">
        {/* Category Tabs */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <span className="text-xs font-mono font-bold text-slate-400 uppercase tracking-widest">
            AVAILABLE WEAPON CLASSES:
          </span>

          <div className="flex gap-2">
            {availableCategories.map((cat) => (
              <button
                key={cat}
                onClick={() => handleCategoryChange(cat)}
                className={`px-4 py-2 rounded-xl text-xs font-black tracking-wider uppercase transition-all cursor-pointer ${
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-5">
          {weaponsInCat.map((weapon) => {
            const isSelected = selectedWeapon.id === weapon.id;
            return (
              <div
                key={weapon.id}
                onClick={() => onSelectWeapon(weapon)}
                className={`p-4 rounded-xl border transition-all cursor-pointer flex flex-col justify-between ${
                  isSelected
                    ? 'bg-amber-950/40 border-amber-400 shadow-xl shadow-amber-500/25 ring-1 ring-amber-400/50'
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

                  <h3 className="text-xl font-black text-white mt-2 uppercase tracking-wide">{weapon.name}</h3>
                  <div className="text-[10px] font-mono font-bold text-amber-400 mt-0.5">{weapon.features}</div>
                  <p className="text-[11px] text-slate-400 line-clamp-2 mt-1.5 leading-snug">{weapon.description}</p>
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

        {/* Selected Weapon & Final Deploy Handshake */}
        <div className="mt-6 pt-4 border-t border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-400 font-mono">SELECTED:</span>
            <span className="px-3.5 py-1.5 rounded-xl bg-slate-900 border border-slate-700 font-bold text-amber-400 text-sm">
              {selectedWeapon.name} ({selectedWeapon.category}) • {selectedWeapon.features}
            </span>
          </div>

          <button
            data-start="true"
            onClick={onDeploy}
            className="px-8 py-3.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black font-black tracking-widest text-base uppercase rounded-xl shadow-lg shadow-amber-500/30 flex items-center gap-2 transform active:scale-95 transition-all cursor-pointer"
          >
            <Play className="w-5 h-5 fill-current" />
            DEPLOY TO THE YACHT
          </button>
        </div>
      </div>

      {/* Bottom Flat Control Hint Line */}
      <div className="text-center pt-2">
        <p className="text-xs font-mono font-medium tracking-wide text-slate-400 drop-shadow-[0_1px_4px_rgba(0,0,0,0.9)]">
          WASD Move • Space Jump / Bhop • Shift Slide • Right-Click ADS • Left-Click Shoot • R Reload • F Lock Mouse • Esc Pause
        </p>
      </div>
    </div>
  );
};
