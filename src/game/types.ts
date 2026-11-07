export type WeaponCategory = 'AR' | 'SMG' | 'Shotgun' | 'Sniper';

export interface WeaponDef {
  id: string;
  name: string;
  category: WeaponCategory;
  description: string;
  damage: number; // per shot (or per pellet for shotgun)
  pellets?: number; // for shotguns (e.g. 8)
  headshotMultiplier: number;
  fireRateRpm: number; // rounds per minute
  magSize: number;
  reserveAmmo: number;
  reloadTimeSec: number;
  hipSpread: number; // in radians
  adsSpread: number; // in radians
  adsZoomFov: number; // target FOV when ADS (e.g. 55 for AR, 30 for sniper)
  recoilVertical: number;
  recoilHorizontal: number;
  recoilRecoverySpeed: number;
  bulletSpeed: number; // units per second (hitscan-like or fast raycast)
  soundType: 'ar' | 'smg' | 'shotgun' | 'sniper';
  colors: {
    primary: number;
    secondary: number;
    accent: number;
  };
  features: string;
}

export interface PlayerStats {
  hp: number;
  maxHp: number;
  ammo: number;
  reserveAmmo: number;
  isReloading: boolean;
  reloadProgress: number;
  isAds: boolean;
  score: number;
  kills: number;
  deaths: number;
  streak: number;
  highestStreak: number;
  headshots: number;
  shotsFired: number;
  shotsHit: number;
  speed: number;
  isSliding: boolean;
  isGrounded: boolean;
  /** Seconds until respawn; 0 while alive. */
  respawnTimeRemaining: number;
}

export interface KillfeedEntry {
  id: string;
  killer: string;
  victim: string;
  weapon: string;
  isHeadshot: boolean;
  isPlayerKiller: boolean;
  isPlayerVictim: boolean;
  timestamp: number;
}

export interface StreakBanner {
  id: string;
  text: string;
  points: number;
  type: 'headshot' | 'streak' | 'multikill' | 'longshot' | 'revenge';
  timestamp: number;
}

export interface HitmarkerData {
  time: number;
  isHeadshot: boolean;
  isKill: boolean;
  damage: number;
}

export interface FloatingDamage {
  id: string;
  damage: number;
  isHeadshot: boolean;
  x: number;
  y: number;
  z: number;
  screenX: number;
  screenY: number;
  opacity: number;
}

export interface GameSettings {
  mouseSensitivity: number;
  fov: number;
  masterVolume: number;
  showMinimap: boolean;
  showDamageNumbers: boolean;
  crosshairColor: string;
  showFps: boolean;
  graphicsPreset: 'auto' | 'high' | 'low';
}

export type BotDifficulty = 'recruit' | 'regular' | 'veteran' | 'elite';

export interface MatchConfig {
  selectedMap: string;
  timeLimitMinutes: number; // 0 = unlimited
  scoreLimit: number;
  allowedCategories: WeaponCategory[];
  botCount: number;
  botDifficulty: BotDifficulty;
}

export type MenuScreen = 'main' | 'setup' | 'loadout' | 'settings';

export type GameState = 'title' | 'playing' | 'paused' | 'gameover';
