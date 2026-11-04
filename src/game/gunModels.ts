import * as THREE from 'three';
import { WeaponDef } from './types';

// Pre-create shared materials for procedural gun models to avoid garbage collection
const matBlack = new THREE.MeshStandardMaterial({
  color: 0x181a1d,
  roughness: 0.45,
  metalness: 0.65,
});

const matDarkMetal = new THREE.MeshStandardMaterial({
  color: 0x2a2d33,
  roughness: 0.35,
  metalness: 0.85,
});

const matBronze = new THREE.MeshStandardMaterial({
  color: 0xba8c53,
  roughness: 0.4,
  metalness: 0.7,
});

const matFde = new THREE.MeshStandardMaterial({
  color: 0x7a6b57,
  roughness: 0.65,
  metalness: 0.25,
});

const matTacticalCyan = new THREE.MeshStandardMaterial({
  color: 0x00bcd4,
  roughness: 0.3,
  metalness: 0.5,
});

const matWarningRed = new THREE.MeshStandardMaterial({
  color: 0xd32f2f,
  roughness: 0.4,
  metalness: 0.3,
});

const matOpticGlass = new THREE.MeshPhysicalMaterial({
  color: 0x113355,
  roughness: 0.1,
  metalness: 0.1,
  transparent: true,
  opacity: 0.6,
});

const matMuzzleFlash = new THREE.MeshBasicMaterial({
  color: 0xffe680,
  transparent: true,
  opacity: 0,
});

export interface GunRig {
  group: THREE.Group;
  muzzlePos: THREE.Vector3;
  muzzleFlash: THREE.Mesh;
  weaponId: string;
}

export function buildGunModel(weapon: WeaponDef): GunRig {
  const root = new THREE.Group();
  const muzzlePos = new THREE.Vector3(0, 0.04, -0.65);

  const primaryMat = new THREE.MeshStandardMaterial({
    color: weapon.colors.primary,
    roughness: 0.5,
    metalness: 0.55,
  });

  const secondaryMat = new THREE.MeshStandardMaterial({
    color: weapon.colors.secondary,
    roughness: 0.4,
    metalness: 0.75,
  });

  const accentMat = new THREE.MeshStandardMaterial({
    color: weapon.colors.accent,
    roughness: 0.35,
    metalness: 0.6,
  });

  if (weapon.category === 'AR') {
    // Modular Assault Rifle (MCW / Holger / SVA / MTZ)
    // 1. Lower & Upper Receiver
    const receiverGeo = new THREE.BoxGeometry(0.06, 0.08, 0.32);
    const receiver = new THREE.Mesh(receiverGeo, primaryMat);
    receiver.position.set(0, 0, 0);
    root.add(receiver);

    // 2. Handguard / Rail system
    const handguardGeo = new THREE.BoxGeometry(0.055, 0.065, 0.28);
    const handguard = new THREE.Mesh(handguardGeo, secondaryMat);
    handguard.position.set(0, 0.01, -0.28);
    root.add(handguard);

    // 3. Barrel & Gas Block
    const barrelGeo = new THREE.CylinderGeometry(0.016, 0.016, 0.28, 8);
    barrelGeo.rotateX(Math.PI / 2);
    const barrel = new THREE.Mesh(barrelGeo, matDarkMetal);
    barrel.position.set(0, 0.01, -0.48);
    root.add(barrel);

    // 4. Muzzle Brake
    const brakeGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.07, 8);
    brakeGeo.rotateX(Math.PI / 2);
    const brake = new THREE.Mesh(brakeGeo, accentMat);
    brake.position.set(0, 0.01, -0.63);
    root.add(brake);

    // 5. Magazine (Curved / angled stanag mag)
    const magGeo = new THREE.BoxGeometry(0.045, 0.18, 0.07);
    const mag = new THREE.Mesh(magGeo, accentMat);
    mag.position.set(0, -0.11, -0.06);
    mag.rotation.x = -0.22;
    root.add(mag);

    // 6. Pistol Grip
    const gripGeo = new THREE.BoxGeometry(0.045, 0.14, 0.055);
    const grip = new THREE.Mesh(gripGeo, primaryMat);
    grip.position.set(0, -0.1, 0.1);
    grip.rotation.x = 0.32;
    root.add(grip);

    // 7. Tactical Stock (buffer tube & cheek rest)
    const stockGeo = new THREE.BoxGeometry(0.05, 0.09, 0.24);
    const stock = new THREE.Mesh(stockGeo, secondaryMat);
    stock.position.set(0, 0.02, 0.26);
    root.add(stock);

    // 8. Holographic / Reflex Sight
    const sightBaseGeo = new THREE.BoxGeometry(0.045, 0.02, 0.09);
    const sightBase = new THREE.Mesh(sightBaseGeo, matBlack);
    sightBase.position.set(0, 0.05, -0.05);
    root.add(sightBase);

    const sightRingGeo = new THREE.BoxGeometry(0.052, 0.052, 0.02);
    const sightRing = new THREE.Mesh(sightRingGeo, matBlack);
    sightRing.position.set(0, 0.08, -0.05);
    root.add(sightRing);

    const lensGeo = new THREE.BoxGeometry(0.044, 0.044, 0.005);
    const lens = new THREE.Mesh(lensGeo, matOpticGlass);
    lens.position.set(0, 0.08, -0.05);
    root.add(lens);

    // Red dot reticle pip inside lens
    const dotGeo = new THREE.SphereGeometry(0.003, 6, 6);
    const dotMat = new THREE.MeshBasicMaterial({ color: 0xff1111 });
    const dot = new THREE.Mesh(dotGeo, dotMat);
    dot.position.set(0, 0.08, -0.052);
    root.add(dot);

    muzzlePos.set(0, 0.01, -0.67);
  } else if (weapon.category === 'SMG') {
    // Compact Submachine Gun (Rival-9 / Striker / WSP Swarm / AMR9)
    // 1. Compact Receiver
    const recGeo = new THREE.BoxGeometry(0.052, 0.075, 0.26);
    const rec = new THREE.Mesh(recGeo, primaryMat);
    root.add(rec);

    // 2. Short Barrel & Shroud
    const shroudGeo = new THREE.BoxGeometry(0.048, 0.055, 0.18);
    const shroud = new THREE.Mesh(shroudGeo, secondaryMat);
    shroud.position.set(0, 0.01, -0.2);
    root.add(shroud);

    // 3. Compact Compensator
    const compGeo = new THREE.CylinderGeometry(0.018, 0.018, 0.06, 8);
    compGeo.rotateX(Math.PI / 2);
    const comp = new THREE.Mesh(compGeo, accentMat);
    comp.position.set(0, 0.01, -0.32);
    root.add(comp);

    // 4. Straight Stick Magazine
    const smgMagGeo = new THREE.BoxGeometry(0.038, 0.2, 0.05);
    const smgMag = new THREE.Mesh(smgMagGeo, accentMat);
    smgMag.position.set(0, -0.11, -0.04);
    smgMag.rotation.x = -0.12;
    root.add(smgMag);

    // 5. Ergonomic Angled Grip
    const gripGeo = new THREE.BoxGeometry(0.04, 0.12, 0.05);
    const grip = new THREE.Mesh(gripGeo, primaryMat);
    grip.position.set(0, -0.08, 0.08);
    grip.rotation.x = 0.35;
    root.add(grip);

    // 6. Folding Wire Stock
    const wireStockGeo = new THREE.BoxGeometry(0.04, 0.06, 0.18);
    const wireStock = new THREE.Mesh(wireStockGeo, matDarkMetal);
    wireStock.position.set(0, 0.01, 0.21);
    root.add(wireStock);

    // 7. Reflex Micro Optic
    const opticGeo = new THREE.BoxGeometry(0.042, 0.042, 0.06);
    const optic = new THREE.Mesh(opticGeo, matBlack);
    optic.position.set(0, 0.06, -0.04);
    root.add(optic);

    const greenDot = new THREE.Mesh(
      new THREE.SphereGeometry(0.003, 6, 6),
      new THREE.MeshBasicMaterial({ color: 0x00ff66 })
    );
    greenDot.position.set(0, 0.065, -0.05);
    root.add(greenDot);

    muzzlePos.set(0, 0.01, -0.36);
  } else if (weapon.category === 'Shotgun') {
    // Tactical Shotgun (Lockwood 680 / Haymaker / Riveter)
    // 1. Solid Heavy Receiver
    const recGeo = new THREE.BoxGeometry(0.065, 0.09, 0.34);
    const rec = new THREE.Mesh(recGeo, primaryMat);
    root.add(rec);

    // 2. Heavy 12ga Barrel
    const barrelGeo = new THREE.CylinderGeometry(0.024, 0.024, 0.44, 10);
    barrelGeo.rotateX(Math.PI / 2);
    const barrel = new THREE.Mesh(barrelGeo, matDarkMetal);
    barrel.position.set(0, 0.025, -0.38);
    root.add(barrel);

    // 3. Under-barrel Magazine Tube / Pump Slide
    const tubeGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.4, 8);
    tubeGeo.rotateX(Math.PI / 2);
    const tube = new THREE.Mesh(tubeGeo, secondaryMat);
    tube.position.set(0, -0.02, -0.36);
    root.add(tube);

    // 4. Pump Grip (Ridged / Ribbed)
    const pumpGeo = new THREE.BoxGeometry(0.06, 0.06, 0.16);
    const pump = new THREE.Mesh(pumpGeo, accentMat);
    pump.position.set(0, -0.02, -0.32);
    root.add(pump);

    // 5. Heavy Fixed Stock
    const stockGeo = new THREE.BoxGeometry(0.06, 0.11, 0.28);
    const stock = new THREE.Mesh(stockGeo, secondaryMat);
    stock.position.set(0, -0.01, 0.28);
    root.add(stock);

    // 6. Ghost Ring Sights
    const ghostRingGeo = new THREE.TorusGeometry(0.018, 0.004, 6, 12);
    const ghostRing = new THREE.Mesh(ghostRingGeo, matBlack);
    ghostRing.position.set(0, 0.07, 0.05);
    root.add(ghostRing);

    const frontPostGeo = new THREE.BoxGeometry(0.005, 0.025, 0.005);
    const frontPost = new THREE.Mesh(frontPostGeo, new THREE.MeshBasicMaterial({ color: 0xff3300 }));
    frontPost.position.set(0, 0.065, -0.58);
    root.add(frontPost);

    muzzlePos.set(0, 0.025, -0.62);
  } else {
    // Heavy Precision Sniper (Longbow / KV Inhibitor / KATT-AMR)
    // 1. Elongated Heavy Receiver
    const recGeo = new THREE.BoxGeometry(0.07, 0.1, 0.42);
    const rec = new THREE.Mesh(recGeo, primaryMat);
    root.add(rec);

    // 2. Long Fluted Heavy Bull Barrel
    const barrelGeo = new THREE.CylinderGeometry(0.022, 0.026, 0.72, 10);
    barrelGeo.rotateX(Math.PI / 2);
    const barrel = new THREE.Mesh(barrelGeo, matDarkMetal);
    barrel.position.set(0, 0.02, -0.55);
    root.add(barrel);

    // 3. Massive .50 Cal Muzzle Brake
    const brakeGeo = new THREE.BoxGeometry(0.065, 0.05, 0.12);
    const brake = new THREE.Mesh(brakeGeo, accentMat);
    brake.position.set(0, 0.02, -0.95);
    root.add(brake);

    // 4. Large Sniper Scope (Tube, Objective Bell, Turrets)
    const scopeTubeGeo = new THREE.CylinderGeometry(0.022, 0.022, 0.26, 12);
    scopeTubeGeo.rotateX(Math.PI / 2);
    const scopeTube = new THREE.Mesh(scopeTubeGeo, matBlack);
    scopeTube.position.set(0, 0.11, -0.06);
    root.add(scopeTube);

    const scopeBellGeo = new THREE.CylinderGeometry(0.035, 0.024, 0.09, 12);
    scopeBellGeo.rotateX(Math.PI / 2);
    const scopeBell = new THREE.Mesh(scopeBellGeo, matBlack);
    scopeBell.position.set(0, 0.11, -0.22);
    root.add(scopeBell);

    const scopeEyepieceGeo = new THREE.CylinderGeometry(0.024, 0.032, 0.08, 12);
    scopeEyepieceGeo.rotateX(Math.PI / 2);
    const scopeEye = new THREE.Mesh(scopeEyepieceGeo, matBlack);
    scopeEye.position.set(0, 0.11, 0.1);
    root.add(scopeEye);

    // Scope Mount Rings
    const mountGeo1 = new THREE.BoxGeometry(0.035, 0.05, 0.02);
    const mount1 = new THREE.Mesh(mountGeo1, matDarkMetal);
    mount1.position.set(0, 0.075, -0.12);
    root.add(mount1);
    const mount2 = mount1.clone();
    mount2.position.set(0, 0.075, 0.02);
    root.add(mount2);

    // 5. Heavy Sniper Stock with adjustable cheek riser
    const stockGeo = new THREE.BoxGeometry(0.065, 0.13, 0.32);
    const stock = new THREE.Mesh(stockGeo, secondaryMat);
    stock.position.set(0, 0.01, 0.35);
    root.add(stock);

    // 6. Box Magazine
    const magGeo = new THREE.BoxGeometry(0.05, 0.16, 0.1);
    const mag = new THREE.Mesh(magGeo, accentMat);
    mag.position.set(0, -0.11, -0.06);
    mag.rotation.x = -0.15;
    root.add(mag);

    // 7. Bolt Handle
    const boltHandleGeo = new THREE.CylinderGeometry(0.008, 0.008, 0.08, 6);
    boltHandleGeo.rotateZ(Math.PI / 3);
    const bolt = new THREE.Mesh(boltHandleGeo, matDarkMetal);
    bolt.position.set(0.06, 0.05, 0.04);
    root.add(bolt);

    muzzlePos.set(0, 0.02, -1.02);
  }

  // Muzzle flash starburst
  const flashGeo = new THREE.OctahedronGeometry(0.08, 0);
  flashGeo.scale(1, 1, 2.5);
  const flash = new THREE.Mesh(flashGeo, matMuzzleFlash.clone());
  flash.position.copy(muzzlePos);
  root.add(flash);

  return {
    group: root,
    muzzlePos,
    muzzleFlash: flash,
    weaponId: weapon.id,
  };
}
