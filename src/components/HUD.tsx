import React, { useEffect, useState } from 'react';
import { PlayerStats, WeaponDef, KillfeedEntry, StreakBanner, HitmarkerData, FloatingDamage } from '../game/types';
import { respawnProgress } from '../game/respawn';
import { Volume2, VolumeX, Pause, Zap, Award } from 'lucide-react';
import { sound } from '../game/audio';

interface HUDProps {
  stats: PlayerStats;
  weapon: WeaponDef;
  killfeed: KillfeedEntry[];
  streakBanners: StreakBanner[];
  hitmarker: HitmarkerData | null;
  floatingDamages: FloatingDamage[];
  matchTimeSec: number;
  scoreLimit: number;
  minimapData: {
    playerPos: { x: number; z: number; angle: number };
    bots: { id: string; x: number; z: number; isDead: boolean }[];
  } | null;
  fpsOverlay?: React.ReactNode;
  onPause: () => void;
}

export const HUD: React.FC<HUDProps> = ({
  stats,
  weapon,
  killfeed,
  streakBanners,
  hitmarker,
  floatingDamages,
  matchTimeSec,
  scoreLimit,
  minimapData,
  fpsOverlay,
  onPause,
}) => {
  const [ghostHp, setGhostHp] = useState(stats.hp);
  const [isMuted, setIsMuted] = useState(sound.getIsMuted());
  const [showHitmarker, setShowHitmarker] = useState(false);

  // Reactive hitmarker expiry (was Date.now() inside render, which only
  // re-evaluated if something else happened to re-render the HUD).
  useEffect(() => {
    if (!hitmarker) return;
    setShowHitmarker(true);
    const t = setTimeout(() => setShowHitmarker(false), 160);
    return () => clearTimeout(t);
  }, [hitmarker]);

  // Trailing ghost health bar
  useEffect(() => {
    if (stats.hp < ghostHp) {
      const timer = setTimeout(() => {
        setGhostHp(stats.hp);
      }, 450);
      return () => clearTimeout(timer);
    } else {
      setGhostHp(stats.hp);
    }
  }, [stats.hp, ghostHp]);

  // Format match timer
  const minutes = Math.floor(matchTimeSec / 60);
  const seconds = Math.floor(matchTimeSec % 60);
  const timerStr = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

  const toggleMute = () => {
    const m = sound.toggleMute();
    setIsMuted(m);
  };

  const isSniperScoped = weapon.category === 'Sniper' && stats.isAds;

  return (
    <div className="fixed inset-0 pointer-events-none select-none z-30 overflow-hidden">
      {/* 0. DEATH / RESPAWN OVERLAY */}
      {stats.respawnTimeRemaining > 0 && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-slate-950/65 backdrop-blur-[2px] pointer-events-none">
          <div className="text-red-500 font-black text-5xl max-sm:text-3xl tracking-[0.2em] drop-shadow-[0_0_18px_rgba(239,68,68,0.6)]">
            ELIMINATED
          </div>
          <div className="mt-4 font-mono text-white text-2xl max-sm:text-lg tracking-widest">
            RESPAWNING
          </div>
          <div className="mt-3 w-72 max-sm:w-56 h-2.5 bg-slate-900 rounded-full overflow-hidden border border-slate-700">
            <div
              className="h-full bg-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.7)] transition-all duration-100 ease-linear"
              style={{ width: `${respawnProgress(stats.respawnTimeRemaining) * 100}%` }}
            />
          </div>
          <div className="mt-2 text-slate-400 text-xs font-mono tracking-widest uppercase">
            Stay sharp. The yacht is not done with you.
          </div>
        </div>
      )}

      {/* 1. SNIPER SCOPE OVERLAY (When Aiming Down Sights with Sniper) */}
      {isSniperScoped && (
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
          {/* Outer Black Vignette */}
          <div className="absolute inset-0 bg-black/95 [mask-image:radial-gradient(circle_at_center,transparent_220px,black_280px)]" />

          {/* Scope Reticle Circle (viewport-relative so it fits short windows) */}
          <div className="w-[min(460px,72vmin)] h-[min(460px,72vmin)] rounded-full border-2 border-black/80 shadow-[0_0_50px_rgba(0,0,0,0.9)] relative flex items-center justify-center">
            {/* Center Crosshair Lines */}
            <div className="absolute w-full h-[1.5px] bg-black/90" />
            <div className="absolute h-full w-[1.5px] bg-black/90" />

            {/* Mil-dot Markings */}
            <div className="absolute w-2 h-2 rounded-full bg-red-600 shadow-[0_0_6px_red]" />
            <div className="absolute w-1.5 h-1.5 rounded-full bg-black/80 -translate-y-8" />
            <div className="absolute w-1.5 h-1.5 rounded-full bg-black/80 translate-y-8" />
            <div className="absolute w-1.5 h-1.5 rounded-full bg-black/80 -translate-x-8" />
            <div className="absolute w-1.5 h-1.5 rounded-full bg-black/80 translate-x-8" />

            <div className="absolute bottom-6 font-mono text-[10px] tracking-widest text-emerald-400 font-bold bg-black/70 px-2 py-0.5 rounded">
              .50 CAL OPTIC • {weapon.name}
            </div>
          </div>
        </div>
      )}

      {/* 2. DYNAMIC CROSSHAIR & HITMARKER (Non-scoped) */}
      {!isSniperScoped && (
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
          {/* ADS dot for non-sniper weapons (crosshair is otherwise empty when ADS) */}
          {stats.isAds && (
            <div className="w-[3px] h-[3px] rounded-full bg-emerald-400 shadow-[0_0_3px_black]" />
          )}

          {/* Dynamic Crosshair Spread based on speed and ADS */}
          {!stats.isAds && (
            <div className="relative w-8 h-8 flex items-center justify-center">
              <div
                className="absolute w-[2px] h-[9px] bg-emerald-400 shadow-[0_0_2px_black]"
                style={{
                  transform: `translateY(-${10 + stats.speed * 0.4}px)`,
                }}
              />
              <div
                className="absolute w-[2px] h-[9px] bg-emerald-400 shadow-[0_0_2px_black]"
                style={{
                  transform: `translateY(${10 + stats.speed * 0.4}px)`,
                }}
              />
              <div
                className="absolute h-[2px] w-[9px] bg-emerald-400 shadow-[0_0_2px_black]"
                style={{
                  transform: `translateX(-${10 + stats.speed * 0.4}px)`,
                }}
              />
              <div
                className="absolute h-[2px] w-[9px] bg-emerald-400 shadow-[0_0_2px_black]"
                style={{
                  transform: `translateX(${10 + stats.speed * 0.4}px)`,
                }}
              />
              {/* Center Dot */}
              <div className="w-[3px] h-[3px] rounded-full bg-amber-400 shadow-[0_0_3px_black]" />
            </div>
          )}

          {/* Hitmarker 'X' Tick Animation */}
          {hitmarker && showHitmarker && (
            <div className="absolute -inset-4 flex items-center justify-center animate-in zoom-in-75 duration-75">
              <svg viewBox="0 0 32 32" className="w-8 h-8">
                <line
                  x1="8"
                  y1="8"
                  x2="24"
                  y2="24"
                  stroke={hitmarker.isKill ? '#ef4444' : hitmarker.isHeadshot ? '#eab308' : '#ffffff'}
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />
                <line
                  x1="24"
                  y1="8"
                  x2="8"
                  y2="24"
                  stroke={hitmarker.isKill ? '#ef4444' : hitmarker.isHeadshot ? '#eab308' : '#ffffff'}
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />
              </svg>
            </div>
          )}
        </div>
      )}

      {/* 3. FLOATING DAMAGE COMBAT NUMBERS */}
      {floatingDamages.map((dmg) => (
        <div
          key={dmg.id}
          className="absolute font-mono font-black pointer-events-none transition-all duration-300"
          style={{
            left: `${dmg.screenX}px`,
            top: `${dmg.screenY - 20}px`,
            opacity: dmg.opacity,
            transform: 'translate(-50%, -50%)',
          }}
        >
          <span
            className={`text-lg drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)] ${
              dmg.isHeadshot ? 'text-amber-300 text-xl font-extrabold' : 'text-white'
            }`}
          >
            {dmg.isHeadshot ? `CRIT! ${dmg.damage}` : dmg.damage}
          </span>
        </div>
      ))}

      {/* 4. TOP-LEFT CLUSTER: MINIMAP & STATUS */}
      <div className="absolute top-[max(1.25rem,env(safe-area-inset-top))] left-[max(1.25rem,env(safe-area-inset-left))] flex flex-col gap-2 max-sm:scale-90 max-sm:origin-top-left">
        {/* Yacht Minimap */}
        {minimapData && (
          <div className="w-36 h-48 bg-slate-950/80 border border-slate-700/80 rounded-xl p-1.5 shadow-xl relative overflow-hidden">
            <div className="text-[9px] font-mono font-bold text-slate-400 uppercase tracking-widest text-center mb-1">
              HIJACKED RADAR
            </div>
            {/* Superyacht Top-Down Wireframe */}
            <div className="relative w-full h-36 bg-slate-900/60 rounded-lg border border-slate-800 flex items-center justify-center">
              {/* Yacht Hull Silhouette (proportional to 24.4m x 110m footprint) */}
              <div className="absolute w-8 h-32 border border-slate-600 rounded-t-full rounded-b-md bg-slate-800/40" />
              {/* Central Cabin Box */}
              <div className="absolute w-6 h-16 border border-amber-500/40 bg-amber-500/10 rounded-sm" />
              {/* Helipad 'H' */}
              <div className="absolute top-3 w-6 h-6 rounded-full border border-yellow-400/50 flex items-center justify-center text-[7px] font-bold text-yellow-400">
                H
              </div>
              {/* Jacuzzi Pool */}
              <div className="absolute bottom-3 w-5 h-5 rounded-sm border border-cyan-400/50 bg-cyan-400/20" />

              {/* Bot Blips */}
              {minimapData.bots.map((b) => {
                if (b.isDead) return null;
                // Map coordinates: X: -13 to +13, Z: -55 to +55 -> Minimap bounds
                const normX = 50 + (b.x / 26) * 40;
                const normY = 50 + (b.z / 110) * 80;
                return (
                  <div
                    key={b.id}
                    className="absolute w-2 h-2 rounded-full bg-red-500 shadow-[0_0_4px_red] -translate-x-1/2 -translate-y-1/2"
                    style={{ left: `${normX}%`, top: `${normY}%` }}
                  />
                );
              })}

              {/* Player Dot + facing indicator (angle was previously ignored) */}
              <div
                className="absolute w-2.5 h-2.5 rounded-full bg-cyan-400 shadow-[0_0_6px_cyan] -translate-x-1/2 -translate-y-1/2 z-10 border border-white/60"
                style={{
                  left: `${50 + (minimapData.playerPos.x / 26) * 40}%`,
                  top: `${50 + (minimapData.playerPos.z / 110) * 80}%`,
                }}
              />
              <svg
                viewBox="0 0 20 20"
                className="absolute w-5 h-5 z-10 pointer-events-none"
                style={{
                  left: `calc(${50 + (minimapData.playerPos.x / 26) * 40}% - 10px)`,
                  top: `calc(${50 + (minimapData.playerPos.z / 110) * 80}% - 10px)`,
                  transform: `rotate(${(minimapData.playerPos.angle * 180) / Math.PI}deg)`,
                }}
              >
                <path d="M10 1 L14 12 L10 9 L6 12 Z" fill="rgba(165,243,252,0.9)" />
              </svg>
            </div>
          </div>
        )}
      </div>

      {/* 5. TOP-CENTER UTILITIES & MATCH TIMER */}
      <div className="absolute top-5 left-1/2 -translate-x-1/2 flex items-center gap-4 pointer-events-auto z-40">
        {/* Match Timer & Target Score */}
        <div className="flex items-center gap-3 bg-slate-950/85 border border-slate-800 px-4 py-2 rounded-xl shadow-lg">
          <div className="text-center">
            <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-widest">TIME</span>
            <span className="font-mono font-bold text-amber-400 text-sm tabular-nums">{timerStr}</span>
          </div>
          <div className="w-[1px] h-6 bg-slate-700" />
          <div className="text-center">
            <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-widest">SCORE GOAL</span>
            <span className="font-mono font-bold text-white text-sm tabular-nums">
              {stats.kills} / {scoreLimit}
            </span>
          </div>
        </div>

        {/* Top Utility Buttons */}
        <div className="flex items-center gap-1 bg-slate-950/85 border border-slate-800 p-1 rounded-xl shadow-lg pointer-events-auto">
          <button
            onClick={(e) => {
              e.stopPropagation();
              toggleMute();
            }}
            aria-label="Toggle Mute"
            title="Toggle Mute (M)"
            className="p-2 hover:bg-slate-800 text-slate-300 hover:text-white rounded-lg transition-colors cursor-pointer pointer-events-auto focus-visible:outline-2 focus-visible:outline-amber-400"
          >
            {isMuted ? (
              <VolumeX className="w-4 h-4 text-red-400 pointer-events-none" />
            ) : (
              <Volume2 className="w-4 h-4 text-emerald-400 pointer-events-none" />
            )}
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onPause();
            }}
            aria-label="Pause Game"
            title="Pause Game (P)"
            className="p-2 hover:bg-slate-800 text-slate-300 hover:text-white rounded-lg transition-colors cursor-pointer pointer-events-auto focus-visible:outline-2 focus-visible:outline-amber-400"
          >
            <Pause className="w-4 h-4 pointer-events-none" />
          </button>
        </div>
      </div>

      {/* 6. TOP-RIGHT CLUSTER: REAL-TIME KILLFEED */}
      <div className="absolute top-[max(1.25rem,env(safe-area-inset-top))] right-[max(1.25rem,env(safe-area-inset-right))] flex flex-col gap-1.5 max-w-xs w-72 max-sm:w-52">
        {killfeed.slice(-4).map((entry) => (
          <div
            key={entry.id}
            className={`px-3 py-1.5 rounded-lg border text-xs font-mono flex items-center justify-between shadow-md transition-all animate-in fade-in duration-200 ${
              entry.isPlayerKiller
                ? 'bg-amber-950/70 border-amber-500/50 text-amber-200'
                : entry.isPlayerVictim
                ? 'bg-red-950/70 border-red-500/50 text-red-200'
                : 'bg-slate-950/75 border-slate-800 text-slate-300'
            }`}
          >
            <span className="font-bold truncate max-w-[80px]">{entry.killer}</span>
            <span className="text-[10px] px-1 py-0.2 rounded bg-black/50 text-slate-400 border border-slate-700/60 mx-1 flex items-center gap-1">
              {entry.weapon}
              {entry.isHeadshot && <span className="text-yellow-400 font-bold">HS</span>}
            </span>
            <span className="truncate max-w-[80px] text-right">{entry.victim}</span>
          </div>
        ))}
      </div>

      {/* 7. CENTER-SCREEN STREAK NOTIFICATIONS */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 pointer-events-none">
        {streakBanners.slice(-2).map((banner) => (
          <div
            key={banner.id}
            className="px-6 py-2 rounded-xl bg-gradient-to-r from-amber-600 via-amber-500 to-amber-600 border border-amber-300 text-black shadow-xl shadow-amber-500/30 font-black tracking-widest text-sm flex items-center gap-2 uppercase animate-in zoom-in-95 duration-150"
          >
            <Award className="w-4 h-4" />
            <span>{banner.text}</span>
            <span className="text-xs bg-black/20 px-1.5 py-0.5 rounded font-mono">+{banner.points}</span>
          </div>
        ))}
      </div>

      {/* 8. BOTTOM-LEFT CLUSTER: HEALTH & SPEEDOMETER */}
      <div className="absolute bottom-[max(1.5rem,env(safe-area-inset-bottom))] left-[max(1.5rem,env(safe-area-inset-left))] flex flex-col gap-2 max-w-sm max-sm:max-w-[60vw]">
        {/* Slide / Bhop Indicator */}
        {stats.isSliding && (
          <div className="px-3 py-1 rounded bg-amber-500/90 border border-amber-300 text-black font-black text-xs uppercase tracking-widest self-start flex items-center gap-1.5 shadow-lg shadow-amber-500/30">
            <Zap className="w-3.5 h-3.5" />
            SLIDING
          </div>
        )}

        <div className="bg-slate-950/85 border border-slate-800 p-4 rounded-2xl shadow-2xl flex flex-col gap-2.5">
          <div className="flex items-baseline justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs font-black text-emerald-400 tracking-wider">HP</span>
              <span className="font-mono text-2xl font-black text-white tabular-nums">{stats.hp}</span>
              <span className="text-xs text-slate-500 font-mono">/ {stats.maxHp}</span>
            </div>
            <div className="text-[11px] font-mono text-slate-400 font-bold">
              SPEED: <span className="text-amber-400">{stats.speed} m/s</span>
            </div>
          </div>

          {/* Health Bar with delayed Ghost Bar */}
          <div className="relative w-56 h-3 bg-slate-900 rounded-full overflow-hidden border border-slate-700/80">
            {/* Trailing Ghost Bar */}
            <div
              className="absolute left-0 top-0 bottom-0 bg-red-400/80 transition-all duration-300"
              style={{ width: `${(ghostHp / stats.maxHp) * 100}%` }}
            />
            {/* Active Green Health Bar */}
            <div
              className="absolute left-0 top-0 bottom-0 bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-75"
              style={{ width: `${(stats.hp / stats.maxHp) * 100}%` }}
            />
          </div>

          {/* Killstreak pips */}
          <div className="flex items-center gap-1 text-[10px] font-mono text-slate-400 pt-1 border-t border-slate-800">
            <span>STREAK:</span>
            <span className="font-bold text-amber-400">{stats.streak}</span>
            <span className="text-slate-600">•</span>
            <span>K/D:</span>
            <span className="font-bold text-white">
              {stats.deaths === 0 ? stats.kills.toFixed(2) : (stats.kills / stats.deaths).toFixed(2)}
            </span>
          </div>
        </div>
      </div>

      {/* FPS readout overlay */}
      {fpsOverlay && (
        <div className="absolute bottom-28 right-6 pointer-events-none z-40">
          {fpsOverlay}
        </div>
      )}

      {/* 9. BOTTOM-RIGHT CLUSTER: WEAPON & AMMO */}
      <div className="absolute bottom-[max(1.5rem,env(safe-area-inset-bottom))] right-[max(1.5rem,env(safe-area-inset-right))] flex flex-col items-end gap-2 max-w-sm max-sm:max-w-[60vw]">
        <div className="bg-slate-950/85 border border-slate-800 p-4 rounded-2xl shadow-2xl flex flex-col items-end gap-1.5">
          {/* Weapon Name & Category Badge */}
          <div className="flex items-center gap-2">
            <span className="px-1.5 py-0.5 rounded bg-amber-500/20 border border-amber-500/40 text-amber-400 text-[10px] font-black uppercase tracking-wider">
              {weapon.category}
            </span>
            <span className="font-black text-white text-lg tracking-wide uppercase">{weapon.name}</span>
          </div>

          {/* Ammo Display */}
          <div className="flex items-baseline gap-2 font-mono">
            <span
              className={`text-4xl font-black tabular-nums tracking-tight ${
                stats.ammo <= 5 ? 'text-red-400 animate-pulse' : 'text-white'
              }`}
            >
              {stats.ammo}
            </span>
            <span className="text-slate-500 text-sm font-bold">/</span>
            <span className="text-slate-400 text-lg font-bold tabular-nums">
              {Number.isFinite(stats.reserveAmmo) ? stats.reserveAmmo : '∞'}
            </span>
          </div>

          {/* Reloading Progress Indicator */}
          {stats.isReloading && (
            <div className="w-full flex flex-col gap-1 mt-1">
              <span className="text-[10px] font-mono font-bold text-amber-400 tracking-widest text-center uppercase">
                RELOADING...
              </span>
              <div className="w-48 h-1.5 bg-slate-900 rounded-full overflow-hidden border border-slate-800">
                <div
                  className="h-full bg-amber-400 transition-all duration-75"
                  style={{ width: `${stats.reloadProgress * 100}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
