import React, { useState } from 'react';
import { GameSettings, WeaponDef } from '../game/types';
import { RUSH_WEAPONS } from '../game/weapons';
import { Play, RotateCcw, Home, Sliders, Volume2, VolumeX, Crosshair } from 'lucide-react';
import { sound } from '../game/audio';

interface PauseModalProps {
  settings: GameSettings;
  activeWeapon: WeaponDef;
  onUpdateSettings: (settings: GameSettings) => void;
  onSelectWeapon: (weapon: WeaponDef) => void;
  onResume: () => void;
  onRestart: () => void;
  onReturnTitle: () => void;
}

export const PauseModal: React.FC<PauseModalProps> = ({
  settings,
  activeWeapon,
  onUpdateSettings,
  onSelectWeapon,
  onResume,
  onRestart,
  onReturnTitle,
}) => {
  const [activeTab, setActiveTab] = useState<'settings' | 'loadout'>('settings');
  const [isMuted, setIsMuted] = useState(sound.getIsMuted());

  const handleSensitivityChange = (val: number) => {
    onUpdateSettings({ ...settings, mouseSensitivity: val });
  };

  const handleFovChange = (val: number) => {
    onUpdateSettings({ ...settings, fov: val });
  };

  const handleVolumeChange = (val: number) => {
    sound.setVolume(val);
    onUpdateSettings({ ...settings, masterVolume: val });
  };

  const toggleMute = () => {
    const m = sound.toggleMute();
    setIsMuted(m);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 pointer-events-auto select-none">
      <div className="max-w-xl w-full bg-slate-950 border border-slate-800 rounded-2xl shadow-2xl p-6 flex flex-col gap-5">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div>
            <h2 className="text-2xl font-black text-white uppercase tracking-wider">TACTICAL PAUSE</h2>
            <p className="text-xs text-slate-400">Match frozen • Adjust settings or switch your weapon</p>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => setActiveTab('settings')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase transition-colors cursor-pointer ${
                activeTab === 'settings' ? 'bg-amber-500 text-black' : 'bg-slate-900 text-slate-300'
              }`}
            >
              Settings
            </button>
            <button
              onClick={() => setActiveTab('loadout')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase transition-colors cursor-pointer ${
                activeTab === 'loadout' ? 'bg-amber-500 text-black' : 'bg-slate-900 text-slate-300'
              }`}
            >
              Switch Gun
            </button>
          </div>
        </div>

        {/* Tab 1: Settings */}
        {activeTab === 'settings' && (
          <div className="flex flex-col gap-4 py-2">
            {/* Mouse Sensitivity */}
            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between text-xs font-mono">
                <span className="text-slate-300 font-bold uppercase">Mouse Sensitivity</span>
                <span className="text-amber-400 font-bold">{settings.mouseSensitivity.toFixed(1)}</span>
              </div>
              <input
                type="range"
                min="0.5"
                max="5.0"
                step="0.1"
                value={settings.mouseSensitivity}
                onChange={(e) => handleSensitivityChange(parseFloat(e.target.value))}
                className="w-full accent-amber-500 cursor-pointer"
              />
            </div>

            {/* Field of View */}
            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between text-xs font-mono">
                <span className="text-slate-300 font-bold uppercase">Field of View (FOV)</span>
                <span className="text-amber-400 font-bold">{settings.fov}°</span>
              </div>
              <input
                type="range"
                min="75"
                max="115"
                step="1"
                value={settings.fov}
                onChange={(e) => handleFovChange(parseInt(e.target.value))}
                className="w-full accent-amber-500 cursor-pointer"
              />
            </div>

            {/* Master Volume */}
            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between text-xs font-mono">
                <span className="text-slate-300 font-bold uppercase flex items-center gap-1.5">
                  <Volume2 className="w-3.5 h-3.5 text-slate-400" />
                  Master Volume
                </span>
                <span className="text-amber-400 font-bold">{Math.round(settings.masterVolume * 100)}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={settings.masterVolume}
                onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                className="w-full accent-amber-500 cursor-pointer"
              />
            </div>

            {/* Audio Mute quick toggle */}
            <div className="flex items-center justify-between pt-2 border-t border-slate-800/80">
              <span className="text-xs text-slate-400 font-mono">Procedural Sound</span>
              <button
                onClick={toggleMute}
                className="px-3 py-1.5 bg-slate-900 border border-slate-700 text-xs font-bold rounded-lg text-slate-200 hover:text-white flex items-center gap-2 cursor-pointer"
              >
                {isMuted ? <VolumeX className="w-3.5 h-3.5 text-red-400" /> : <Volume2 className="w-3.5 h-3.5 text-emerald-400" />}
                {isMuted ? 'Unmute Audio' : 'Mute Audio'}
              </button>
            </div>

            {/* FPS readout toggle */}
            <div className="flex items-center justify-between pt-2 border-t border-slate-800/80">
              <span className="text-xs text-slate-400 font-mono">FPS readout</span>
              <button
                onClick={() => onUpdateSettings({ ...settings, showFps: !settings.showFps })}
                className="px-3 py-1.5 bg-slate-900 border border-slate-700 text-xs font-bold rounded-lg text-slate-200 hover:text-white cursor-pointer"
              >
                {settings.showFps ? 'Hide (on)' : 'Show (off)'}
              </button>
            </div>

            {/* Graphics quality tri-state */}
            <div className="flex flex-col gap-1.5 pt-2 border-t border-slate-800/80">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400 font-mono">Graphics quality</span>
                <div className="flex gap-1.5">
                  {(['auto', 'high', 'low'] as const).map((opt) => (
                    <button
                      key={opt}
                      onClick={() => onUpdateSettings({ ...settings, graphicsPreset: opt })}
                      className={`px-3 py-1.5 text-xs font-bold rounded-lg border cursor-pointer transition-colors ${
                        settings.graphicsPreset === opt
                          ? 'bg-amber-500 text-black border-amber-400'
                          : 'bg-slate-900 text-slate-200 border-slate-700 hover:text-white'
                      }`}
                    >
                      {opt === 'auto' ? 'Auto' : opt === 'high' ? 'High' : 'Low'}
                    </button>
                  ))}
                </div>
              </div>
              <span className="text-[10px] text-slate-500 font-mono">Applies immediately</span>
            </div>
          </div>
        )}

        {/* Tab 2: In-Game Loadout Switcher */}
        {activeTab === 'loadout' && (
          <div className="grid grid-cols-2 gap-2 max-h-60 overflow-y-auto pr-1">
            {RUSH_WEAPONS.map((w) => {
              const isEquipped = activeWeapon.id === w.id;
              return (
                <div
                  key={w.id}
                  onClick={() => onSelectWeapon(w)}
                  className={`p-2.5 rounded-xl border transition-all cursor-pointer flex flex-col justify-between ${
                    isEquipped
                      ? 'bg-amber-950/40 border-amber-400'
                      : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-white">{w.name}</span>
                    <span className="text-[10px] px-1 py-0.2 rounded bg-black/60 text-amber-400 font-mono font-bold">
                      {w.category}
                    </span>
                  </div>
                  <div className="flex items-center justify-between mt-2 text-[10px] font-mono text-slate-400">
                    <span>DMG: {w.damage}</span>
                    <span>RPM: {w.fireRateRpm}</span>
                    <span>MAG: {w.magSize}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center justify-between pt-4 border-t border-slate-800">
          <div className="flex gap-2">
            <button
              onClick={onRestart}
              className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 text-xs font-bold uppercase rounded-xl flex items-center gap-2 transition-colors cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              Restart Match
            </button>
            <button
              onClick={onReturnTitle}
              className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 text-xs font-bold uppercase rounded-xl flex items-center gap-2 transition-colors cursor-pointer"
            >
              <Home className="w-4 h-4" />
              Main Menu
            </button>
          </div>

          <button
            onClick={onResume}
            className="px-6 py-2.5 bg-amber-500 hover:bg-amber-400 text-black font-black uppercase text-xs tracking-wider rounded-xl shadow-lg shadow-amber-500/20 flex items-center gap-2 transition-transform active:scale-95 cursor-pointer"
          >
            <Play className="w-4 h-4 fill-current" />
            Resume
          </button>
        </div>
      </div>
    </div>
  );
};
