import type { WeaponCategory } from './types';

/** Additive transform for the viewmodel rig and its animated parts. */
interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export type CycleKind = 'none' | 'pump' | 'lever';

export interface PoseOffsets {
  weaponPos: Vec3;
  weaponRot: Vec3;
  leftHandPos: Vec3;
  leftHandRot: Vec3;
  magazineDrop: number;
  boltBack: number;
  pumpBack: number;
  leverAngle: number;
}

/** Normalizes a component to a finite number and removes negative zero. */
const num = (v: number): number => (Number.isFinite(v) ? (v === 0 ? 0 : v) : 0);

const vec = (x: number, y: number, z: number): Vec3 => ({ x: num(x), y: num(y), z: num(z) });

export const ZERO_POSE: PoseOffsets = Object.freeze({
  weaponPos: Object.freeze({ x: 0, y: 0, z: 0 }) as Vec3,
  weaponRot: Object.freeze({ x: 0, y: 0, z: 0 }) as Vec3,
  leftHandPos: Object.freeze({ x: 0, y: 0, z: 0 }) as Vec3,
  leftHandRot: Object.freeze({ x: 0, y: 0, z: 0 }) as Vec3,
  magazineDrop: 0,
  boltBack: 0,
  pumpBack: 0,
  leverAngle: 0,
});

/** Fresh, mutable zero pose so callers can never mutate `ZERO_POSE`. */
function zeroPose(): PoseOffsets {
  return {
    weaponPos: { x: 0, y: 0, z: 0 },
    weaponRot: { x: 0, y: 0, z: 0 },
    leftHandPos: { x: 0, y: 0, z: 0 },
    leftHandRot: { x: 0, y: 0, z: 0 },
    magazineDrop: 0,
    boltBack: 0,
    pumpBack: 0,
    leverAngle: 0,
  };
}

const clamp01 = (t: number): number => (t < 0 ? 0 : t > 1 ? 1 : t);

const smoothstep = (t: number): number => {
  const c = clamp01(t);
  return c * c * (3 - 2 * c);
};

/** Normalized 0..1 position of `p` inside the segment `[a, b]`, clamped. */
const seg = (p: number, a: number, b: number): number => (b <= a ? (p >= b ? 1 : 0) : clamp01((p - a) / (b - a)));

/** Ease-in/out hump that is exactly 0 at 0 and 1 and peaks 1 at 0.5. */
const hump = (t: number): number => (t <= 0 || t >= 1 ? 0 : t < 0.5 ? smoothstep(t / 0.5) : smoothstep((1 - t) / 0.5));

/** Rises over `[a, b]`, holds at 1 through `[c, d]`, falls back to 0. */
const plateau = (p: number, a: number, b: number, c: number, d: number): number =>
  smoothstep(seg(p, a, b)) * (1 - smoothstep(seg(p, c, d)));

/** A single hump confined to the window `[a, b]`. */
const bump = (p: number, a: number, b: number): number => hump(seg(p, a, b));

/** Clamps progress, mapping non-finite input to 0. */
const progress01 = (p: number): number => (Number.isFinite(p) ? clamp01(p) : 0);

/**
 * Position offset that puts a local sight point onto the camera axis at the
 * given eye relief. The caller adds this to the base weapon group position.
 */
export function computeAdsPosition(sightLocal: Vec3, eyeRelief: number): Vec3 {
  return {
    x: -sightLocal.x,
    y: -sightLocal.y,
    z: -sightLocal.z - eyeRelief,
  };
}

export interface RecoilProfile {
  travel: number;
  pitchRad: number;
  stiffness: number;
  damping: number;
  maxOffset: number;
}

export interface RecoilState {
  offset: number;
  velocity: number;
}

export const RECOIL_PROFILES: Record<WeaponCategory, RecoilProfile> = {
  AR: { travel: 0.022, pitchRad: 0.031, stiffness: 320, damping: 26, maxOffset: 0.05 },
  SMG: { travel: 0.018, pitchRad: 0.026, stiffness: 320, damping: 26, maxOffset: 0.045 },
  Shotgun: { travel: 0.055, pitchRad: 0.07, stiffness: 180, damping: 18, maxOffset: 0.08 },
  Sniper: { travel: 0.045, pitchRad: 0.052, stiffness: 180, damping: 18, maxOffset: 0.07 },
};

/**
 * Advances a spring-damper recoil impulse one step. When `fired`, the profile's
 * travel is added to the offset (positive, applied toward the camera by the
 * caller) before integration. Non-finite inputs are normalized to zero and `dt`
 * is clamped to 0.05 s for stability.
 */
export function stepRecoil(
  state: RecoilState,
  profile: RecoilProfile,
  fired: boolean,
  dt: number
): RecoilState {
  let offset = Number.isFinite(state?.offset) ? state.offset : 0;
  let velocity = Number.isFinite(state?.velocity) ? state.velocity : 0;
  const step = Number.isFinite(dt) ? Math.min(Math.max(dt, 0), 0.05) : 0;

  if (fired) offset += profile.travel;

  const accel = -profile.stiffness * offset - profile.damping * velocity;
  velocity += accel * step;
  offset += velocity * step;

  const max = profile.maxOffset;
  if (offset > max) offset = max;
  else if (offset < -max) offset = -max;

  if (!Number.isFinite(offset)) offset = 0;
  if (!Number.isFinite(velocity)) velocity = 0;

  return { offset, velocity };
}

/** Reload timeline for AR and SMG: tilt, magazine drop, then a bolt slap. */
function sampleMagazineReload(p: number, tilt: number, drop: number, bolt: number): PoseOffsets {
  const pose = zeroPose();
  const tilting = plateau(p, 0.06, 0.16, 0.72, 0.92);
  const mag = plateau(p, 0.12, 0.26, 0.45, 0.62);
  const hand = plateau(p, 0.1, 0.28, 0.46, 0.64);

  pose.weaponRot = vec(0, 0, -tilt * tilting);
  pose.weaponPos = vec(0, -0.02 * tilting, 0.015 * tilting);
  pose.magazineDrop = num(drop * mag);
  pose.boltBack = num(bolt * bump(p, 0.74, 0.9));
  pose.leftHandPos = vec(0.02 * hand, -0.06 * hand, 0.05 * hand);
  pose.leftHandRot = vec(0.2 * hand, 0, -0.25 * hand);
  return pose;
}

/** Six shell pulses across the middle 70% of the reload. */
function shotgunShellPulse(p: number): number {
  if (p <= 0.15 || p >= 0.85) return 0;
  const local = ((p - 0.15) / 0.7) * 6;
  return hump(local - Math.floor(local));
}

/** Reload timeline for the shotgun: shells into the port, then a pump. */
function sampleShotgunReload(p: number): PoseOffsets {
  const pose = zeroPose();
  const tilting = plateau(p, 0.06, 0.16, 0.72, 0.92);
  const shell = shotgunShellPulse(p);
  const pump = bump(p, 0.82, 0.95);

  pose.weaponRot = vec(0, 0, -0.25 * tilting);
  pose.weaponPos = vec(0, -0.015 * tilting, 0.01 * tilting);
  pose.pumpBack = num(0.05 * pump);
  pose.leftHandPos = vec(0.02 * shell, -0.05 * shell, -0.08 * shell);
  pose.leftHandRot = vec(0.3 * shell, 0.1 * shell, 0);
  return pose;
}

/** Reload timeline for the sniper: lever opens, lifter/rounds, lever closes. */
function sampleSniperReload(p: number): PoseOffsets {
  const pose = zeroPose();
  const tilting = plateau(p, 0.06, 0.16, 0.72, 0.92);
  const lever = plateau(p, 0.12, 0.2, 0.45, 0.7);
  const lifter = plateau(p, 0.42, 0.5, 0.62, 0.72);
  const bolt = bump(p, 0.3, 0.55);

  pose.weaponRot = vec(0, 0, -0.2 * tilting);
  pose.weaponPos = vec(0, -0.02 * tilting, 0.02 * tilting);
  pose.leverAngle = num(0.9 * lever);
  pose.boltBack = num(0.05 * bolt);
  pose.leftHandPos = vec(0.015 * lever, -0.02 * lever - 0.02 * lifter, 0.04 * lever);
  pose.leftHandRot = vec(0, 0, 0.4 * lever);
  return pose;
}

/**
 * Additive reload pose for `progress` in 0..1 (fractions of the reload time).
 * Returns a fresh object; input is clamped and non-finite progress is treated
 * as 0, so both ends and out-of-range calls return a zero pose.
 */
export function sampleReloadPose(progress: number, category: WeaponCategory): PoseOffsets {
  const p = progress01(progress);
  if (p <= 0 || p >= 1) return zeroPose();

  switch (category) {
    case 'AR':
      return sampleMagazineReload(p, 0.35, 0.12, 0.04);
    case 'SMG':
      return sampleMagazineReload(p, 0.4, 0.1, 0.035);
    case 'Shotgun':
      return sampleShotgunReload(p);
    case 'Sniper':
      return sampleSniperReload(p);
    default:
      return zeroPose();
  }
}

/**
 * Additive mechanical cycle pose for `progress` in 0..1 (pump / lever).
 * `pumpBack` peaks at 0.06 m, `leverAngle` at 0.9 rad; both ease in and out and
 * return exactly to zero at 0 and 1.
 */
export function sampleCyclePose(progress: number, kind: CycleKind): PoseOffsets {
  const p = progress01(progress);
  const pose = zeroPose();
  if (kind === 'none' || p <= 0 || p >= 1) return pose;

  const amount = hump(p);

  if (kind === 'pump') {
    pose.pumpBack = num(0.06 * amount);
    pose.leftHandPos = vec(0, 0, -0.05 * amount);
    pose.leftHandRot = vec(0.2 * amount, 0, 0);
  } else {
    pose.leverAngle = num(0.9 * amount);
    pose.boltBack = num(0.05 * amount);
    pose.leftHandPos = vec(0.01 * amount, -0.03 * amount, 0.03 * amount);
    pose.leftHandRot = vec(0, 0, 0.35 * amount);
  }

  return pose;
}
