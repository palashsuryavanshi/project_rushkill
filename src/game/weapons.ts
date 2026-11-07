import { WeaponCategory, WeaponDef } from './types';

export const RUSH_WEAPONS: WeaponDef[] = [
  // --- ASSAULT RIFLES ---
  {
    id: 'mcw',
    name: 'MCW',
    category: 'AR',
    description: 'Iconic modular assault rifle with exceptional recoil control and crisp handling at medium ranges.',
    damage: 28,
    headshotMultiplier: 1.5,
    fireRateRpm: 715,
    magSize: 30,
    reserveAmmo: Infinity,
    reloadTimeSec: 2.1,
    hipSpread: 0.045,
    adsSpread: 0.003,
    adsZoomFov: 55,
    recoilVertical: 0.038,
    recoilHorizontal: 0.012,
    recoilRecoverySpeed: 10.0,
    bulletSpeed: 700,
    soundType: 'ar',
    colors: {
      primary: 0x22252a, // dark matte receiver
      secondary: 0x3d4148, // steel barrel & guard
      accent: 0xc49746, // tan accents / bronze
    },
    features: 'Laser Accuracy · Low Recoil',
  },
  {
    id: 'holger_556',
    name: 'Holger 556',
    category: 'AR',
    description: 'Heavy caliber 5.56 assault rifle delivering hard-hitting stopping power and outstanding long-range consistency.',
    damage: 34,
    headshotMultiplier: 1.55,
    fireRateRpm: 585,
    magSize: 30,
    reserveAmmo: Infinity,
    reloadTimeSec: 2.3,
    hipSpread: 0.05,
    adsSpread: 0.0025,
    adsZoomFov: 52,
    recoilVertical: 0.046,
    recoilHorizontal: 0.018,
    recoilRecoverySpeed: 8.5,
    bulletSpeed: 740,
    soundType: 'ar',
    colors: {
      primary: 0x1c1e22,
      secondary: 0x2d3238,
      accent: 0x7c8288,
    },
    features: 'High Damage · Heavy Caliber',
  },
  {
    id: 'sva_545',
    name: 'SVA 545',
    category: 'AR',
    description: 'Advanced rifle featuring a rapid two-round hyperburst on initial trigger pull before settling into automatic fire.',
    damage: 30,
    headshotMultiplier: 1.5,
    fireRateRpm: 685,
    magSize: 30,
    reserveAmmo: Infinity,
    reloadTimeSec: 2.2,
    hipSpread: 0.048,
    adsSpread: 0.0028,
    adsZoomFov: 55,
    recoilVertical: 0.042,
    recoilHorizontal: 0.015,
    recoilRecoverySpeed: 9.0,
    bulletSpeed: 710,
    soundType: 'ar',
    colors: {
      primary: 0x292827,
      secondary: 0x473b31, // Russian dark polymer & wood-composite
      accent: 0xb58e58,
    },
    features: 'Hyperburst · Deadly First-Shot',
  },
  {
    id: 'mtz_556',
    name: 'MTZ-556',
    category: 'AR',
    description: 'High rate-of-fire compact assault rifle engineered for aggressive close-quarters clearing and fast CQB trades.',
    damage: 26,
    headshotMultiplier: 1.45,
    fireRateRpm: 810,
    magSize: 30,
    reserveAmmo: Infinity,
    reloadTimeSec: 2.0,
    hipSpread: 0.044,
    adsSpread: 0.0035,
    adsZoomFov: 56,
    recoilVertical: 0.044,
    recoilHorizontal: 0.022,
    recoilRecoverySpeed: 10.5,
    bulletSpeed: 680,
    soundType: 'ar',
    colors: {
      primary: 0x1f2421,
      secondary: 0x36413e,
      accent: 0x5d737e,
    },
    features: 'Fast Fire Rate · CQB Dominance',
  },

  // --- SUBMACHINE GUNS (SMGs) ---
  {
    id: 'rival_9',
    name: 'Rival-9',
    category: 'SMG',
    description: 'Lightweight 9mm SMG boasting blistering maneuverability and rapid room-clearing agility favored by competitive rushers.',
    damage: 23,
    headshotMultiplier: 1.4,
    fireRateRpm: 910,
    magSize: 30,
    reserveAmmo: Infinity,
    reloadTimeSec: 1.7,
    hipSpread: 0.038,
    adsSpread: 0.004,
    adsZoomFov: 60,
    recoilVertical: 0.035,
    recoilHorizontal: 0.025,
    recoilRecoverySpeed: 12.0,
    bulletSpeed: 590,
    soundType: 'smg',
    colors: {
      primary: 0x181a1c,
      secondary: 0x2a3038,
      accent: 0x00bcd4, // cyan tactical accent
    },
    features: 'Maximum Mobility · Extreme Fire Rate',
  },
  {
    id: 'striker',
    name: 'Striker',
    category: 'SMG',
    description: 'Chambered in .45 Auto, this hard-hitting submachine gun delivers substantial stopping power with predictable recoil.',
    damage: 33,
    headshotMultiplier: 1.45,
    fireRateRpm: 645,
    magSize: 25,
    reserveAmmo: Infinity,
    reloadTimeSec: 1.9,
    hipSpread: 0.04,
    adsSpread: 0.0035,
    adsZoomFov: 58,
    recoilVertical: 0.048,
    recoilHorizontal: 0.028,
    recoilRecoverySpeed: 10.0,
    bulletSpeed: 560,
    soundType: 'smg',
    colors: {
      primary: 0x252528,
      secondary: 0x3b3d42,
      accent: 0x9e9e9e,
    },
    features: '.45 Auto Heavy Punch · High Range',
  },
  {
    id: 'wsp_swarm',
    name: 'WSP Swarm',
    category: 'SMG',
    description: 'Ultra-compact rapid-fire machine pistol that overwhelms close targets in a torrential hail of 9mm rounds.',
    damage: 19,
    headshotMultiplier: 1.35,
    fireRateRpm: 1090,
    magSize: 32,
    reserveAmmo: Infinity,
    reloadTimeSec: 1.6,
    hipSpread: 0.052,
    adsSpread: 0.006,
    adsZoomFov: 62,
    recoilVertical: 0.04,
    recoilHorizontal: 0.035,
    recoilRecoverySpeed: 13.0,
    bulletSpeed: 530,
    soundType: 'smg',
    colors: {
      primary: 0x1b1b1e,
      secondary: 0x2c2c34,
      accent: 0xe05638, // warning orange
    },
    features: '1090 RPM · Hipfire Shredder',
  },
  {
    id: 'amr9',
    name: 'AMR9',
    category: 'SMG',
    description: 'Full-auto 9mm submachine gun built on an AR platform, providing longer range and stable burst grouping.',
    damage: 25,
    headshotMultiplier: 1.4,
    fireRateRpm: 780,
    magSize: 30,
    reserveAmmo: Infinity,
    reloadTimeSec: 1.8,
    hipSpread: 0.042,
    adsSpread: 0.0038,
    adsZoomFov: 58,
    recoilVertical: 0.038,
    recoilHorizontal: 0.025,
    recoilRecoverySpeed: 11.0,
    bulletSpeed: 610,
    soundType: 'smg',
    colors: {
      primary: 0x21252b,
      secondary: 0x333842,
      accent: 0x61afef,
    },
    features: 'Hybrid SMG/AR · Extended Range',
  },

  // --- SHOTGUNS ---
  {
    id: 'lockwood_680',
    name: 'Lockwood 680',
    category: 'Shotgun',
    description: 'Reliable 12-gauge pump action shotgun firing lethal 8-pellet buckshot capable of single-blast point-blank eliminations.',
    damage: 18, // 8 pellets * 18 = 144 max point blank
    pellets: 8,
    headshotMultiplier: 1.25,
    fireRateRpm: 80, // pump delay ~0.75s
    magSize: 6,
    reserveAmmo: Infinity,
    reloadTimeSec: 2.5,
    hipSpread: 0.08,
    adsSpread: 0.045,
    adsZoomFov: 60,
    recoilVertical: 0.09,
    recoilHorizontal: 0.02,
    recoilRecoverySpeed: 6.0,
    bulletSpeed: 450,
    soundType: 'shotgun',
    colors: {
      primary: 0x1e1e20,
      secondary: 0x38393d,
      accent: 0x8b3a3a, // red shell tube accent
    },
    features: '1-Shot Point Blank · Devastating Pump',
  },
  {
    id: 'haymaker',
    name: 'Haymaker',
    category: 'Shotgun',
    description: 'Magazine-fed semi-automatic combat shotgun designed to saturate close quarters with relentless buckshot spreads.',
    damage: 10, // 8 pellets * 10 = 80 max
    pellets: 8,
    headshotMultiplier: 1.2,
    fireRateRpm: 210,
    magSize: 12,
    reserveAmmo: Infinity,
    reloadTimeSec: 2.4,
    hipSpread: 0.095,
    adsSpread: 0.055,
    adsZoomFov: 62,
    recoilVertical: 0.065,
    recoilHorizontal: 0.028,
    recoilRecoverySpeed: 8.0,
    bulletSpeed: 430,
    soundType: 'shotgun',
    colors: {
      primary: 0x23272a,
      secondary: 0x2c2f33,
      accent: 0xd4af37, // golden drum accents
    },
    features: 'Semi-Auto Drum · Crowd Smasher',
  },
  {
    id: 'riveter',
    name: 'Riveter',
    category: 'Shotgun',
    description: 'Full-auto .410 shotgun built on an assault rifle receiver, firing a high-speed continuous stream of combat pellets.',
    damage: 12, // 6 pellets * 12 = 72 max
    pellets: 6,
    headshotMultiplier: 1.25,
    fireRateRpm: 340,
    magSize: 15,
    reserveAmmo: Infinity,
    reloadTimeSec: 2.2,
    hipSpread: 0.088,
    adsSpread: 0.048,
    adsZoomFov: 60,
    recoilVertical: 0.055,
    recoilHorizontal: 0.025,
    recoilRecoverySpeed: 9.0,
    bulletSpeed: 460,
    soundType: 'shotgun',
    colors: {
      primary: 0x1d2125,
      secondary: 0x3b444b,
      accent: 0xe67e22,
    },
    features: 'Full-Auto Pellets · AR Frame',
  },

  // --- SNIPERS ---
  {
    id: 'longbow',
    name: 'Longbow',
    category: 'Sniper',
    description: 'Precision bolt-action sniper rifle with high capacity 25-round magazine and lightning-fast handling for quick-scoping.',
    damage: 110,
    headshotMultiplier: 1.8,
    fireRateRpm: 115,
    magSize: 25,
    reserveAmmo: Infinity,
    reloadTimeSec: 2.6,
    hipSpread: 0.12,
    adsSpread: 0.0005,
    adsZoomFov: 28,
    recoilVertical: 0.09,
    recoilHorizontal: 0.015,
    recoilRecoverySpeed: 6.0,
    bulletSpeed: 950,
    soundType: 'sniper',
    colors: {
      primary: 0x1f2227,
      secondary: 0x353b45,
      accent: 0x485260,
    },
    features: 'Quick-Scope Beast · 25-Rnd Mag',
  },
  {
    id: 'kv_inhibitor',
    name: 'KV Inhibitor',
    category: 'Sniper',
    description: 'Semi-automatic sniper rifle chambered in .338 Magnum, blending pinpoint sniper lethality with rapid follow-up potential.',
    damage: 95,
    headshotMultiplier: 1.9,
    fireRateRpm: 155,
    magSize: 10,
    reserveAmmo: Infinity,
    reloadTimeSec: 2.8,
    hipSpread: 0.11,
    adsSpread: 0.0008,
    adsZoomFov: 26,
    recoilVertical: 0.085,
    recoilHorizontal: 0.02,
    recoilRecoverySpeed: 7.0,
    bulletSpeed: 920,
    soundType: 'sniper',
    colors: {
      primary: 0x222426,
      secondary: 0x2e3338,
      accent: 0xa37f48, // desert bronze
    },
    features: 'Semi-Auto Precision · .338 Magnum',
  },
  {
    id: 'katt_amr',
    name: 'KATT-AMR',
    category: 'Sniper',
    description: 'Monstrous .50 caliber bolt-action anti-materiel rifle that guarantees instant lethal damage on any upper body hit.',
    damage: 160,
    headshotMultiplier: 2.2,
    fireRateRpm: 46,
    magSize: 5,
    reserveAmmo: Infinity,
    reloadTimeSec: 3.2,
    hipSpread: 0.16,
    adsSpread: 0.0002,
    adsZoomFov: 20,
    recoilVertical: 0.14,
    recoilHorizontal: 0.015,
    recoilRecoverySpeed: 4.5,
    bulletSpeed: 1100,
    soundType: 'sniper',
    colors: {
      primary: 0x151618,
      secondary: 0x282a2e,
      accent: 0xd9534f, // heavy warning red
    },
    features: '.50 Cal Anti-Materiel · Instant 1-Shot',
  },
];

export function getWeaponById(id: string): WeaponDef {
  const found = RUSH_WEAPONS.find((w) => w.id === id);
  return found || RUSH_WEAPONS[0];
}

export function getWeaponsByCategory(category: WeaponCategory): WeaponDef[] {
  return RUSH_WEAPONS.filter((w) => w.category === category);
}

/** Shotgun pellets do nothing beyond this range. */
export const SHOTGUN_CUTOFF_METERS = 20;

export function calculateShotDamage(
  weapon: WeaponDef,
  isHeadshot: boolean,
  distanceUnits: number
): number {
  // Shotguns are the only ranged weapon with a hard range limit.
  // Everything else keeps full damage across the whole yacht.
  if (weapon.category === 'Shotgun' && distanceUnits > SHOTGUN_CUTOFF_METERS) {
    return 0;
  }

  let baseDamage = weapon.damage;
  if (isHeadshot) {
    baseDamage *= weapon.headshotMultiplier;
  }

  return Math.max(1, Math.round(baseDamage));
}

/**
 * Total damage for one trigger pull. Shotguns apply their pellet count once;
 * a zero from the range cutoff stays zero instead of being floored to 1.
 */
export function calculateShotTotalDamage(
  weapon: WeaponDef,
  isHeadshot: boolean,
  distanceUnits: number
): number {
  const perPellet = calculateShotDamage(weapon, isHeadshot, distanceUnits);
  if (perPellet <= 0) return 0;
  const pellets = Math.max(1, weapon.pellets || 1);
  return Math.round(perPellet * pellets);
}
