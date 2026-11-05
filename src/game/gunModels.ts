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
  depthWrite: false,
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

  // Weapon-specific model variations based on weapon ID
  const weaponId = weapon.id;

  if (weapon.category === 'AR') {
    // Modular Assault Rifle base
    const receiverGeo = new THREE.BoxGeometry(0.06, 0.08, 0.32);
    const receiver = new THREE.Mesh(receiverGeo, primaryMat);
    receiver.position.set(0, 0, 0);
    root.add(receiver);

    const handguardGeo = new THREE.BoxGeometry(0.055, 0.065, 0.28);
    const handguard = new THREE.Mesh(handguardGeo, secondaryMat);
    handguard.position.set(0, 0.01, -0.28);
    root.add(handguard);

    const barrelGeo = new THREE.CylinderGeometry(0.016, 0.016, 0.28, 8);
    barrelGeo.rotateX(Math.PI / 2);
    const barrel = new THREE.Mesh(barrelGeo, matDarkMetal);
    barrel.position.set(0, 0.01, -0.48);
    root.add(barrel);

    const brakeGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.07, 8);
    brakeGeo.rotateX(Math.PI / 2);
    const brake = new THREE.Mesh(brakeGeo, accentMat);
    brake.position.set(0, 0.01, -0.63);
    root.add(brake);

    const magGeo = new THREE.BoxGeometry(0.045, 0.18, 0.07);
    const mag = new THREE.Mesh(magGeo, accentMat);
    mag.position.set(0, -0.11, -0.06);
    mag.rotation.x = -0.22;
    root.add(mag);

    const gripGeo = new THREE.BoxGeometry(0.045, 0.14, 0.055);
    const grip = new THREE.Mesh(gripGeo, primaryMat);
    grip.position.set(0, -0.1, 0.1);
    grip.rotation.x = 0.32;
    root.add(grip);

    const stockGeo = new THREE.BoxGeometry(0.05, 0.09, 0.24);
    const stock = new THREE.Mesh(stockGeo, secondaryMat);
    stock.position.set(0, 0.02, 0.26);
    root.add(stock);

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
    lens.renderOrder = 1;
    root.add(lens);

    const dotGeo = new THREE.SphereGeometry(0.003, 6, 6);
    const dotMat = new THREE.MeshBasicMaterial({ color: 0xff1111 });
    const dot = new THREE.Mesh(dotGeo, dotMat);
    dot.position.set(0, 0.08, -0.052);
    root.add(dot);

    // Weapon-specific variations
    if (weaponId === 'mcw') {
      // MCW: Extended barrel with suppressor-ready threading
      const extBarrelGeo = new THREE.CylinderGeometry(0.014, 0.016, 0.08, 8);
      extBarrelGeo.rotateX(Math.PI / 2);
      const extBarrel = new THREE.Mesh(extBarrelGeo, matDarkMetal);
      extBarrel.position.set(0, 0.01, -0.77);
      root.add(extBarrel);
    } else if (weaponId === 'holger_556') {
      // Holger: Heavy barrel shroud with heat vents
      const shroudGeo = new THREE.BoxGeometry(0.062, 0.072, 0.15);
      const shroud = new THREE.Mesh(shroudGeo, secondaryMat);
      shroud.position.set(0, 0.01, -0.35);
      root.add(shroud);
      // Vent holes
      for (let i = 0; i < 3; i++) {
        const ventGeo = new THREE.BoxGeometry(0.008, 0.008, 0.005);
        const vent = new THREE.Mesh(ventGeo, matBlack);
        vent.position.set(0, 0.04, -0.32 + i * 0.04);
        root.add(vent);
      }
    } else if (weaponId === 'sva_545') {
      // SVA: Russian-style wood grip and distinctive muzzle
      const woodGripGeo = new THREE.BoxGeometry(0.04, 0.12, 0.05);
      const woodGrip = new THREE.Mesh(woodGripGeo, new THREE.MeshStandardMaterial({ color: 0x473b31, roughness: 0.8 }));
      woodGrip.position.set(0, -0.08, 0.08);
      woodGrip.rotation.x = 0.32;
      root.add(woodGrip);
      // Distinctive muzzle device
      const muzzleDeviceGeo = new THREE.CylinderGeometry(0.022, 0.018, 0.06, 8);
      muzzleDeviceGeo.rotateX(Math.PI / 2);
      const muzzleDevice = new THREE.Mesh(muzzleDeviceGeo, accentMat);
      muzzleDevice.position.set(0, 0.01, -0.68);
      root.add(muzzleDevice);
    } else if (weaponId === 'mtz_556') {
      // MTZ: Compact shorter handguard and angled grip
      handguard.scale.z = 0.85;
      handguard.position.z = -0.24;
      // Angled foregrip
      const foregripGeo = new THREE.BoxGeometry(0.03, 0.08, 0.04);
      const foregrip = new THREE.Mesh(foregripGeo, primaryMat);
      foregrip.position.set(0, -0.06, -0.2);
      foregrip.rotation.x = 0.4;
      root.add(foregrip);
    }

    muzzlePos.set(0, 0.01, -0.67);
  } else if (weapon.category === 'SMG') {
    // Compact Submachine Gun base
    const recGeo = new THREE.BoxGeometry(0.052, 0.075, 0.26);
    const rec = new THREE.Mesh(recGeo, primaryMat);
    root.add(rec);

    const shroudGeo = new THREE.BoxGeometry(0.048, 0.055, 0.18);
    const shroud = new THREE.Mesh(shroudGeo, secondaryMat);
    shroud.position.set(0, 0.01, -0.2);
    root.add(shroud);

    const compGeo = new THREE.CylinderGeometry(0.018, 0.018, 0.06, 8);
    compGeo.rotateX(Math.PI / 2);
    const comp = new THREE.Mesh(compGeo, accentMat);
    comp.position.set(0, 0.01, -0.32);
    root.add(comp);

    const smgMagGeo = new THREE.BoxGeometry(0.038, 0.2, 0.05);
    const smgMag = new THREE.Mesh(smgMagGeo, accentMat);
    smgMag.position.set(0, -0.11, -0.04);
    smgMag.rotation.x = -0.12;
    root.add(smgMag);

    const gripGeo = new THREE.BoxGeometry(0.04, 0.12, 0.05);
    const grip = new THREE.Mesh(gripGeo, primaryMat);
    grip.position.set(0, -0.08, 0.08);
    grip.rotation.x = 0.35;
    root.add(grip);

    const wireStockGeo = new THREE.BoxGeometry(0.04, 0.06, 0.18);
    const wireStock = new THREE.Mesh(wireStockGeo, matDarkMetal);
    wireStock.position.set(0, 0.01, 0.21);
    root.add(wireStock);

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

    // Weapon-specific variations
    if (weaponId === 'rival_9') {
      // Rival-9: Extended barrel with compensator
      const extCompGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.08, 8);
      extCompGeo.rotateX(Math.PI / 2);
      const extComp = new THREE.Mesh(extCompGeo, accentMat);
      extComp.position.set(0, 0.01, -0.4);
      root.add(extComp);
    } else if (weaponId === 'striker') {
      // Striker: .45 caliber heavier frame
      rec.scale.x = 1.15;
      rec.scale.y = 1.1;
      // Larger magazine
      smgMag.scale.x = 1.2;
      smgMag.scale.y = 1.1;
    } else if (weaponId === 'wsp_swarm') {
      // WSP Swarm: Ultra-compact with dual magazines
      rec.scale.z = 0.85;
      shroud.scale.z = 0.7;
      // Second magazine
      const mag2 = smgMag.clone();
      mag2.position.set(0.025, -0.11, -0.04);
      root.add(mag2);
    } else if (weaponId === 'amr9') {
      // AMR9: AR-platform hybrid with longer barrel
      const longBarrelGeo = new THREE.CylinderGeometry(0.016, 0.016, 0.12, 8);
      longBarrelGeo.rotateX(Math.PI / 2);
      const longBarrel = new THREE.Mesh(longBarrelGeo, matDarkMetal);
      longBarrel.position.set(0, 0.01, -0.42);
      root.add(longBarrel);
      // AR-style stock
      const arStockGeo = new THREE.BoxGeometry(0.045, 0.08, 0.15);
      const arStock = new THREE.Mesh(arStockGeo, secondaryMat);
      arStock.position.set(0, 0.01, 0.2);
      root.add(arStock);
    }

    muzzlePos.set(0, 0.01, -0.36);
  } else if (weapon.category === 'Shotgun') {
    // Tactical Shotgun base
    const recGeo = new THREE.BoxGeometry(0.065, 0.09, 0.34);
    const rec = new THREE.Mesh(recGeo, primaryMat);
    root.add(rec);

    const barrelGeo = new THREE.CylinderGeometry(0.024, 0.024, 0.44, 10);
    barrelGeo.rotateX(Math.PI / 2);
    const barrel = new THREE.Mesh(barrelGeo, matDarkMetal);
    barrel.position.set(0, 0.025, -0.38);
    root.add(barrel);

    const tubeGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.4, 8);
    tubeGeo.rotateX(Math.PI / 2);
    const tube = new THREE.Mesh(tubeGeo, secondaryMat);
    tube.position.set(0, -0.02, -0.36);
    root.add(tube);

    const pumpGeo = new THREE.BoxGeometry(0.06, 0.06, 0.16);
    const pump = new THREE.Mesh(pumpGeo, accentMat);
    pump.position.set(0, -0.02, -0.32);
    root.add(pump);

    const stockGeo = new THREE.BoxGeometry(0.06, 0.11, 0.28);
    const stock = new THREE.Mesh(stockGeo, secondaryMat);
    stock.position.set(0, -0.01, 0.28);
    root.add(stock);

    const ghostRingGeo = new THREE.TorusGeometry(0.018, 0.004, 6, 12);
    const ghostRing = new THREE.Mesh(ghostRingGeo, matBlack);
    ghostRing.position.set(0, 0.07, 0.05);
    root.add(ghostRing);

    const frontPostGeo = new THREE.BoxGeometry(0.005, 0.025, 0.005);
    const frontPost = new THREE.Mesh(frontPostGeo, new THREE.MeshBasicMaterial({ color: 0xff3300 }));
    frontPost.position.set(0, 0.065, -0.58);
    root.add(frontPost);

    // Weapon-specific variations
    if (weaponId === 'lockwood_680') {
      // Lockwood: Classic pump action with wood furniture
      const woodStockGeo = new THREE.BoxGeometry(0.06, 0.11, 0.28);
      const woodStock = new THREE.Mesh(woodStockGeo, new THREE.MeshStandardMaterial({ color: 0x5c3a21, roughness: 0.8 }));
      woodStock.position.set(0, -0.01, 0.28);
      root.add(woodStock);
      // Wooden forend
      const woodForendGeo = new THREE.BoxGeometry(0.06, 0.06, 0.16);
      const woodForend = new THREE.Mesh(woodForendGeo, new THREE.MeshStandardMaterial({ color: 0x5c3a21, roughness: 0.8 }));
      woodForend.position.set(0, -0.02, -0.32);
      root.add(woodForend);
    } else if (weaponId === 'haymaker') {
      // Haymaker: Drum magazine semi-auto
      const drumGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.08, 12);
      drumGeo.rotateX(Math.PI / 2);
      const drum = new THREE.Mesh(drumGeo, accentMat);
      drum.position.set(0, -0.06, -0.1);
      root.add(drum);
      // Extended barrel
      const extBarrelGeo = new THREE.CylinderGeometry(0.024, 0.024, 0.1, 10);
      extBarrelGeo.rotateX(Math.PI / 2);
      const extBarrel = new THREE.Mesh(extBarrelGeo, matDarkMetal);
      extBarrel.position.set(0, 0.025, -0.48);
      root.add(extBarrel);
    } else if (weaponId === 'riveter') {
      // Riveter: AR-frame with magazine
      const arFrameGeo = new THREE.BoxGeometry(0.06, 0.08, 0.3);
      const arFrame = new THREE.Mesh(arFrameGeo, primaryMat);
      arFrame.position.set(0, 0, 0);
      root.add(arFrame);
      // Box magazine
      const boxMagGeo = new THREE.BoxGeometry(0.05, 0.12, 0.06);
      const boxMag = new THREE.Mesh(boxMagGeo, accentMat);
      boxMag.position.set(0, -0.1, -0.05);
      root.add(boxMag);
      // AR-style handguard
      const arHandguardGeo = new THREE.BoxGeometry(0.055, 0.06, 0.2);
      const arHandguard = new THREE.Mesh(arHandguardGeo, secondaryMat);
      arHandguard.position.set(0, 0.01, -0.25);
      root.add(arHandguard);
    }

    muzzlePos.set(0, 0.025, -0.62);
  } else {
    // Heavy Precision Sniper base
    const recGeo = new THREE.BoxGeometry(0.07, 0.1, 0.42);
    const rec = new THREE.Mesh(recGeo, primaryMat);
    root.add(rec);

    const barrelGeo = new THREE.CylinderGeometry(0.022, 0.026, 0.72, 10);
    barrelGeo.rotateX(Math.PI / 2);
    const barrel = new THREE.Mesh(barrelGeo, matDarkMetal);
    barrel.position.set(0, 0.02, -0.55);
    root.add(barrel);

    const brakeGeo = new THREE.BoxGeometry(0.065, 0.05, 0.12);
    const brake = new THREE.Mesh(brakeGeo, accentMat);
    brake.position.set(0, 0.02, -0.95);
    root.add(brake);

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

    const mountGeo1 = new THREE.BoxGeometry(0.035, 0.05, 0.02);
    const mount1 = new THREE.Mesh(mountGeo1, matDarkMetal);
    mount1.position.set(0, 0.075, -0.12);
    root.add(mount1);
    const mount2 = mount1.clone();
    mount2.position.set(0, 0.075, 0.02);
    root.add(mount2);

    const stockGeo = new THREE.BoxGeometry(0.065, 0.13, 0.32);
    const stock = new THREE.Mesh(stockGeo, secondaryMat);
    stock.position.set(0, 0.01, 0.35);
    root.add(stock);

    const magGeo = new THREE.BoxGeometry(0.05, 0.16, 0.1);
    const mag = new THREE.Mesh(magGeo, accentMat);
    mag.position.set(0, -0.11, -0.06);
    mag.rotation.x = -0.15;
    root.add(mag);

    const boltHandleGeo = new THREE.CylinderGeometry(0.008, 0.008, 0.08, 6);
    boltHandleGeo.rotateZ(Math.PI / 3);
    const bolt = new THREE.Mesh(boltHandleGeo, matDarkMetal);
    bolt.position.set(0.06, 0.05, 0.04);
    root.add(bolt);

    // Weapon-specific variations
    if (weaponId === 'longbow') {
      // Longbow: Quick-scope with shorter barrel and lighter frame
      barrel.scale.x = 0.9;
      barrel.scale.y = 0.9;
      barrel.position.z = -0.45;
      brake.position.z = -0.85;
      muzzlePos.set(0, 0.02, -0.92);
      // Lighter stock
      stock.scale.y = 0.9;
    } else if (weaponId === 'kv_inhibitor') {
      // KV Inhibitor: Semi-auto with distinctive muzzle brake
      const muzzleBrakeGeo = new THREE.BoxGeometry(0.07, 0.055, 0.15);
      const muzzleBrake = new THREE.Mesh(muzzleBrakeGeo, accentMat);
      muzzleBrake.position.set(0, 0.02, -1.0);
      root.add(muzzleBrake);
      // Desert bronze scope accent
      const scopeAccentGeo = new THREE.CylinderGeometry(0.023, 0.023, 0.05, 12);
      scopeAccentGeo.rotateX(Math.PI / 2);
      const scopeAccent = new THREE.Mesh(scopeAccentGeo, new THREE.MeshStandardMaterial({ color: 0xa37f48, metalness: 0.8 }));
      scopeAccent.position.set(0, 0.11, -0.15);
      root.add(scopeAccent);
    } else if (weaponId === 'katt_amr') {
      // KATT-AMR: Massive .50 cal with heavy frame
      rec.scale.x = 1.3;
      rec.scale.y = 1.2;
      rec.scale.z = 1.1;
      // Heavier barrel
      barrel.scale.x = 1.2;
      barrel.scale.y = 1.2;
      barrel.position.z = -0.6;
      brake.scale.x = 1.3;
      brake.scale.y = 1.2;
      brake.position.z = -1.05;
      muzzlePos.set(0, 0.02, -1.12);
      // Heavy bipod
      const bipodGeo = new THREE.BoxGeometry(0.08, 0.02, 0.04);
      const bipod = new THREE.Mesh(bipodGeo, matDarkMetal);
      bipod.position.set(0, -0.08, -0.3);
      root.add(bipod);
    }

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