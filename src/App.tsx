import React, { useEffect, useRef, useState, useCallback } from 'react';
import { GameEngine } from './game/engine';
import {
  WeaponDef,
  PlayerStats,
  KillfeedEntry,
  StreakBanner,
  HitmarkerData,
  FloatingDamage,
  GameSettings,
  GameState,
  MatchConfig,
  MenuScreen,
} from './game/types';
import { RUSH_WEAPONS } from './game/weapons';
import { MainMenu } from './components/MainMenu';
import { GameSetupScreen } from './components/GameSetupScreen';
import { LoadoutScreen } from './components/LoadoutScreen';
import { HUD } from './components/HUD';
import { PauseModal } from './components/PauseModal';
import { GameOverModal } from './components/GameOverModal';
import { AlertTriangle, RefreshCw } from 'lucide-react';

const DEFAULT_SETTINGS: GameSettings = {
  mouseSensitivity: 1.8,
  fov: 90,
  masterVolume: 0.7,
  showMinimap: true,
  showDamageNumbers: true,
  crosshairColor: '#00ffcc',
  showFps: true,
  graphicsPreset: 'auto',
};

const DEFAULT_MATCH_CONFIG: MatchConfig = {
  selectedMap: 'hijacked',
  timeLimitMinutes: 5,
  scoreLimit: 25,
  allowedCategories: ['AR', 'SMG', 'Shotgun', 'Sniper'],
  botCount: 6,
  botDifficulty: 'regular',
};

const INITIAL_STATS: PlayerStats = {
  hp: 100,
  maxHp: 100,
  ammo: 30,
  reserveAmmo: 120,
  isReloading: false,
  reloadProgress: 1,
  isAds: false,
  score: 0,
  kills: 0,
  deaths: 0,
  streak: 0,
  highestStreak: 0,
  headshots: 0,
  shotsFired: 0,
  shotsHit: 0,
  speed: 0,
  isSliding: false,
  isGrounded: true,
  respawnTimeRemaining: 0,
};

export default function App() {
  const mountRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<GameEngine | null>(null);

  const [gameState, setGameState] = useState<GameState>('title');
  const [menuScreen, setMenuScreen] = useState<MenuScreen>('main');
  const [matchConfig, setMatchConfig] = useState<MatchConfig>(DEFAULT_MATCH_CONFIG);
  const [selectedWeapon, setSelectedWeapon] = useState<WeaponDef>(RUSH_WEAPONS[0]);
  const [stats, setStats] = useState<PlayerStats>(INITIAL_STATS);
  const [killfeed, setKillfeed] = useState<KillfeedEntry[]>([]);
  const [streakBanners, setStreakBanners] = useState<StreakBanner[]>([]);
  const [hitmarker, setHitmarker] = useState<HitmarkerData | null>(null);
  const [floatingDamages, setFloatingDamages] = useState<FloatingDamage[]>([]);
  const [settings, setSettings] = useState<GameSettings>(DEFAULT_SETTINGS);
  const [matchOutcome, setMatchOutcome] = useState<'player' | 'bots' | 'draw'>('player');
  const [isPointerLocked, setIsPointerLocked] = useState(false);
  const [minimapData, setMinimapData] = useState<{
    playerPos: { x: number; z: number; angle: number };
    bots: { id: string; x: number; z: number; isDead: boolean }[];
  } | null>(null);
  const [fpsSample, setFpsSample] = useState<{ fps: number; frameMs: number; calls: number } | null>(null);
  const [webGlError, setWebGlError] = useState<string | null>(null);
  const [engineRetryKey, setEngineRetryKey] = useState<number>(0);

  // Sync state machine to document.body.dataset.state
  useEffect(() => {
    document.body.dataset.state = gameState;
  }, [gameState]);

  // Clean expired floating damages & banners
  useEffect(() => {
    const timer = setInterval(() => {
      const now = Date.now();
      setStreakBanners((prev) => prev.filter((b) => now - b.timestamp < 3000));
      setFloatingDamages((prev) => prev.filter((d) => now - parseInt(d.id.split('_')[1] || '0') < 700));
    }, 200);
    return () => clearInterval(timer);
  }, []);

  // Initialize Engine once on mount or upon retry
  useEffect(() => {
    if (!mountRef.current) return;
    setWebGlError(null);

    let engine: GameEngine | null = null;
    try {
      engine = new GameEngine(mountRef.current, settings, {
        onStatsUpdate: (newStats) => {
          setStats({ ...newStats });
        },
        onKillfeed: (entry) => {
          setKillfeed((prev) => [...prev.slice(-6), entry]);
        },
        onStreakBanner: (banner) => {
          setStreakBanners((prev) => [...prev, banner]);
        },
        onHitmarker: (data) => {
          setHitmarker(data);
        },
        onFloatingDamage: (dmg) => {
          setFloatingDamages((prev) => [...prev.slice(-8), dmg]);
        },
        onMatchEnd: (winner) => {
          setMatchOutcome(winner);
          setGameState('gameover');
          engine?.exitPointerLock();
        },
        onMinimapUpdate: (playerPos, bots) => {
          setMinimapData({ playerPos, bots });
        },
        onPointerLockChange: (locked) => {
          setIsPointerLocked(locked);
        },
        onWebGLError: (errMsg) => {
          setWebGlError(errMsg);
        },
        onFpsSample: (sample) => {
          setFpsSample(sample || null);
        },
      });

      if (engine.webGlFailed) {
        setWebGlError('WebGL hardware context could not be acquired.');
      } else {
        engineRef.current = engine;
      }
    } catch (err: unknown) {
      console.error('Failed to instantiate GameEngine:', err);
      const msg = err instanceof Error ? err.message : 'WebGL context could not be created.';
      setWebGlError(msg);
    }

    // Support ?autostart=1 query param
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('autostart') === '1' && engine && !engine.webGlFailed) {
      setTimeout(() => {
        engine?.startMatch(DEFAULT_MATCH_CONFIG);
        setGameState('playing');
      }, 100);
    }

    return () => {
      if (engine) {
        engine.destroy();
      }
      engineRef.current = null;
    };
  }, [engineRetryKey]);

  // Pause / Resume / Mouse Lock Keyboard listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Escape' || e.code === 'KeyP') {
        if (gameState === 'playing') {
          setGameState('paused');
          engineRef.current?.exitPointerLock();
        } else if (gameState === 'paused') {
          setGameState('playing');
          engineRef.current?.requestPointerLock(false);
        }
      }
      // CTRL + F explicitly toggles mouse lock during gameplay (suppresses browser find-in-page)
      if (e.ctrlKey && e.code === 'KeyF' && gameState === 'playing') {
        e.preventDefault();
        if (isPointerLocked) {
          engineRef.current?.exitPointerLock();
        } else {
          engineRef.current?.requestPointerLock(true);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [gameState, isPointerLocked]);

  // Actions
  const handleDeploy = useCallback(() => {
    if (!engineRef.current) return;
    engineRef.current.setWeapon(selectedWeapon);
    engineRef.current.startMatch(matchConfig);
    setGameState('playing');
  }, [selectedWeapon, matchConfig]);

  const handleSelectWeapon = useCallback((weapon: WeaponDef) => {
    setSelectedWeapon(weapon);
    if (engineRef.current) {
      engineRef.current.setWeapon(weapon);
    }
  }, []);

  const handleResume = useCallback(() => {
    setGameState('playing');
    engineRef.current?.requestPointerLock(true);
  }, []);

  const handleRestart = useCallback(() => {
    if (!engineRef.current) return;
    engineRef.current.startMatch(matchConfig);
    setFpsSample(null);
    setGameState('playing');
  }, [matchConfig]);

  const handleReturnTitle = useCallback(() => {
    if (!engineRef.current) return;
    engineRef.current.isTitleScreen = true;
    engineRef.current.exitPointerLock();
    setMenuScreen('main');
    setGameState('title');
  }, []);

  const handleUpdateSettings = useCallback((newSettings: GameSettings) => {
    setSettings(newSettings);
    if (engineRef.current) {
      engineRef.current.settings = newSettings;
      engineRef.current.applyGraphicsPreset(newSettings.graphicsPreset);
    }
  }, []);

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-transparent font-sans select-none">
      {/* Isolated Three.js WebGL Mount Container */}
      <div ref={mountRef} className="absolute inset-0 w-full h-full z-0" />

      {/* Menu Screens when in 'title' state */}
      {gameState === 'title' && (
        <>
          {menuScreen === 'main' && (
            <MainMenu
              selectedWeapon={selectedWeapon}
              onQuickPlay={handleDeploy}
              onOpenSetup={() => setMenuScreen('setup')}
              onOpenLoadout={() => setMenuScreen('loadout')}
              onOpenSettings={() => setGameState('paused')}
            />
          )}

          {menuScreen === 'setup' && (
            <GameSetupScreen
              config={matchConfig}
              onUpdateConfig={(newConfig) => setMatchConfig(newConfig)}
              onContinueToLoadout={() => setMenuScreen('loadout')}
              onBackToMenu={() => setMenuScreen('main')}
            />
          )}

          {menuScreen === 'loadout' && (
            <LoadoutScreen
              config={matchConfig}
              selectedWeapon={selectedWeapon}
              onSelectWeapon={handleSelectWeapon}
              onDeploy={handleDeploy}
              onBackToSetup={() => setMenuScreen('setup')}
            />
          )}
        </>
      )}

      {/* In-Game HUD (Visible during 'playing' and 'paused') */}
      {(gameState === 'playing' || gameState === 'paused') && (
        <HUD
          stats={stats}
          weapon={selectedWeapon}
          killfeed={killfeed}
          streakBanners={streakBanners}
          hitmarker={hitmarker}
          floatingDamages={floatingDamages}
          matchTimeSec={engineRef.current ? engineRef.current.matchTimeRemaining : 300}
          scoreLimit={engineRef.current ? engineRef.current.scoreLimit : 25}
          minimapData={minimapData}
          fpsOverlay={
            settings.showFps ? (
              <div className="pointer-events-none font-mono text-xs px-3 py-1.5 rounded-xl bg-slate-950/90 border border-slate-700 text-slate-200 shadow-lg">
                {fpsSample
                  ? `${fpsSample.fps.toFixed(0)} FPS • ${fpsSample.frameMs.toFixed(1)} ms • ${fpsSample.calls} calls`
                  : '…'}
              </div>
            ) : null
          }
          onPause={() => {
            setGameState('paused');
            engineRef.current?.exitPointerLock();
          }}
        />
      )}

      {/* Mouse Lock Hint (Non-interactive — pointer lock toggles ONLY with the F key) */}
      {gameState === 'playing' && !isPointerLocked && (
        <div className="absolute inset-0 z-20 pointer-events-auto flex items-center justify-center animate-in fade-in duration-300">
          <div className="bg-slate-950/95 border-2 border-amber-400 px-8 py-4 rounded-2xl shadow-2xl flex flex-col items-center gap-2 animate-pulse">
            <div className="w-3 h-3 rounded-full bg-amber-400" />
            <button
              onClick={(e) => {
                e.stopPropagation();
                engineRef.current?.requestPointerLock(true);
              }}
              className="px-4 py-1.5 bg-amber-500 hover:bg-amber-400 text-black font-black uppercase text-xs tracking-wider rounded-lg cursor-pointer"
            >
              Click here to lock mouse
            </button>
            <span className="font-mono text-sm font-black text-white tracking-widest uppercase">
              PRESS CTRL+F TO LOCK MOUSE
            </span>
            <span className="text-xs text-slate-400 font-mono">
              (Cursor confined to game window while locked)
            </span>
          </div>
        </div>
      )}

      {/* Pause / Settings Modal */}
      {gameState === 'paused' && (
        <PauseModal
          settings={settings}
          activeWeapon={selectedWeapon}
          onUpdateSettings={handleUpdateSettings}
          onSelectWeapon={handleSelectWeapon}
          onResume={handleResume}
          onRestart={handleRestart}
          onReturnTitle={handleReturnTitle}
        />
      )}

      {/* Game Over / Victory Modal */}
      {gameState === 'gameover' && (
        <GameOverModal
          winner={matchOutcome}
          stats={stats}
          weapon={selectedWeapon}
          onPlayAgain={handleRestart}
          onReturnTitle={handleReturnTitle}
        />
      )}

      {/* WebGL Context Loss / Error Diagnostic Overlay */}
      {webGlError && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/95 backdrop-blur-md p-6">
          <div className="max-w-lg w-full bg-slate-900 border-2 border-amber-500/80 rounded-2xl p-7 shadow-2xl text-white">
            <div className="flex items-center gap-3 text-amber-400 mb-4">
              <AlertTriangle className="w-8 h-8 shrink-0" />
              <div>
                <h2 className="text-xl font-black uppercase tracking-wider font-mono">
                  Graphics Notice
                </h2>
                <span className="text-xs text-amber-500/80 uppercase font-mono">WebGL Engine Fallback</span>
              </div>
            </div>
            <p className="text-sm text-slate-300 leading-relaxed mb-4">
              {webGlError}
            </p>
            <div className="bg-slate-950/80 rounded-xl p-4 border border-slate-800 text-xs text-slate-400 space-y-2 mb-6">
              <div className="font-semibold text-slate-200">Suggested Steps:</div>
              <ul className="list-disc list-inside space-y-1">
                <li>Make sure <span className="text-amber-300">Hardware Acceleration</span> is enabled in browser system settings.</li>
                <li>Close other tabs or background applications utilizing GPU resources.</li>
                <li>Click below to attempt re-initializing the 3D graphics context.</li>
              </ul>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setEngineRetryKey((k) => k + 1)}
                className="flex-1 py-3 px-5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-black uppercase tracking-widest text-xs flex items-center justify-center gap-2 transition-all transform active:scale-95 shadow-lg shadow-amber-500/20 cursor-pointer"
              >
                <RefreshCw className="w-4 h-4" />
                Retry Graphics Engine
              </button>
              <button
                onClick={() => window.location.reload()}
                className="py-3 px-5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold uppercase tracking-wider text-xs transition-all cursor-pointer"
              >
                Reload Tab
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
