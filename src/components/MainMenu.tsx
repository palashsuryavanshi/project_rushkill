import React, { useEffect, useState } from 'react';
import { Volume2, VolumeX, Play, Settings as SettingsIcon, Shield, Sliders, ChevronRight, Crosshair } from 'lucide-react';
import { sound } from '../game/audio';
import { WeaponDef } from '../game/types';

interface MainMenuProps {
  selectedWeapon: WeaponDef;
  onQuickPlay: () => void;
  onOpenSetup: () => void;
  onOpenLoadout: () => void;
  onOpenSettings: () => void;
}

export const MainMenu: React.FC<MainMenuProps> = ({
  selectedWeapon,
  onQuickPlay,
  onOpenSetup,
  onOpenLoadout,
  onOpenSettings,
}) => {
  const [isMuted, setIsMuted] = useState(sound.getIsMuted());

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Enter' || e.code === 'Space') {
        e.preventDefault();
        onQuickPlay();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onQuickPlay]);

  const toggleMute = () => {
    const m = sound.toggleMute();
    setIsMuted(m);
  };

  return (
    <div className="fixed inset-0 z-40 flex flex-col justify-between p-6 pointer-events-auto bg-gradient-to-t from-black/85 via-black/25 to-transparent select-none">
      {/* Top Header */}
      <div className="flex items-start justify-between">
        {/* Custom Inline SVG Title Lockup */}
        <div className="flex items-center gap-4">
          {/* Custom Logo */}
          <img src="/logo.png" alt="Project Rushkill" className="w-20 h-20 object-contain" />
          <div>
            <div className="flex items-center gap-2.5">
              <span className="text-4xl font-black tracking-wider text-white uppercase drop-shadow-[0_2px_12px_rgba(0,0,0,0.9)]">
                PROJECT
              </span>
              <span className="text-4xl font-black text-amber-400 uppercase tracking-wider drop-shadow-[0_2px_12px_rgba(245,158,11,0.4)]">
                RUSHKILL
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-slate-300 mt-0.5">
              <span className="px-2 py-0.5 rounded bg-black/60 border border-emerald-500/40 text-emerald-400">
                CUSTOM ARSENAL
              </span>
              <span>•</span>
              <span className="px-2 py-0.5 rounded bg-black/60 border border-emerald-500/40 text-white">
                HIJACKED-INSPIRED YACHT MAP
              </span>
            </div>
          </div>
        </div>

        {/* Audio Mute Button */}
        <button
          onClick={toggleMute}
          tabIndex={-1}
          aria-label="Toggle Sound"
          className="p-3 bg-black/70 border border-white/20 hover:border-amber-400 text-white rounded-xl transition-colors cursor-pointer shadow-lg"
        >
          {isMuted ? <VolumeX className="w-5 h-5 text-red-400" /> : <Volume2 className="w-5 h-5 text-emerald-400" />}
        </button>
      </div>

      {/* Center Left Navigation Menu */}
      <div className="max-w-md w-full flex flex-col gap-3 my-auto">
        {/* Current Equipped Weapon Badge */}
        <div className="bg-slate-950/80 border border-slate-800 px-4 py-2.5 rounded-xl flex items-center justify-between text-xs font-mono shadow-xl backdrop-blur-none mb-1">
          <span className="text-slate-400 flex items-center gap-2">
            <Crosshair className="w-4 h-4 text-amber-400" />
            ACTIVE LOADOUT:
          </span>
          <span className="text-amber-400 font-bold uppercase">
            {selectedWeapon.name} ({selectedWeapon.category})
          </span>
        </div>

        {/* 1. Quick Play Primary Action */}
        <button
          data-start="true"
          onClick={onQuickPlay}
          className="group px-6 py-4 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black font-black tracking-widest text-lg uppercase rounded-2xl shadow-xl shadow-amber-500/30 flex items-center justify-between transition-all transform active:scale-98 cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <Play className="w-6 h-6 fill-current" />
            <span>QUICK PLAY</span>
          </div>
          <span className="text-xs font-mono font-bold bg-black/20 px-2.5 py-1 rounded-lg">
            ENTER / SPACE
          </span>
        </button>

        {/* 2. Custom Game Setup */}
        <button
          onClick={onOpenSetup}
          className="group px-6 py-3.5 bg-slate-900/90 hover:bg-slate-800/90 border border-slate-700/80 hover:border-amber-400 text-white font-bold tracking-wider text-sm uppercase rounded-2xl shadow-lg flex items-center justify-between transition-all cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <Sliders className="w-5 h-5 text-amber-400" />
            <span>CUSTOM GAME SETUP</span>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-amber-400 group-hover:translate-x-0.5 transition-all" />
        </button>

        {/* 3. Loadout / Armory */}
        <button
          onClick={onOpenLoadout}
          className="group px-6 py-3.5 bg-slate-900/90 hover:bg-slate-800/90 border border-slate-700/80 hover:border-amber-400 text-white font-bold tracking-wider text-sm uppercase rounded-2xl shadow-lg flex items-center justify-between transition-all cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <Crosshair className="w-5 h-5 text-emerald-400" />
            <span>RUSHKILL ARMORY</span>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-emerald-400 group-hover:translate-x-0.5 transition-all" />
        </button>

        {/* 4. Settings */}
        <button
          onClick={onOpenSettings}
          className="group px-6 py-3.5 bg-slate-900/90 hover:bg-slate-800/90 border border-slate-700/80 hover:border-slate-500 text-slate-300 hover:text-white font-bold tracking-wider text-sm uppercase rounded-2xl shadow-lg flex items-center justify-between transition-all cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <SettingsIcon className="w-5 h-5 text-slate-400" />
            <span>GAME SETTINGS</span>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-white group-hover:translate-x-0.5 transition-all" />
        </button>
      </div>

      {/* Bottom Flat Control Hint Line */}
      <div className="text-center">
        <p className="text-xs font-mono font-medium tracking-wide text-slate-400 drop-shadow-[0_1px_4px_rgba(0,0,0,0.9)]">
          WASD Move • Space Jump / Bhop • Shift Slide • Right-Click ADS • Left-Click Shoot • R Reload • Ctrl+F Lock/Unlock Mouse • Esc Pause
        </p>
      </div>
    </div>
  );
};
