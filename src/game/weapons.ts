import { WeaponCategory, WeaponDef } from './types';

export const RUSH_WEAPONS: WeaponDef[] = [
  // --- ASSAULT RIFLES ---
  {
    id: 'mcw',
    name: 'AR',
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
    adsZoomFov: 0, // ADS disabled for AR
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
  // --- SUBMACHINE GUNS (SMGs) ---
  {
    id: 'rival_9',
    name: 'SMG',
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
    adsZoomFov: 0, // ADS disabled for SMG
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
  // --- SHOTGUNS ---
  {
    id: 'lockwood_680',
    name: 'Shotgun',
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
    adsZoomFov: 0, // ADS disabled for Shotgun
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
  // --- SNIPERS ---
  {
    id: 'longbow',
    name: 'Sniper',
    category: 'Sniper',
    description: 'Precision lever-action sniper rifle with a 7-round magazine and deliberate, hard-hitting cycle.',
    damage: 110,
    headshotMultiplier: 1.8,
    fireRateRpm: 85, // lever throw ~0.7s
    magSize: 7,
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
    features: 'Lever-Action Precision · 7-Rnd Mag',
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

/** Sniper damage drops 20% of its base for every full 30 m beyond the first. */
export const SNIPER_FALLOFF_STEP_METERS = 30;
export const SNIPER_FALLOFF_PER_STEP = 0.8;

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

  if (weapon.category === 'Sniper') {
    const steps = Math.floor(distanceUnits / SNIPER_FALLOFF_STEP_METERS);
    baseDamage *= Math.pow(SNIPER_FALLOFF_PER_STEP, steps);
  }

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
