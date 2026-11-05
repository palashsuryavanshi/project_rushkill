import * as THREE from 'three';

export interface BoxCollider {
  min: THREE.Vector3;
  max: THREE.Vector3;
}

export interface WaypointNode {
  id: string;
  pos: THREE.Vector3;
  neighbors: string[];
  area: 'bow' | 'midship' | 'stern' | 'upper';
}

export interface MapData {
  sceneGroup: THREE.Group;
  colliders: BoxCollider[];
  spawnPoints: THREE.Vector3[];
  waypoints: WaypointNode[];
  update: (time: number, dt: number) => void;
}

export function buildHijackedMap(): MapData {
  const root = new THREE.Group();
  const colliders: BoxCollider[] = [];

  function addCollider(minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number) {
    colliders.push({
      min: new THREE.Vector3(minX, minY, minZ),
      max: new THREE.Vector3(maxX, maxY, maxZ),
    });
  }

  // Helper to create a static box mesh and register its collider
  function createSolidBox(
    w: number,
    h: number,
    d: number,
    x: number,
    y: number,
    z: number,
    mat: THREE.Material,
    options?: { noCollider?: boolean; castShadow?: boolean; receiveShadow?: boolean; renderOrder?: number }
  ): THREE.Mesh {
    const geo = new THREE.BoxGeometry(w, h, d);
    const mesh = new THREE.Mesh(geo, mat);
    // Embed static meshes 2mm into whatever they sit on so contact faces are never coplanar (eliminates Z-fighting)
    mesh.position.set(x, y + h / 2 - 0.002, z);
    mesh.castShadow = options?.castShadow ?? true;
    mesh.receiveShadow = options?.receiveShadow ?? true;
    if (options?.renderOrder !== undefined) {
      mesh.renderOrder = options.renderOrder;
    }
    root.add(mesh);

    if (!options?.noCollider) {
      addCollider(x - w / 2, y, z - d / 2, x + w / 2, y + h, z + d / 2);
    }
    return mesh;
  }

  // --- PALETTE MATERIALS ---
  const matHullWhite = new THREE.MeshStandardMaterial({
    color: 0xeeeeee,
    roughness: 0.25,
    metalness: 0.1,
  });

  const matTeakDeck = new THREE.MeshStandardMaterial({
    color: 0xb5824c, // warm rich yacht teak wood
    roughness: 0.7,
    metalness: 0.05,
    depthWrite: true,
    depthTest: true,
  });

  const matDarkCarbon = new THREE.MeshStandardMaterial({
    color: 0x222428,
    roughness: 0.35,
    metalness: 0.4,
  });

  const matChromeRailing = new THREE.MeshStandardMaterial({
    color: 0xd8dde2,
    roughness: 0.15,
    metalness: 0.9,
  });

  const matGlassTinted = new THREE.MeshStandardMaterial({
    color: 0x224466,
    roughness: 0.1,
    metalness: 0.1,
    transparent: true,
    opacity: 0.6,
    depthWrite: false,
  });

  const matHelipadGray = new THREE.MeshStandardMaterial({
    color: 0x3e444c,
    roughness: 0.8,
    metalness: 0.1,
  });

  const matHelipadYellow = new THREE.MeshBasicMaterial({
    color: 0xffcc00,
    polygonOffset: true,
    polygonOffsetFactor: -1.5,
    polygonOffsetUnits: -6.0,
  });

  const matJacuzziWater = new THREE.MeshStandardMaterial({
    color: 0x00d2d3,
    roughness: 0.1,
    metalness: 0.2,
    transparent: true,
    opacity: 0.75,
    depthWrite: false,
  });

  const matTunnelMetal = new THREE.MeshStandardMaterial({
    color: 0x32353b,
    roughness: 0.6,
    metalness: 0.65,
  });

  const matHazardStripe = new THREE.MeshBasicMaterial({
    color: 0xf39c12,
  });

  const matCrateOlive = new THREE.MeshStandardMaterial({
    color: 0x475333,
    roughness: 0.8,
    metalness: 0.2,
  });

  const matCrateNavy = new THREE.MeshStandardMaterial({
    color: 0x243342,
    roughness: 0.75,
    metalness: 0.2,
  });

  // ==========================================
  // 1. MAIN YACHT HULL & DECKS
  // ==========================================
  // Midship hull - split into port and starboard lower bilges, placed strictly below deck (top at Y=-0.4)
  // Port lower bilge (lowered 2mm so its top face is never coplanar with deck slab bottoms)
  const hullPortGeo = new THREE.BoxGeometry(9.3, 6.0, 110);
  const hullPort = new THREE.Mesh(hullPortGeo, matDarkCarbon);
  hullPort.position.set(-7.35, -3.402, 0);
  root.add(hullPort);

  // Starboard lower bilge (lowered 2mm so its top face is never coplanar with deck slab bottoms)
  const hullStarboardGeo = new THREE.BoxGeometry(9.3, 6.0, 110);
  const hullStarboard = new THREE.Mesh(hullStarboardGeo, matDarkCarbon);
  hullStarboard.position.set(7.35, -3.402, 0);
  root.add(hullStarboard);

  // Pointed Bow taper
  const bowNoseGeo = new THREE.ConeGeometry(13, 24, 4);
  bowNoseGeo.rotateX(-Math.PI / 2);
  bowNoseGeo.rotateY(Math.PI / 4);
  const bowNose = new THREE.Mesh(bowNoseGeo, matHullWhite);
  bowNose.position.set(0, -1, -66);
  root.add(bowNose);

  // Main Deck Surface (Teak wood): perfectly seamless, non-overlapping floor sections
  // Top face of all main deck sections is at exactly Y = 0.0
  // 1. Bow Deck (Z: -54 to -22, full width 24.4m)
  createSolidBox(24.4, 0.4, 32, 0, -0.4, -38, matTeakDeck, { renderOrder: 0 });

  // 2. Starboard Walkway (X: 8.5 to 12.2, Z: -22 to +22)
  createSolidBox(3.7, 0.4, 44, 10.35, -0.4, 0, matTeakDeck, { renderOrder: 0 });

  // 3. Port Walkway (X: -12.2 to -8.5, Z: -22 to +22)
  createSolidBox(3.7, 0.4, 44, -10.35, -0.4, 0, matTeakDeck, { renderOrder: 0 });

  // 4. Ground Floor Cabin Interior Floor (X: -8.5 to 8.5, Z: -22 to +22)
  createSolidBox(17.0, 0.4, 44, 0, -0.4, 0, matTeakDeck, { renderOrder: 0 });

  // 5. Stern Deck (Z: 22 to 54, full width 24.4m)
  createSolidBox(24.4, 0.4, 32, 0, -0.4, 38, matTeakDeck, { renderOrder: 0 });

  // Exterior Bulwark / Edge Railings (prevent falling into ocean)
  // Left Railing (Port)
  createSolidBox(0.4, 1.2, 108, -12.2, 0, 0, matChromeRailing);
  // Right Railing (Starboard)
  createSolidBox(0.4, 1.2, 108, 12.2, 0, 0, matChromeRailing);
  // Bow Railing
  createSolidBox(24, 1.2, 0.4, 0, 0, -54.2, matChromeRailing);
  // Stern Railing
  createSolidBox(24, 1.2, 0.4, 0, 0, 54.2, matChromeRailing);

  // ==========================================
  // 2. BOW (FORWARD DECK) - HELIPAD & COVER
  // ==========================================
  // Helipad platform (top at Y = 0.15, resting cleanly on deck at Y = 0.0)
  const helipadBase = createSolidBox(15, 0.15, 15, 0, 0.0, -41, matHelipadGray);
  // Helipad Yellow Circle - raised slightly above helipad surface
  const heliRingGeo = new THREE.RingGeometry(5.2, 5.8, 32);
  heliRingGeo.rotateX(-Math.PI / 2);
  const heliRing = new THREE.Mesh(heliRingGeo, matHelipadYellow);
  heliRing.position.set(0, 0.155, -41);
  heliRing.renderOrder = 1;
  root.add(heliRing);

  // Helipad 'H' letter - resting cleanly on top of helipad
  const hBar1 = createSolidBox(0.6, 0.02, 4.4, -1.6, 0.156, -41, matHelipadYellow, { noCollider: true });
  hBar1.renderOrder = 2;
  const hBar2 = createSolidBox(0.6, 0.02, 4.4, 1.6, 0.156, -41, matHelipadYellow, { noCollider: true });
  hBar2.renderOrder = 2;
  const hCross = createSolidBox(3.2, 0.02, 0.6, 0, 0.156, -41, matHelipadYellow, { noCollider: true });
  hCross.renderOrder = 2;

  // Helipad safety crates & equipment
  createSolidBox(2.2, 1.8, 1.8, -7.5, 0, -35, matCrateOlive);
  createSolidBox(1.8, 1.4, 1.8, -7.5, 1.8, -35, matCrateNavy);
  createSolidBox(2.4, 1.6, 1.6, 7.5, 0, -35, matCrateOlive);

  // Forward Anchor Winches / Machinery
  createSolidBox(2.5, 1.4, 3, 0, 0, -51, matDarkCarbon);

  // Forward Sun Loungers
  createSolidBox(1.2, 0.5, 2.4, -4.5, 0, -49, matHullWhite);
  createSolidBox(1.2, 0.5, 2.4, 4.5, 0, -49, matHullWhite);

  // ==========================================
  // 3. MIDSHIP - CENTRAL LUXURY CABIN (2 FLOORS)
  // ==========================================
  // Cabin Dimensions: W: 17, L: 44 (Z: -22 to +22)
  // --- GROUND FLOOR (Y: 0 to 4.2) ---
  // Ground floor ceiling / Upper floor deck: Y = 4.2 (thickness 0.4, top face at Y = 4.6)
  // Upper floor deck slab: built from boxes with two stairwell openings so stairs exit onto the upper floor
  // Opening A (front stairs, x=5.5): X 4.3..6.7, Z -18.4..-8.8
  // Opening B (rear stairs, x=-5.5): X -6.7..-4.3, Z 8.8..18.4
  createSolidBox(17, 0.4, 3.6, 0, 4.2, -20.2, matTeakDeck); // front full-width strip (Z -22..-18.4)
  createSolidBox(17, 0.4, 3.6, 0, 4.2, 20.2, matTeakDeck); // rear full-width strip (Z 18.4..22)
  createSolidBox(1.8, 0.4, 36.8, -7.6, 4.2, 0, matTeakDeck); // port edge strip (X -8.5..-6.7, Z -18.4..18.4)
  createSolidBox(1.8, 0.4, 36.8, 7.6, 4.2, 0, matTeakDeck); // starboard edge strip (X 6.7..8.5, Z -18.4..18.4)
  createSolidBox(8.6, 0.4, 36.8, 0, 4.2, 0, matTeakDeck); // middle strip (X -4.3..4.3, Z -18.4..18.4)
  createSolidBox(2.4, 0.4, 27.2, -5.5, 4.2, -4.8, matTeakDeck); // under front opening approach (X -6.7..-4.3, Z -18.4..8.8)
  createSolidBox(2.4, 0.4, 27.2, 5.5, 4.2, 4.8, matTeakDeck); // under rear opening approach (X 4.3..6.7, Z -8.8..18.4)

  // Front Wall of Ground Cabin (with central doorway)
  createSolidBox(6.5, 4.2, 0.4, -5.25, 0, -22, matHullWhite);
  createSolidBox(6.5, 4.2, 0.4, 5.25, 0, -22, matHullWhite);
  createSolidBox(4.0, 1.2, 0.4, 0, 3.0, -22, matHullWhite); // doorway lintel

  // Rear Wall of Ground Cabin (with central doorway)
  createSolidBox(6.5, 4.2, 0.4, -5.25, 0, 22, matHullWhite);
  createSolidBox(6.5, 4.2, 0.4, 5.25, 0, 22, matHullWhite);
  createSolidBox(4.0, 1.2, 0.4, 0, 3.0, 22, matHullWhite); // doorway lintel

  // Port Side Wall (X: -8.5) with large tinted glass windows & side doors
  createSolidBox(0.4, 4.2, 14, -8.5, 0, -15, matHullWhite);
  createSolidBox(0.4, 4.2, 14, -8.5, 0, 15, matHullWhite);
  createSolidBox(0.4, 3.8, 16, -8.5, 0.2, 0, matGlassTinted, { renderOrder: 1 }); // mid glass section

  // Starboard Side Wall (X: 8.5) with windows
  createSolidBox(0.4, 4.2, 14, 8.5, 0, -15, matHullWhite);
  createSolidBox(0.4, 4.2, 14, 8.5, 0, 15, matHullWhite);
  createSolidBox(0.4, 3.8, 16, 8.5, 0.2, 0, matGlassTinted, { renderOrder: 1 });

  // Interior Luxury Bar Counter (Z = 0)
  createSolidBox(5.0, 1.2, 1.6, 0, 0, 0, matDarkCarbon);
  createSolidBox(0.8, 2.5, 4.0, 4.0, 0, 0, matHullWhite); // Partition column

  // Interior Sofas / Lounge Seating
  createSolidBox(3.5, 0.8, 1.4, -4.5, 0, -8, matDarkCarbon);
  createSolidBox(3.5, 0.8, 1.4, -4.5, 0, 8, matDarkCarbon);

  // Stairs connecting Ground Floor to Upper Floor at front (Z = -18) - 12 gradual steps
  for (let s = 0; s < 12; s++) {
    const sy = s * 0.35;
    const sz = -18 + s * 0.8;
    createSolidBox(2.4, 0.35, 0.8, 5.5, sy, sz, matDarkCarbon);
  }

  // Stairs connecting Ground Floor to Upper Floor at rear (Z = 18) - 12 gradual steps
  for (let s = 0; s < 12; s++) {
    const sy = s * 0.35;
    const sz = 18 - s * 0.8;
    createSolidBox(2.4, 0.35, 0.8, -5.5, sy, sz, matDarkCarbon);
  }

  // Doorways in Ground Floor side walls at stair locations (Z = -18 and Z = 18)
  // Port side (X = -8.5) - front stair doorway
  createSolidBox(0.4, 2.2, 0.4, -8.5, 0, -19, matHullWhite);
  createSolidBox(0.4, 2.2, 0.4, -8.5, 0, -17, matHullWhite);
  createSolidBox(2.0, 0.4, 0.4, -8.5, 2.2, -18, matHullWhite); // lintel
  // Port side - rear stair doorway
  createSolidBox(0.4, 2.2, 0.4, -8.5, 0, 17, matHullWhite);
  createSolidBox(0.4, 2.2, 0.4, -8.5, 0, 19, matHullWhite);
  createSolidBox(2.0, 0.4, 0.4, -8.5, 2.2, 18, matHullWhite); // lintel

  // Starboard side (X = 8.5) - front stair doorway
  createSolidBox(0.4, 2.2, 0.4, 8.5, 0, -19, matHullWhite);
  createSolidBox(0.4, 2.2, 0.4, 8.5, 0, -17, matHullWhite);
  createSolidBox(2.0, 0.4, 0.4, 8.5, 2.2, -18, matHullWhite); // lintel
  // Starboard side - rear stair doorway
  createSolidBox(0.4, 2.2, 0.4, 8.5, 0, 17, matHullWhite);
  createSolidBox(0.4, 2.2, 0.4, 8.5, 0, 19, matHullWhite);
  createSolidBox(2.0, 0.4, 0.4, 8.5, 2.2, 18, matHullWhite); // lintel

  // --- UPPER FLOOR (Y: 4.6 to 8.2) ---
  // Roof / Upper Deck: Y = 8.2
  createSolidBox(15, 0.4, 34, 0, 8.2, 0, matHullWhite);

  // Upper Bridge Cabin Walls - start at Y=4.6 (top of upper deck slab)
  createSolidBox(14, 3.6, 0.4, 0, 4.6, -16, matGlassTinted, { renderOrder: 1 }); // Front observation bridge glass
  createSolidBox(14, 3.6, 0.4, 0, 4.6, 16, matGlassTinted, { renderOrder: 1 }); // Rear observation glass

  // Port side upper wall (X = -7) with doorways at stairs (Z = -18, 18)
  createSolidBox(0.4, 3.6, 10, -7.0, 4.6, -21, matHullWhite); // Z: -26 to -16
  createSolidBox(0.4, 3.6, 6, -7.0, 4.6, -13, matHullWhite);  // Z: -16 to -10 (doorway gap at -18 to -14)
  createSolidBox(0.4, 3.6, 10, -7.0, 4.6, -3, matHullWhite);   // Z: -8 to 2
  createSolidBox(0.4, 3.6, 6, -7.0, 4.6, 7, matHullWhite);     // Z: 4 to 10 (doorway gap at 14 to 18)
  createSolidBox(0.4, 3.6, 10, -7.0, 4.6, 17, matHullWhite);   // Z: 12 to 22

  // Starboard side upper wall (X = 7) with doorways at stairs (Z = -18, 18)
  createSolidBox(0.4, 3.6, 10, 7.0, 4.6, -21, matHullWhite);
  createSolidBox(0.4, 3.6, 6, 7.0, 4.6, -13, matHullWhite);
  createSolidBox(0.4, 3.6, 10, 7.0, 4.6, -3, matHullWhite);
  createSolidBox(0.4, 3.6, 6, 7.0, 4.6, 7, matHullWhite);
  createSolidBox(0.4, 3.6, 10, 7.0, 4.6, 17, matHullWhite);

  // Doorway lintels for upper floor port side
  createSolidBox(0.4, 0.4, 4.0, -7.0, 7.8, -18, matHullWhite); // front stair lintel
  createSolidBox(0.4, 0.4, 4.0, -7.0, 7.8, 18, matHullWhite);  // rear stair lintel

  // Doorway lintels for upper floor starboard side
  createSolidBox(0.4, 0.4, 4.0, 7.0, 7.8, -18, matHullWhite);
  createSolidBox(0.4, 0.4, 4.0, 7.0, 7.8, 18, matHullWhite);

  // Upper Catwalk Railings - aligned with upper deck at Y=4.6
  createSolidBox(0.3, 1.1, 42, -8.3, 4.6, 0, matChromeRailing);
  createSolidBox(0.3, 1.1, 42, 8.3, 4.6, 0, matChromeRailing);

  // Roof Radar Mast & Satellite Domes
  const mastGeo = new THREE.CylinderGeometry(0.15, 0.25, 4.5, 8);
  const mast = new THREE.Mesh(mastGeo, matChromeRailing);
  mast.position.set(0, 10.8, 0);
  root.add(mast);

  // Rotating Radar Array on mast
  const radarBarGeo = new THREE.BoxGeometry(3.5, 0.4, 0.3);
  const radarBar = new THREE.Mesh(radarBarGeo, matDarkCarbon);
  radarBar.position.set(0, 12.5, 0);
  root.add(radarBar);

  // Satellite Domes
  const domeGeo = new THREE.SphereGeometry(1.2, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2);
  const dome1 = new THREE.Mesh(domeGeo, matHullWhite);
  dome1.position.set(-3.5, 8.6, -4);
  root.add(dome1);
  const dome2 = new THREE.Mesh(domeGeo, matHullWhite);
  dome2.position.set(3.5, 8.6, 4);
  root.add(dome2);

  // ==========================================
  // 4. THE ICONIC UNDERGROUND FLANK TUNNEL
  // ==========================================
  // Flank Tunnel Floor: Y = -3.4 (top at Y = -3.1, W: 5.0, D: 56)
  createSolidBox(5.0, 0.3, 56, 0, -3.4, 0, matTunnelMetal);

  // Tunnel Left & Right Walls
  createSolidBox(0.4, 3.4, 56, -2.6, -3.2, 0, matDarkCarbon);
  createSolidBox(0.4, 3.4, 56, 2.6, -3.2, 0, matDarkCarbon);

  // Overhead Industrial Hazard Pipes along tunnel ceiling
  const pipeGeo = new THREE.CylinderGeometry(0.12, 0.12, 56, 8);
  pipeGeo.rotateX(Math.PI / 2);
  const pipe1 = new THREE.Mesh(pipeGeo, matHazardStripe);
  pipe1.position.set(-1.8, -0.4, 0);
  root.add(pipe1);
  const pipe2 = new THREE.Mesh(pipeGeo, matChromeRailing);
  pipe2.position.set(1.8, -0.4, 0);
  root.add(pipe2);

  // Bulkhead Glow Lights inside tunnel
  [-20, -10, 0, 10, 20].forEach((zPos) => {
    const lightFixture = createSolidBox(0.6, 0.2, 0.4, 0, -0.3, zPos, matHazardStripe, { noCollider: true });
    const pLight = new THREE.PointLight(0xffa500, 0.8, 10);
    pLight.position.set(0, -0.6, zPos);
    root.add(pLight);
  });

  // Tunnel sealed off from gameplay: solid bulkheads at both ends (below-deck area is not playable)
  createSolidBox(5.0, 3.4, 0.5, 0, -3.4, -27.25, matTunnelMetal);
  createSolidBox(5.0, 3.4, 0.5, 0, -3.4, 27.25, matTunnelMetal);

  // ==========================================
  // 5. STERN (REAR AFT DECK) - JACUZZI & LOUNGE
  // ==========================================
  // Raised Jacuzzi Tub at Z = +38
  // Tub rim / surround
  createSolidBox(6.5, 1.2, 6.5, 0, 0, 38, matTeakDeck);
  // Jacuzzi water surface (Y = 1.0) - elevated water plane
  const waterGeo = new THREE.BoxGeometry(5.2, 0.2, 5.2);
  const jacuzziWater = new THREE.Mesh(waterGeo, matJacuzziWater);
  jacuzziWater.position.set(0, 1.05, 38);
  jacuzziWater.renderOrder = 1; // Render after opaque objects
  root.add(jacuzziWater);

  // Stern Dining / Bar counter
  createSolidBox(4.5, 1.2, 1.5, 0, 0, 26, matDarkCarbon);

  // Stern Sun Loungers
  createSolidBox(1.2, 0.5, 2.4, -6.5, 0, 42, matHullWhite);
  createSolidBox(1.2, 0.5, 2.4, 6.5, 0, 42, matHullWhite);

  // Cover Crates on Stern
  createSolidBox(2.2, 2.0, 2.2, -7.5, 0, 30, matCrateNavy);
  createSolidBox(2.2, 1.8, 2.2, 7.5, 0, 30, matCrateOlive);

  // Twin Swimming Platform Stairs down at rear (Z = 53 to 56)
  createSolidBox(7.0, 0.3, 3.5, -6.0, -1.2, 55, matTeakDeck);
  createSolidBox(7.0, 0.3, 3.5, 6.0, -1.2, 55, matTeakDeck);

  // Yacht Flagpole at the stern
  const flagPole = createSolidBox(0.1, 4.5, 0.1, 0, 1.2, 53.5, matChromeRailing, { noCollider: true });
  const flagGeo = new THREE.PlaneGeometry(1.4, 0.9);
  const flagMat = new THREE.MeshStandardMaterial({
    color: 0x3b82f6,
    side: THREE.DoubleSide,
    roughness: 0.6,
  });
  const flag = new THREE.Mesh(flagGeo, flagMat);
  flag.position.set(0.7, 5.0, 53.5);
  root.add(flag);

  // ==========================================
  // 6. SIDE CORRIDOR COVER CRATES & VENTS
  // ==========================================
  // Starboard cover points
  createSolidBox(1.8, 1.6, 2.4, 10.2, 0, -10, matCrateOlive);
  createSolidBox(1.8, 1.6, 2.4, 10.2, 0, 10, matCrateNavy);
  // Port cover points
  createSolidBox(1.8, 1.6, 2.4, -10.2, 0, -10, matCrateNavy);
  createSolidBox(1.8, 1.6, 2.4, -10.2, 0, 10, matCrateOlive);

  // ==========================================
  // 7. OCEAN WATER & HORIZON ISLANDS
  // ==========================================
  const waterPlaneGeo = new THREE.PlaneGeometry(500, 500, 64, 64);
  waterPlaneGeo.rotateX(-Math.PI / 2);
  const waterPlaneMat = new THREE.MeshStandardMaterial({
    color: 0x005577,
    roughness: 0.15,
    metalness: 0.8,
    transparent: true,
    opacity: 0.92,
    depthWrite: false,
  });
  const ocean = new THREE.Mesh(waterPlaneGeo, waterPlaneMat);
  ocean.position.set(0, -3.8, 0);
  ocean.renderOrder = -1; // Render ocean first to avoid transparency sorting issues
  root.add(ocean);

  // Wake foam around yacht
  const wakeGeo = new THREE.PlaneGeometry(36, 140, 16, 16);
  wakeGeo.rotateX(-Math.PI / 2);
  const wakeMat = new THREE.MeshBasicMaterial({
    color: 0x88d5e5,
    transparent: true,
    opacity: 0.35,
    depthWrite: false,
  });
  const wake = new THREE.Mesh(wakeGeo, wakeMat);
  wake.position.set(0, -3.75, 10);
  wake.renderOrder = -1;
  root.add(wake);

  // Distant tropical horizon islands
  const islandMat = new THREE.MeshStandardMaterial({
    color: 0x2e5c38,
    roughness: 0.9,
    metalness: 0.1,
  });

  const islandPositions = [
    { x: -180, z: -160, r: 45, h: 22 },
    { x: 190, z: -120, r: 55, h: 28 },
    { x: -210, z: 140, r: 65, h: 32 },
    { x: 200, z: 180, r: 50, h: 24 },
  ];

  islandPositions.forEach((isl) => {
    const islGeo = new THREE.ConeGeometry(isl.r, isl.h, 7);
    const islMesh = new THREE.Mesh(islGeo, islandMat);
    islMesh.position.set(isl.x, isl.h / 2 - 5, isl.z);
    root.add(islMesh);
  });

  // ==========================================
  // 8. SPAWN POINTS & WAYPOINT GRAPH
  // ==========================================
  // Verified open paths: player & bots spawn on open decks facing central action
  const spawnPoints: THREE.Vector3[] = [
    new THREE.Vector3(0, 0.1, -45), // Bow helipad (facing south)
    new THREE.Vector3(0, 0.1, 46), // Stern aft deck (facing north)
    new THREE.Vector3(10.2, 0.1, -18), // Starboard walkway north
    new THREE.Vector3(-10.2, 0.1, 18), // Port walkway south
    new THREE.Vector3(0, 4.6, 0), // Upper bridge deck (upper slab top at Y = 4.6)
    new THREE.Vector3(3.0, 0.1, -3.0), // Cabin center-rear (clear of sofas/bar)
    new THREE.Vector3(-5.5, 0.1, -3.5), // Cabin lounge entrance (clear of furniture)
  ];

  // Waypoints for AI navigation
  const waypoints: WaypointNode[] = [
    // Bow
    { id: 'bow_heli', pos: new THREE.Vector3(0, 0.1, -41), neighbors: ['bow_stairs', 'bow_port', 'bow_star'], area: 'bow' },
    { id: 'bow_port', pos: new THREE.Vector3(-6, 0.1, -30), neighbors: ['bow_heli', 'port_north', 'bow_stairs'], area: 'bow' },
    { id: 'bow_star', pos: new THREE.Vector3(6, 0.1, -30), neighbors: ['bow_heli', 'star_north', 'bow_stairs'], area: 'bow' },
    { id: 'bow_stairs', pos: new THREE.Vector3(0, 0.1, -26), neighbors: ['bow_heli', 'cabin_f_door'], area: 'bow' },

    // Port Walkway
    { id: 'port_north', pos: new THREE.Vector3(-10.2, 0.1, -16), neighbors: ['bow_port', 'port_mid', 'cabin_port_door'], area: 'midship' },
    { id: 'port_mid', pos: new THREE.Vector3(-10.2, 0.1, 0), neighbors: ['port_north', 'port_south'], area: 'midship' },
    { id: 'port_south', pos: new THREE.Vector3(-10.2, 0.1, 16), neighbors: ['port_mid', 'stern_port', 'cabin_port_door'], area: 'midship' },

    // Starboard Walkway
    { id: 'star_north', pos: new THREE.Vector3(10.2, 0.1, -16), neighbors: ['bow_star', 'star_mid', 'cabin_star_door'], area: 'midship' },
    { id: 'star_mid', pos: new THREE.Vector3(10.2, 0.1, 0), neighbors: ['star_north', 'star_south'], area: 'midship' },
    { id: 'star_south', pos: new THREE.Vector3(10.2, 0.1, 16), neighbors: ['star_mid', 'stern_star', 'cabin_star_door'], area: 'midship' },

    // Central Cabin Ground Floor
    { id: 'cabin_f_door', pos: new THREE.Vector3(0, 0.1, -20), neighbors: ['bow_stairs', 'cabin_center', 'cabin_stairs_up'], area: 'midship' },
    { id: 'cabin_r_door', pos: new THREE.Vector3(0, 0.1, 20), neighbors: ['stern_stairs', 'cabin_center'], area: 'midship' },
    { id: 'cabin_center', pos: new THREE.Vector3(0, 0.1, 0), neighbors: ['cabin_f_door', 'cabin_r_door', 'cabin_port_door', 'cabin_star_door'], area: 'midship' },
    { id: 'cabin_port_door', pos: new THREE.Vector3(-7, 0.1, 0), neighbors: ['cabin_center', 'port_mid'], area: 'midship' },
    { id: 'cabin_star_door', pos: new THREE.Vector3(7, 0.1, 0), neighbors: ['cabin_center', 'star_mid'], area: 'midship' },
    { id: 'cabin_stairs_up', pos: new THREE.Vector3(5.5, 0.1, -14), neighbors: ['cabin_f_door', 'upper_bridge'], area: 'midship' },

    // Upper Bridge Deck
    { id: 'upper_bridge', pos: new THREE.Vector3(0, 4.6, -6), neighbors: ['cabin_stairs_up', 'upper_rear'], area: 'upper' },
    { id: 'upper_rear', pos: new THREE.Vector3(0, 4.6, 6), neighbors: ['upper_bridge'], area: 'upper' },

    // Stern
    { id: 'stern_stairs', pos: new THREE.Vector3(0, 0.1, 26), neighbors: ['cabin_r_door', 'stern_jacuzzi'], area: 'stern' },
    { id: 'stern_jacuzzi', pos: new THREE.Vector3(0, 0.1, 38), neighbors: ['stern_stairs', 'stern_port', 'stern_star', 'stern_back'], area: 'stern' },
    { id: 'stern_port', pos: new THREE.Vector3(-6, 0.1, 32), neighbors: ['port_south', 'stern_jacuzzi'], area: 'stern' },
    { id: 'stern_star', pos: new THREE.Vector3(6, 0.1, 32), neighbors: ['star_south', 'stern_jacuzzi'], area: 'stern' },
    { id: 'stern_back', pos: new THREE.Vector3(0, 0.1, 48), neighbors: ['stern_jacuzzi'], area: 'stern' },
  ];

  // Water animation & radar rotation
  const waterPosAttr = waterPlaneGeo.attributes.position;
  const initialWaterY = new Float32Array(waterPosAttr.count);
  for (let i = 0; i < waterPosAttr.count; i++) {
    initialWaterY[i] = waterPosAttr.getY(i);
  }

  function update(time: number, dt: number) {
    // Spin radar scanner
    radarBar.rotation.y += dt * 1.8;

    // Gentle flag wave
    flag.rotation.y = Math.sin(time * 3) * 0.15;

    // Ocean waves
    for (let i = 0; i < waterPosAttr.count; i++) {
      const u = waterPosAttr.getX(i);
      const w = waterPosAttr.getZ(i);
      const wave = Math.sin(u * 0.05 + time * 1.5) * 0.4 + Math.cos(w * 0.04 + time * 1.2) * 0.35;
      waterPosAttr.setY(i, initialWaterY[i] + wave);
    }
    waterPosAttr.needsUpdate = true;
  }

  return {
    sceneGroup: root,
    colliders,
    spawnPoints,
    waypoints,
    update,
  };
}
