import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { WeaponDef } from './types';
import type { CycleKind } from './viewmodelPose';
import { buildHands, addViewmodelLights } from './viewmodel';

// Re-exported so the public gun-model surface exposes hands alongside the rig.
export { buildHands } from './viewmodel';

export interface GunRig {
  group: THREE.Group;
  muzzlePos: THREE.Vector3;
  muzzleFlash: THREE.Mesh;
  sightRear: THREE.Object3D;
  sightFront: THREE.Object3D;
  magazine: THREE.Object3D;
  bolt: THREE.Object3D;
  pump: THREE.Object3D;
  lever: THREE.Object3D;
  leftHand: THREE.Object3D;
  cycle: { kind: CycleKind; duration: number; startDelay: number };
  hipPose: {
    position: { x: number; y: number; z: number };
    rotation: { x: number; y: number; z: number };
  };
  adsEyeRelief: number;
}

type Role = 'body' | 'metal' | 'accent' | 'polymer' | 'optic';

interface Buckets {
  body: THREE.BufferGeometry[];
  metal: THREE.BufferGeometry[];
  accent: THREE.BufferGeometry[];
  polymer: THREE.BufferGeometry[];
  optic: THREE.BufferGeometry[];
}

const matMuzzleFlashBase = new THREE.MeshBasicMaterial({
  color: 0xffe680,
  transparent: true,
  opacity: 0,
});

const materialCache = new Map<string, THREE.MeshStandardMaterial>();

/** Per-weapon material cache keyed by id+role; only the roles a gun uses are built. */
function gunMaterial(weapon: WeaponDef, role: Role): THREE.MeshStandardMaterial {
  const key = `${weapon.id}:${role}`;
  const cached = materialCache.get(key);
  if (cached) return cached;

  let m: THREE.MeshStandardMaterial;
  switch (role) {
    case 'body':
      m = new THREE.MeshStandardMaterial({ color: weapon.colors.primary, roughness: 0.55, metalness: 0.35 });
      break;
    case 'metal':
      m = new THREE.MeshStandardMaterial({ color: weapon.colors.secondary, roughness: 0.35, metalness: 0.8 });
      break;
    case 'accent':
      m = new THREE.MeshStandardMaterial({ color: weapon.colors.accent, roughness: 0.45, metalness: 0.6 });
      break;
    case 'optic':
      // Tinted glass for the sniper scope lens discs.
      m = new THREE.MeshStandardMaterial({
        color: 0x223344,
        roughness: 0.1,
        metalness: 0.1,
        transparent: true,
        opacity: 0.5,
      });
      break;
    default:
      m = new THREE.MeshStandardMaterial({ color: weapon.colors.primary, roughness: 0.8, metalness: 0.05 });
  }
  materialCache.set(key, m);
  return m;
}

/** Emissive fiber-optic insert for the AR/SMG front post tip. */
const tipMaterialCache = new Map<string, THREE.MeshStandardMaterial>();
function tipMaterial(weapon: WeaponDef): THREE.MeshStandardMaterial {
  const cached = tipMaterialCache.get(weapon.id);
  if (cached) return cached;
  const m = new THREE.MeshStandardMaterial({
    color: weapon.colors.accent,
    emissive: 0x2a1600,
    emissiveIntensity: 1,
    roughness: 0.4,
    metalness: 0.4,
  });
  tipMaterialCache.set(weapon.id, m);
  return m;
}

function place(
  g: THREE.BufferGeometry,
  x: number,
  y: number,
  z: number,
  rx = 0,
  ry = 0,
  rz = 0
): THREE.BufferGeometry {
  if (rx) g.rotateX(rx);
  if (ry) g.rotateY(ry);
  if (rz) g.rotateZ(rz);
  g.translate(x, y, z);
  return g;
}

function addBox(
  b: THREE.BufferGeometry[],
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
  rx = 0,
  ry = 0,
  rz = 0
): void {
  b.push(place(new THREE.BoxGeometry(w, h, d), x, y, z, rx, ry, rz));
}

/** Cylinder aligned along an axis: 'y' default, 'x' or 'z' rotate it into place. */
function addCyl(
  b: THREE.BufferGeometry[],
  rt: number,
  rb: number,
  h: number,
  seg: number,
  x: number,
  y: number,
  z: number,
  axis: 'x' | 'y' | 'z',
  rx = 0,
  ry = 0,
  rz = 0
): void {
  const g = new THREE.CylinderGeometry(rt, rb, h, seg, 1);
  if (axis === 'x') g.rotateZ(Math.PI / 2);
  else if (axis === 'z') g.rotateX(Math.PI / 2);
  b.push(place(g, x, y, z, rx, ry, rz));
}

function addTorus(
  b: THREE.BufferGeometry[],
  r: number,
  tube: number,
  radial: number,
  tubular: number,
  x: number,
  y: number,
  z: number,
  rx = 0,
  ry = 0,
  rz = 0
): void {
  b.push(place(new THREE.TorusGeometry(r, tube, radial, tubular), x, y, z, rx, ry, rz));
}

function addSphere(b: THREE.BufferGeometry[], r: number, x: number, y: number, z: number): void {
  b.push(place(new THREE.SphereGeometry(r, 8, 6), x, y, z));
}

function anchor(x: number, y: number, z: number): THREE.Object3D {
  const o = new THREE.Object3D();
  o.position.set(x, y, z);
  return o;
}

/** Merges a geometry bucket into one mesh, or an empty group when unused. */
function partGroup(geos: THREE.BufferGeometry[], material: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  if (geos.length) {
    const merged = mergeGeometries(geos, false);
    if (merged) g.add(new THREE.Mesh(merged, material));
  }
  return g;
}

interface PartSpec {
  geos: THREE.BufferGeometry[];
  material: THREE.Material;
}

interface WeaponGeometry {
  buckets: Buckets;
  magazine: PartSpec;
  bolt: PartSpec;
  pump: PartSpec;
  lever: PartSpec;
  sightRear: [number, number, number];
  sightFront: [number, number, number];
  muzzle: [number, number, number];
  gripLeft: [number, number, number];
  gripRight: [number, number, number];
  tipGlow: [number, number, number] | null;
}

const emptyBuckets = (): Buckets => ({ body: [], metal: [], accent: [], polymer: [], optic: [] });

/** Geometry for the four live weapons. Dead branches were removed outright. */
function buildWeaponGeometry(weapon: WeaponDef): WeaponGeometry {
  const b = emptyBuckets();
  const metal = gunMaterial(weapon, 'metal');
  const accent = gunMaterial(weapon, 'accent');
  const mag: THREE.BufferGeometry[] = [];
  const bolt: THREE.BufferGeometry[] = [];
  const pump: THREE.BufferGeometry[] = [];
  const lever: THREE.BufferGeometry[] = [];

  switch (weapon.category) {
    case 'AR': {
      addBox(b.body, 0.06, 0.08, 0.3, 0, 0, 0);
      addBox(b.body, 0.055, 0.06, 0.24, 0, 0.005, -0.3);
      addBox(b.polymer, 0.05, 0.09, 0.22, 0, 0.015, 0.25);
      addBox(b.polymer, 0.04, 0.13, 0.05, 0, -0.085, 0.09, 0.32, 0, 0);
      addBox(b.metal, 0.03, 0.012, 0.34, 0, 0.045, -0.06);
      addBox(b.metal, 0.028, 0.008, 0.06, 0, -0.052, 0.03);
      addCyl(b.metal, 0.014, 0.014, 0.3, 10, 0, 0.012, -0.45, 'z');
      addCyl(b.accent, 0.02, 0.02, 0.06, 10, 0, 0.012, -0.6, 'z');
      // Rear aperture ring + protective ears, centred on the sightRear anchor.
      addTorus(b.metal, 0.014, 0.004, 6, 12, 0, 0.09, -0.22);
      addBox(b.metal, 0.006, 0.03, 0.008, -0.02, 0.09, -0.22);
      addBox(b.metal, 0.006, 0.03, 0.008, 0.02, 0.09, -0.22);
      // Front post inside a hood, centred on the sightFront anchor.
      addTorus(b.metal, 0.016, 0.004, 6, 12, 0, 0.09, -0.62);
      addBox(b.metal, 0.005, 0.022, 0.005, 0, 0.09, -0.62);
      addBox(mag, 0.04, 0.16, 0.06, 0, -0.11, -0.04, -0.2, 0, 0);
      addBox(bolt, 0.03, 0.012, 0.06, 0, 0.03, 0.16);
      return {
        buckets: b,
        magazine: { geos: mag, material: accent },
        bolt: { geos: bolt, material: metal },
        pump: { geos: [], material: metal },
        lever: { geos: [], material: metal },
        sightRear: [0, 0.09, -0.22],
        sightFront: [0, 0.09, -0.62],
        muzzle: [0, 0.012, -0.65],
        gripLeft: [0, -0.03, -0.3],
        gripRight: [0, -0.09, 0.09],
        tipGlow: [0, 0.101, -0.62],
      };
    }
    case 'SMG': {
      // More compact SMG body with distinct proportions
      addBox(b.body, 0.045, 0.065, 0.2, 0, 0, 0);
      addBox(b.polymer, 0.035, 0.09, 0.04, 0, -0.065, 0.065, 0.3, 0, 0);
      addBox(b.metal, 0.04, 0.045, 0.14, 0, 0.006, -0.18);
      addBox(b.metal, 0.03, 0.045, 0.12, 0, 0.006, 0.16);
      addBox(b.metal, 0.025, 0.008, 0.2, 0, 0.038, -0.04);
      addBox(b.metal, 0.022, 0.006, 0.045, 0, -0.04, 0.025);
      // SMG-specific features: shorter barrel, different grip angle
      addCyl(b.metal, 0.01, 0.01, 0.14, 10, 0, 0.006, -0.26, 'z');
      addCyl(b.accent, 0.016, 0.016, 0.04, 10, 0, 0.006, -0.36, 'z');
      // Rear aperture (different from AR notch)
      addTorus(b.metal, 0.012, 0.003, 6, 12, 0, 0.065, -0.16);
      addBox(b.metal, 0.005, 0.012, 0.008, -0.01, 0.065, -0.16);
      addBox(b.metal, 0.005, 0.012, 0.008, 0.01, 0.065, -0.16);
      // Hooded front post with different proportions
      addTorus(b.metal, 0.012, 0.003, 6, 12, 0, 0.065, -0.52);
      addBox(b.metal, 0.004, 0.015, 0.004, 0, 0.065, -0.52);
      addBox(mag, 0.032, 0.16, 0.045, 0, -0.085, -0.025, -0.1, 0, 0);
      addBox(bolt, 0.022, 0.01, 0.045, -0.025, 0.018, 0.05);
      return {
        buckets: b,
        magazine: { geos: mag, material: accent },
        bolt: { geos: bolt, material: metal },
        pump: { geos: [], material: metal },
        lever: { geos: [], material: metal },
        sightRear: [0, 0.065, -0.16],
        sightFront: [0, 0.065, -0.52],
        muzzle: [0, 0.006, -0.51],
        gripLeft: [0, -0.025, -0.19],
        gripRight: [0, -0.075, 0.065],
        tipGlow: [0, 0.075, -0.52],
      };
    }
    case 'Shotgun': {
      addBox(b.body, 0.06, 0.085, 0.3, 0, 0, 0);
      addBox(b.polymer, 0.055, 0.1, 0.24, 0, -0.005, 0.26);
      addBox(b.polymer, 0.038, 0.09, 0.05, 0, -0.06, 0.12, 0.2, 0, 0);
      addCyl(b.metal, 0.022, 0.022, 0.6, 10, 0, 0.03, -0.42, 'z');
      addCyl(b.metal, 0.016, 0.016, 0.52, 8, 0, -0.005, -0.38, 'z');
      addBox(b.metal, 0.05, 0.05, 0.02, 0, 0.02, -0.56);
      addBox(b.metal, 0.03, 0.008, 0.07, 0, -0.05, 0.06);
      // Shallow rear V-notch.
      addBox(b.metal, 0.006, 0.012, 0.008, -0.008, 0.11, -0.16, 0, 0, 0.4);
      addBox(b.metal, 0.006, 0.012, 0.008, 0.008, 0.11, -0.16, 0, 0, -0.4);
      // Brass front bead.
      addSphere(b.accent, 0.006, 0, 0.11, -0.72);
      addBox(pump, 0.055, 0.055, 0.15, 0, -0.005, -0.3);
      addBox(bolt, 0.02, 0.02, 0.05, 0, 0.005, -0.06);
      return {
        buckets: b,
        magazine: { geos: [], material: accent },
        bolt: { geos: bolt, material: metal },
        pump: { geos: pump, material: accent },
        lever: { geos: [], material: metal },
        sightRear: [0, 0.11, -0.16],
        sightFront: [0, 0.11, -0.72],
        muzzle: [0, 0.03, -0.7],
        gripLeft: [0, -0.02, -0.3],
        gripRight: [0, -0.08, 0.12],
        tipGlow: null,
      };
    }
    default: {
      addBox(b.body, 0.06, 0.09, 0.36, 0, 0, 0);
      addBox(b.polymer, 0.055, 0.11, 0.28, 0, 0.01, 0.28);
      addBox(b.polymer, 0.04, 0.12, 0.05, 0, -0.08, 0.1, 0.3, 0, 0);
      addCyl(b.metal, 0.018, 0.022, 0.56, 10, 0, 0.02, -0.46, 'z');
      addBox(b.metal, 0.03, 0.008, 0.07, 0, -0.05, 0.14);
      // Scope: main tube with ocular and objective bells
      addCyl(b.metal, 0.02, 0.02, 0.45, 12, 0, 0.12, -0.48, 'z');
      addCyl(b.metal, 0.022, 0.026, 0.06, 12, 0, 0.12, -0.26, 'z');
      addCyl(b.metal, 0.028, 0.022, 0.07, 12, 0, 0.12, -0.7, 'z');
      // Mounts
      addBox(b.metal, 0.025, 0.04, 0.015, 0, 0.08, -0.6);
      addBox(b.metal, 0.025, 0.04, 0.015, 0, 0.08, -0.36);
      // Lens discs (simplified to avoid nested scope effect)
      addCyl(b.optic, 0.018, 0.018, 0.003, 12, 0, 0.12, -0.72, 'z');
      addCyl(b.optic, 0.018, 0.018, 0.003, 12, 0, 0.12, -0.24, 'z');
      addBox(b.accent, 0.05, 0.045, 0.1, 0, 0.02, -0.8);
      addBox(mag, 0.045, 0.13, 0.08, 0, -0.1, -0.02);
      addBox(bolt, 0.012, 0.03, 0.05, 0.045, 0.06, 0.02);
      addBox(lever, 0.02, 0.02, 0.1, 0, -0.055, 0.06, 0.3, 0, 0);
      return {
        buckets: b,
        magazine: { geos: mag, material: accent },
        bolt: { geos: bolt, material: metal },
        pump: { geos: [], material: metal },
        lever: { geos: lever, material: accent },
        sightRear: [0, 0.13, -0.25],
        sightFront: [0, 0.13, -0.75],
        muzzle: [0, 0.02, -0.82],
        gripLeft: [0, -0.02, -0.3],
        gripRight: [0, -0.09, 0.1],
        tipGlow: null,
      };
    }
  }
}

interface RigConfig {
  cycle: { kind: CycleKind; duration: number; startDelay: number };
  hip: { position: [number, number, number]; rotation: [number, number, number] };
  eyeRelief: number;
}

const RIG_CONFIG: Record<string, RigConfig> = {
  AR: { cycle: { kind: 'none', duration: 0, startDelay: 0 }, hip: { position: [0.24, -0.22, -0.42], rotation: [0.02, 0.04, 0.02] }, eyeRelief: 0.3 },
  SMG: { cycle: { kind: 'none', duration: 0, startDelay: 0 }, hip: { position: [0.23, -0.21, -0.36], rotation: [0.02, 0.05, 0.03] }, eyeRelief: 0.3 },
  Shotgun: { cycle: { kind: 'pump', duration: 0.6, startDelay: 0.15 }, hip: { position: [0.25, -0.23, -0.44], rotation: [0.03, 0.03, 0.02] }, eyeRelief: 0.34 },
  Sniper: { cycle: { kind: 'lever', duration: 0.63, startDelay: 0.08 }, hip: { position: [0.26, -0.24, -0.5], rotation: [0.02, 0.03, 0.02] }, eyeRelief: 0.08 },
};

/**
 * Assembles one fully posed gun rig. Direct children of `group` top out at 16:
 * up to five merged static meshes (the sniper's tinted lens is its own material),
 * two sight anchors, four animated-part groups, the muzzle flash, two hands, and
 * two viewmodel lights (the AR/SMG rigs trade the fifth mesh for a glow tip).
 */
export function buildGunModel(weapon: WeaponDef): GunRig {
  const geo = buildWeaponGeometry(weapon);
  const cfg = RIG_CONFIG[weapon.category];

  const group = new THREE.Group();

  // Static geometry, merged per material to bound draw calls.
  for (const role of ['body', 'metal', 'accent', 'polymer', 'optic'] as Role[]) {
    const bucket = geo.buckets[role];
    if (!bucket.length) continue;
    const merged = mergeGeometries(bucket, false);
    if (merged) group.add(new THREE.Mesh(merged, gunMaterial(weapon, role)));
  }

  // Emissive fiber-optic tip on AR/SMG only.
  if (geo.tipGlow) {
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.012, 0.005), tipMaterial(weapon));
    tip.position.set(geo.tipGlow[0], geo.tipGlow[1], geo.tipGlow[2]);
    group.add(tip);
  }

  // Clean sight anchors, separate from the meshes they represent.
  const sightRear = anchor(...geo.sightRear);
  const sightFront = anchor(...geo.sightFront);
  group.add(sightRear, sightFront);

  // Animated parts stay separate from the merged static shells.
  const magazine = partGroup(geo.magazine.geos, geo.magazine.material);
  const bolt = partGroup(geo.bolt.geos, geo.bolt.material);
  const pump = partGroup(geo.pump.geos, geo.pump.material);
  const lever = partGroup(geo.lever.geos, geo.lever.material);
  group.add(magazine, bolt, pump, lever);

  // Muzzle flash starburst.
  const flashGeo = new THREE.OctahedronGeometry(0.08, 0);
  flashGeo.scale(1, 1, 2.5);
  const muzzleFlash = new THREE.Mesh(flashGeo, matMuzzleFlashBase.clone());
  const muzzlePos = new THREE.Vector3(...geo.muzzle);
  muzzleFlash.position.copy(muzzlePos);
  group.add(muzzleFlash);

  // Gloved hands on the foregrip and pistol grip.
  const hands = buildHands();
  hands.left.position.set(...geo.gripLeft);
  hands.left.rotation.set(0.1, -0.15, 0.15);
  hands.right.position.set(...geo.gripRight);
  hands.right.rotation.set(0.25, 0.1, -0.05);
  group.add(hands.left, hands.right);

  addViewmodelLights(group);

  return {
    group,
    muzzlePos,
    muzzleFlash,
    sightRear,
    sightFront,
    magazine,
    bolt,
    pump,
    lever,
    leftHand: hands.left,
    cycle: cfg.cycle,
    hipPose: {
      position: { x: cfg.hip.position[0], y: cfg.hip.position[1], z: cfg.hip.position[2] },
      rotation: { x: cfg.hip.rotation[0], y: cfg.hip.rotation[1], z: cfg.hip.rotation[2] },
    },
    adsEyeRelief: cfg.eyeRelief,
  };
}
