import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

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
  /** Solid geometry plus glass: anything a bullet must not pass through. */
  bulletBlockers: BoxCollider[];
  spawnPoints: THREE.Vector3[];
  waypoints: WaypointNode[];
  update: (time: number, dt: number) => void;
}

export function buildHijackedMap(): MapData {
  const root = new THREE.Group();
  const colliders: BoxCollider[] = [];
  const bulletBlockers: BoxCollider[] = [];

  function addCollider(minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number): BoxCollider {
    const box = {
      min: new THREE.Vector3(minX, minY, minZ),
      max: new THREE.Vector3(maxX, maxY, maxZ),
    };
    colliders.push(box);
    return box;
  }

  function addBulletBlocker(minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number) {
    bulletBlockers.push({
      min: new THREE.Vector3(minX, minY, minZ),
      max: new THREE.Vector3(maxX, maxY, maxZ),
    });
  }

  // Pending static boxes awaiting baking into merged meshes (one per material+renderOrder bucket)
  const pendingBoxes: Array<{ geo: THREE.BoxGeometry; matrix: THREE.Matrix4; mat: THREE.Material; mesh: THREE.Mesh }> = [];

  // Helper to create a static box mesh (deferred: baked into merged meshes at end of build)
  // and register its collider immediately.
  function createSolidBox(
    w: number,
    h: number,
    d: number,
    x: number,
    y: number,
    z: number,
    mat: THREE.Material,
    options?: { noCollider?: boolean; blocksBullets?: boolean; castShadow?: boolean; receiveShadow?: boolean; renderOrder?: number }
  ): THREE.Mesh {
    const geo = new THREE.BoxGeometry(w, h, d);
    const mesh = new THREE.Mesh(geo, mat);
    // Embed static meshes 2mm into whatever they sit on so contact faces are never coplanar (eliminates Z-fighting)
    // NOTE(particle-normal-offset): no change required - 2mm embed applies to box geometry, not particle normals
    mesh.position.set(x, y + h / 2 - 0.002, z);
    mesh.castShadow = options?.castShadow ?? true;
    mesh.receiveShadow = options?.receiveShadow ?? true;
    if (options?.renderOrder !== undefined) {
      mesh.renderOrder = options.renderOrder;
    }
    // Do NOT add mesh to root now; its geometry is captured into a pending bucket entry and
    // merged into a single mesh per material+renderOrder at the end of buildHijackedMap.
    mesh.updateMatrix();
    pendingBoxes.push({ geo, matrix: mesh.matrix.clone(), mat, mesh });

    if (!options?.noCollider) {
      const box = addCollider(x - w / 2, y, z - d / 2, x + w / 2, y + h, z + d / 2);
      // Solid boxes block bullets by default. Share the collider object so the
      // bullet-blocker list stays identity-comparable with the movement list.
      if (options?.blocksBullets ?? true) {
        bulletBlockers.push(box);
      }
    } else if (options?.blocksBullets) {
      addBulletBlocker(x - w / 2, y, z - d / 2, x + w / 2, y + h, z + d / 2);
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

  // Map material uuid -> material instance so bakeMergedStatic can recover the right material per bucket
  const materialByUuid = new Map<string, THREE.Material>([
    [matHullWhite.uuid, matHullWhite],
    [matTeakDeck.uuid, matTeakDeck],
    [matDarkCarbon.uuid, matDarkCarbon],
    [matChromeRailing.uuid, matChromeRailing],
    [matGlassTinted.uuid, matGlassTinted],
    [matHelipadGray.uuid, matHelipadGray],
    [matHelipadYellow.uuid, matHelipadYellow],
    [matJacuzziWater.uuid, matJacuzziWater],
    [matTunnelMetal.uuid, matTunnelMetal],
    [matHazardStripe.uuid, matHazardStripe],
    [matCrateOlive.uuid, matCrateOlive],
    [matCrateNavy.uuid, matCrateNavy],
  ]);
  // ==========================================
  // 1. MAIN YACHT HULL & DECKS
  // ==========================================
  // Five layout zones along the hull. Bow at negative z.
  const ZONE = {
    bowDeck: { min: -54, max: -36 },
    bowCabin: { min: -36, max: -18 },
    center: { min: -18, max: 18 },
    sternCabin: { min: 18, max: 36 },
    sternDeck: { min: 36, max: 54 },
  } as const;

  // Hollow hull shell: thin outer walls + bottom leave the service corridors open.
  createSolidBox(0.3, 6.0, 108, -12.05, -6.4, 0, matDarkCarbon);
  createSolidBox(0.3, 6.0, 108, 12.05, -6.4, 0, matDarkCarbon);
  createSolidBox(24.4, 0.3, 108, 0, -6.7, 0, matDarkCarbon, { noCollider: true });

  // Deck undertray (tunnel ceiling), cut around both maintenance stairwells.
  createSolidBox(21.8, 0.3, 36, 0, -0.7, -36, matDarkCarbon);
  createSolidBox(19.4, 0.3, 8, 1.2, -0.7, -14, matDarkCarbon);
  createSolidBox(21.8, 0.3, 20, 0, -0.7, 0, matDarkCarbon);
  createSolidBox(19.4, 0.3, 8, -1.2, -0.7, 14, matDarkCarbon);
  createSolidBox(21.8, 0.3, 36, 0, -0.7, 36, matDarkCarbon);

  // Pointed Bow taper
  const bowNoseGeo = new THREE.ConeGeometry(13, 24, 4);
  bowNoseGeo.rotateX(-Math.PI / 2);
  bowNoseGeo.rotateY(Math.PI / 4);
  const bowNose = new THREE.Mesh(bowNoseGeo, matHullWhite);
  bowNose.position.set(0, -1, -66);
  root.add(bowNose);

  // Deck floors: top face at exactly Y = 0.0, one slab per zone, full width.
  createSolidBox(24.4, 0.4, 18, 0, -0.4, -45, matTeakDeck, { renderOrder: 0 }); // bow deck
  createSolidBox(17.0, 0.4, 36, 0, -0.4, 0, matTeakDeck, { renderOrder: 0 }); // centre deck core
  createSolidBox(3.7, 0.4, 28, -10.35, -0.4, 4, matTeakDeck, { renderOrder: 0 }); // port strip (stairwell cut out)
  createSolidBox(3.7, 0.4, 28, 10.35, -0.4, -4, matTeakDeck, { renderOrder: 0 }); // starboard strip (stairwell cut out)
  createSolidBox(17.0, 0.4, 18, 0, -0.4, -27, matTeakDeck, { renderOrder: 0 }); // bow cabin floor
  createSolidBox(17.0, 0.4, 18, 0, -0.4, 27, matTeakDeck, { renderOrder: 0 }); // stern cabin floor
  createSolidBox(3.7, 0.4, 18, -10.35, -0.4, -27, matTeakDeck, { renderOrder: 0 }); // bow port walkway
  createSolidBox(3.7, 0.4, 18, 10.35, -0.4, -27, matTeakDeck, { renderOrder: 0 }); // bow starboard walkway
  createSolidBox(3.7, 0.4, 18, -10.35, -0.4, 27, matTeakDeck, { renderOrder: 0 }); // stern port walkway
  createSolidBox(3.7, 0.4, 18, 10.35, -0.4, 27, matTeakDeck, { renderOrder: 0 }); // stern starboard walkway
  createSolidBox(24.4, 0.4, 18, 0, -0.4, 45, matTeakDeck, { renderOrder: 0 }); // stern deck

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
  const helipadBase = createSolidBox(10, 0.15, 10, 0, 0.0, -45, matHelipadGray);
  // Helipad Yellow Circle - raised slightly above helipad surface
  const heliRingGeo = new THREE.RingGeometry(3.6, 4.0, 32);
  heliRingGeo.rotateX(-Math.PI / 2);
  const heliRing = new THREE.Mesh(heliRingGeo, matHelipadYellow);
  heliRing.position.set(0, 0.155, -45);
  heliRing.renderOrder = 1;
  root.add(heliRing);

  // Helipad 'H' letter - resting cleanly on top of helipad
  const hBar1 = createSolidBox(0.5, 0.02, 3.2, -1.3, 0.156, -45, matHelipadYellow, { noCollider: true });
  hBar1.renderOrder = 2;
  const hBar2 = createSolidBox(0.5, 0.02, 3.2, 1.3, 0.156, -45, matHelipadYellow, { noCollider: true });
  hBar2.renderOrder = 2;
  const hCross = createSolidBox(2.6, 0.02, 0.5, 0, 0.156, -45, matHelipadYellow, { noCollider: true });
  hCross.renderOrder = 2;

  // Bow deck cover: one crate stack per side, anchor winch forward, two loungers.
  createSolidBox(2.2, 1.8, 1.8, -7, 0, -42, matCrateOlive);
  createSolidBox(1.8, 1.4, 1.8, -7, 1.8, -42, matCrateNavy);
  createSolidBox(2.4, 1.6, 1.6, 7, 0, -42, matCrateOlive);
  createSolidBox(2.5, 1.4, 3, 0, 0, -51, matDarkCarbon);
  createSolidBox(1.2, 0.5, 2.4, -4.5, 0, -49, matHullWhite);
  createSolidBox(1.2, 0.5, 2.4, 4.5, 0, -49, matHullWhite);

  // ==========================================
  // 3. MIRRORED BOW / STERN CABINS, STAIRS, UPPER ROOMS
  // ==========================================
  function addStairRun(
    x: number,
    zStart: number,
    zDirection: 1 | -1,
    width: number,
    steps: number,
    rise: number,
    run: number,
    mat: THREE.Material
  ): void {
    for (let i = 0; i < steps; i++) {
      createSolidBox(width, rise, run, x, i * rise, zStart + zDirection * i * run, mat);
    }
  }

  // m = 1 builds the bow cabin, m = -1 rotates it 180 degrees for the stern.
  function buildCabin(m: 1 | -1): void {
    const at = (v: number) => v * m;

    // --- ground floor shell ---
    // Front and rear walls with a 4 m central doorway and lintel.
    for (const z of [at(-36), at(-18)]) {
      createSolidBox(6.5, 4.2, 0.4, -5.25, 0, z, matHullWhite);
      createSolidBox(6.5, 4.2, 0.4, 5.25, 0, z, matHullWhite);
      createSolidBox(4.0, 1.4, 0.4, 0, 2.8, z, matHullWhite);
    }

    // Outboard walls, open at the z -27 / +27 walkway doorway (glass pane sits there).
    for (const x of [-8.5, 8.5]) {
      createSolidBox(0.4, 4.2, 7, x, 0, at(-32.5), matHullWhite);
      createSolidBox(0.4, 4.2, 7, x, 0, at(-21.5), matHullWhite);
    }

    // Hall partitions at x +/-3 with a 6 m central opening.
    for (const x of [-3, 3]) {
      createSolidBox(0.3, 4.2, 6, x, 0, at(-33), matHullWhite);
      createSolidBox(0.3, 4.2, 6, x, 0, at(-21), matHullWhite);
    }

    // Ground cover: bar in the port room, two sofas starboard, hall column.
    createSolidBox(3.0, 1.1, 1.2, at(-5.5), 0, at(-33), matDarkCarbon);
    createSolidBox(1.4, 0.8, 2.6, at(6.2), 0, at(-33), matCrateNavy);
    createSolidBox(1.4, 0.8, 2.6, at(6.2), 0, at(-21), matCrateNavy);
    createSolidBox(0.8, 2.5, 0.8, at(2.0), 0, at(-34.5), matHullWhite);

    // Internal stair up to the upper room. 15 treads at 4.6/15 m rise land flush
    // with the floor strip at the bow/stern face, so the top node is fully supported.
    addStairRun(at(4.6), at(-23.4), m === 1 ? -1 : 1, 2.4, 15, 4.6 / 15, 0.8, matDarkCarbon);

    // External stair on the walkway, landing at upper floor height.
    addStairRun(at(10.2), at(-47.2), m === 1 ? 1 : -1, 2.0, 14, 0.33, 0.8, matChromeRailing);
    createSolidBox(4.0, 0.4, 3.0, at(10.2), 4.2, at(-34.9), matTeakDeck);

    // Upper floor slab around the internal stairwell (x 3.4..5.8, z -35..-23.4).
    createSolidBox(11.9, 0.4, 18, at(-2.55), 4.2, at(-27), matTeakDeck);
    createSolidBox(2.4, 0.4, 18, at(7.0), 4.2, at(-27), matTeakDeck);
    createSolidBox(2.4, 0.4, 1.0, at(4.6), 4.2, at(-35.5), matTeakDeck);
    createSolidBox(2.4, 0.4, 5.4, at(4.6), 4.2, at(-20.7), matTeakDeck);

    // Upper room: solid outboard walls, open firing faces with waist-high rails.
    createSolidBox(0.3, 3.6, 16, at(-7), 4.6, at(-27), matHullWhite);
    createSolidBox(0.3, 3.6, 14.4, at(7), 4.6, at(-26.2), matHullWhite);
    createSolidBox(10.4, 1.0, 0.15, at(-1.8), 4.6, at(-35), matChromeRailing);
    createSolidBox(1.2, 1.0, 0.15, at(6.4), 4.6, at(-35), matChromeRailing);
    createSolidBox(14.0, 1.0, 0.15, 0, 4.6, at(-19), matChromeRailing);

    // Ceiling and upper cover.
    createSolidBox(14.6, 0.4, 16, 0, 8.2, at(-27), matHullWhite);
    createSolidBox(1.6, 1.0, 1.2, at(4), 4.6, at(-22), matDarkCarbon);
    createSolidBox(1.6, 0.7, 1.0, at(-4), 4.6, at(-22), matHullWhite);
  }

  buildCabin(1);
  buildCabin(-1);

  // Four ground-level teal panes beside the walkway doorways (walk-through, bullet-proof).
  for (const x of [-8.5, 8.5]) {
    for (const z of [-27, 27]) {
      createSolidBox(0.4, 3.8, 4, x, 0.2, z, matGlassTinted, {
        renderOrder: 1,
        noCollider: true,
        blocksBullets: true,
      });
    }
  }
  // ==========================================
  // 4. CENTRAL DECK - POOL, LOUNGE, PLANTER, STAIRWELLS
  // ==========================================
  // Pool basin with teak curb (cover) and walk-through water.
  createSolidBox(0.4, 0.4, 14, -8.0, 0, 0, matTeakDeck);
  createSolidBox(0.4, 0.4, 14, -3.0, 0, 0, matTeakDeck);
  createSolidBox(4.6, 0.4, 0.4, -5.5, 0, -6.8, matTeakDeck);
  createSolidBox(4.6, 0.4, 0.4, -5.5, 0, 6.8, matTeakDeck);
  createSolidBox(4.6, 0.05, 13.2, -5.5, 0.06, 0, matJacuzziWater, { noCollider: true, renderOrder: 1 });

  // Covered lounge: solid roof on four columns, sofas and table inside.
  createSolidBox(5.4, 0.2, 14, 5.5, 3.2, 0, matHullWhite);
  for (const x of [3.2, 7.8]) {
    for (const z of [-6.5, 6.5]) {
      createSolidBox(0.25, 3.2, 0.25, x, 0, z, matChromeRailing);
    }
  }
  createSolidBox(1.4, 0.8, 2.6, 4.0, 0, -4.5, matCrateNavy);
  createSolidBox(1.4, 0.8, 2.6, 4.0, 0, 4.5, matCrateNavy);
  createSolidBox(1.2, 0.5, 1.2, 6.2, 0, 0, matDarkCarbon);
  createSolidBox(0.5, 1.0, 1.0, 7.9, 0, 0, matTeakDeck);

  // Centre planter / sightline breaker.
  createSolidBox(2.8, 1.2, 6, 0, 0, 0, matCrateOlive);
  const palmGeo = new THREE.CylinderGeometry(0.12, 0.2, 3.2, 8);
  const palm = new THREE.Mesh(palmGeo, matChromeRailing);
  palm.position.set(0, 2.8, 0);
  root.add(palm);

  // Centre-lane benches.
  createSolidBox(2.0, 0.7, 1.0, 0, 0, -11, matCrateNavy);
  createSolidBox(2.0, 0.7, 1.0, 0, 0, 11, matCrateNavy);

  // Maintenance stairwells (10 treads descending 0.34 m each) and brass rails.
  for (let i = 0; i < 10; i++) {
    createSolidBox(2.4, 0.34, 0.8, 10.2, -(i + 1) * 0.34, 10 + i * 0.8, matDarkCarbon);
    createSolidBox(2.4, 0.34, 0.8, -10.2, -(i + 1) * 0.34, -10 - i * 0.8, matDarkCarbon);
  }
  createSolidBox(0.15, 1.0, 8, 8.55, 0, 14, matChromeRailing);
  createSolidBox(0.15, 1.0, 8, -8.55, 0, -14, matChromeRailing);
  // Narrow outboard service ledge keeps the port walkway a continuous bot lane
  // across the maintenance stairwell cut (z -18..-10).
  createSolidBox(1.0, 0.4, 8, -11.7, -0.4, -14, matTeakDeck);

  // ==========================================
  // 5. BELOW-DECK MAINTENANCE TUNNEL
  // ==========================================
  createSolidBox(5.2, 0.3, 72, 0, -3.4, 0, matTunnelMetal);
  createSolidBox(0.3, 3.4, 48, 2.75, -3.4, -12, matDarkCarbon);
  createSolidBox(0.3, 3.4, 20, 2.75, -3.4, 26, matDarkCarbon);
  createSolidBox(0.3, 3.4, 20, -2.75, -3.4, -26, matDarkCarbon);
  createSolidBox(0.3, 3.4, 48, -2.75, -3.4, 12, matDarkCarbon);

  // Side branches and stair landings.
  createSolidBox(7.6, 0.3, 4, 6.4, -3.4, 14, matTunnelMetal);
  createSolidBox(3.7, 0.3, 4, 10.35, -3.4, 16, matTunnelMetal);
  createSolidBox(7.6, 0.3, 4, -6.4, -3.4, -14, matTunnelMetal);
  createSolidBox(3.7, 0.3, 4, -10.35, -3.4, -16, matTunnelMetal);

  // End caps and decorative bulkhead frames.
  createSolidBox(5.2, 3.4, 0.3, 0, -3.4, -36.1, matTunnelMetal);
  createSolidBox(5.2, 3.4, 0.3, 0, -3.4, 36.1, matTunnelMetal);
  for (const z of [-24, -12, 12, 24]) {
    createSolidBox(5.2, 0.8, 0.2, 0, -1.2, z, matTunnelMetal, { noCollider: true });
  }

  // Crate clusters against the tunnel walls (clear of the centre path).
  createSolidBox(1.2, 1.0, 1.2, 1.8, -3.4, -6, matCrateOlive);
  createSolidBox(1.2, 1.0, 1.2, 1.8, -3.4, 6, matCrateNavy);
  createSolidBox(1.2, 1.0, 1.2, -1.8, -3.4, -6, matCrateNavy);
  createSolidBox(1.2, 1.0, 1.2, -1.8, -3.4, 6, matCrateOlive);

  // ==========================================
  // 6. STERN DECK - JACUZZI & COVER
  // ==========================================
  createSolidBox(6.5, 1.2, 6.5, 0, 0, 50, matTeakDeck);
  const jacuzziWater = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.2, 5.2), matJacuzziWater);
  jacuzziWater.position.set(0, 1.05, 50);
  jacuzziWater.renderOrder = 1;
  root.add(jacuzziWater);

  createSolidBox(2.2, 1.8, 1.8, -7.5, 0, 50, matCrateNavy);
  createSolidBox(2.2, 1.8, 1.8, 7.5, 0, 50, matCrateOlive);
  createSolidBox(1.2, 0.5, 2.4, -6.5, 0, 40, matHullWhite);
  createSolidBox(1.2, 0.5, 2.4, 6.5, 0, 40, matHullWhite);

  const flagPole = createSolidBox(0.1, 4.5, 0.1, 0, 1.2, 53.5, matChromeRailing, { noCollider: true });
  const flagMat = new THREE.MeshStandardMaterial({
    color: 0x3b82f6,
    side: THREE.DoubleSide,
    roughness: 0.6,
  });
  const flagGeo = new THREE.PlaneGeometry(1.4, 0.9);
  const flag = new THREE.Mesh(flagGeo, flagMat);
  flag.position.set(0.7, 5.0, 53.5);
  root.add(flag);

  // Radar mast on the planter and satellite domes on the cabin roofs.
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.25, 4.5, 8), matChromeRailing);
  mast.position.set(0, 3.4, 0);
  root.add(mast);
  const radarBar = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.4, 0.3), matDarkCarbon);
  radarBar.position.set(0, 5.4, 0);
  root.add(radarBar);
  const domeGeo = new THREE.SphereGeometry(1.2, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2);
  const dome1 = new THREE.Mesh(domeGeo, matHullWhite);
  dome1.position.set(-3.5, 8.6, -27);
  root.add(dome1);
  const dome2 = new THREE.Mesh(domeGeo, matHullWhite);
  dome2.position.set(3.5, 8.6, 27);
  root.add(dome2);

  // Warm practicals: four tunnel, two cabin, one lounge = 7 point lights.
  for (const z of [-24, -8, 8, 24]) {
    createSolidBox(0.6, 0.15, 0.4, 0, -1.25, z, matHazardStripe, { noCollider: true });
    const light = new THREE.PointLight(0xffa53a, 0.7, 9);
    light.position.set(0, -1.2, z);
    root.add(light);
  }
  for (const z of [-27, 27]) {
    const light = new THREE.PointLight(0xffb46b, 0.8, 12);
    light.position.set(0, 3.0, z);
    root.add(light);
  }
  const loungeLight = new THREE.PointLight(0xffc07a, 0.6, 10);
  loungeLight.position.set(5.5, 2.6, 0);
  root.add(loungeLight);


  // ==========================================
  // 7. OCEAN WATER & HORIZON ISLANDS
  // ==========================================
  const waterPlaneGeo = new THREE.PlaneGeometry(500, 500, 32, 32);
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
  const spawnPoints: THREE.Vector3[] = [
    new THREE.Vector3(0, 0.1, -46),
    new THREE.Vector3(-9.5, 0.1, -42),
    new THREE.Vector3(9.5, 0.1, -42),
    new THREE.Vector3(0, 0.1, 46),
    new THREE.Vector3(-9.5, 0.1, 42),
    new THREE.Vector3(9.5, 0.1, 42),
    new THREE.Vector3(0, 4.6, -28),
    new THREE.Vector3(0, 4.6, 28),
  ];

  const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const waypoints: WaypointNode[] = [
    // Bow deck / bow cabin
    { id: 'bow_heli', pos: v(0, 0.1, -45), neighbors: ['bow_port', 'bow_star', 'bow_cabin_door', 'bow_ext_bottom'], area: 'bow' },
    { id: 'bow_port', pos: v(-9.5, 0.1, -38), neighbors: ['bow_heli', 'port_north'], area: 'bow' },
    { id: 'bow_star', pos: v(9.5, 0.1, -38), neighbors: ['bow_heli', 'star_north'], area: 'bow' },
    { id: 'bow_cabin_door', pos: v(0, 0.1, -35.4), neighbors: ['bow_heli', 'bow_hall'], area: 'bow' },
    { id: 'bow_hall', pos: v(0, 0.1, -27), neighbors: ['bow_cabin_door', 'bow_port_room', 'bow_star_room', 'bow_stair_bottom', 'center_north'], area: 'bow' },
    { id: 'bow_port_room', pos: v(-5.5, 0.1, -27), neighbors: ['bow_hall', 'port_north'], area: 'bow' },
    { id: 'bow_star_room', pos: v(5.5, 0.1, -27), neighbors: ['bow_hall', 'star_north'], area: 'bow' },
    { id: 'bow_stair_bottom', pos: v(4.6, 0.1, -23.8), neighbors: ['bow_hall', 'bow_stair_top'], area: 'bow' },
    { id: 'bow_stair_top', pos: v(4.6, 4.6, -34.6), neighbors: ['bow_stair_bottom', 'upper_bow_land', 'bow_ext_top'], area: 'upper' },
    { id: 'upper_bow_land', pos: v(3.0, 4.6, -34.6), neighbors: ['bow_stair_top', 'upper_bow'], area: 'upper' },
    { id: 'upper_bow', pos: v(0, 4.6, -28), neighbors: ['upper_bow_land'], area: 'upper' },
    { id: 'bow_ext_bottom', pos: v(10.2, 0.1, -48.5), neighbors: ['bow_heli'], area: 'bow' },
    { id: 'bow_ext_top', pos: v(10.2, 4.6, -35), neighbors: ['bow_stair_top'], area: 'upper' },

    // Port walkway
    { id: 'port_north', pos: v(-10.2, 0.1, -26.5), neighbors: ['bow_port', 'bow_port_room', 'port_bridge_north'], area: 'midship' },
    { id: 'port_bridge_north', pos: v(-11.7, 0.1, -18.4), neighbors: ['port_north', 'port_bridge_south'], area: 'midship' },
    { id: 'port_bridge_south', pos: v(-11.7, 0.1, -9.6), neighbors: ['port_bridge_north', 'port_mid'], area: 'midship' },
    { id: 'port_mid', pos: v(-10.2, 0.1, -7), neighbors: ['port_bridge_south', 'pool_edge', 'port_center', 'maint_port_bottom'], area: 'midship' },
    { id: 'port_center', pos: v(-10.2, 0.1, 4), neighbors: ['port_mid', 'port_aft'], area: 'midship' },
    { id: 'port_aft', pos: v(-10.2, 0.1, 15), neighbors: ['port_center', 'port_south'], area: 'midship' },
    { id: 'port_south', pos: v(-10.2, 0.1, 24), neighbors: ['port_aft', 'port_deck', 'stern_port_room'], area: 'midship' },
    { id: 'port_deck', pos: v(-10.2, 0.1, 32), neighbors: ['port_south', 'port_stern'], area: 'stern' },

    { id: 'port_stern', pos: v(-11.7, 0.1, 38), neighbors: ['port_deck', 'port_aftdeck'], area: 'stern' },

    // Starboard walkway
    { id: 'star_north', pos: v(10.2, 0.1, -27), neighbors: ['bow_star', 'bow_star_room', 'star_center'], area: 'midship' },
    { id: 'star_center', pos: v(10.2, 0.1, -16), neighbors: ['star_north', 'star_mid'], area: 'midship' },
    { id: 'star_mid', pos: v(10.2, 0.1, -5), neighbors: ['star_center', 'lounge', 'star_south'], area: 'midship' },
    { id: 'star_south', pos: v(10.2, 0.1, 7), neighbors: ['star_mid', 'center_south', 'maint_star_bottom'], area: 'midship' },
    { id: 'star_aft', pos: v(10.2, 0.1, 22), neighbors: ['star_tail'], area: 'midship' },
    { id: 'star_tail', pos: v(10.2, 0.1, 27), neighbors: ['star_aft', 'stern_star_room', 'star_deck'], area: 'midship' },
    { id: 'star_deck', pos: v(10.2, 0.1, 38), neighbors: ['star_tail', 'stern_deck', 'stern_jacuzzi'], area: 'stern' },

    // Central deck
    { id: 'center_north', pos: v(2.5, 0.1, -15.5), neighbors: ['bow_hall', 'center_west'], area: 'midship' },
    { id: 'center_west', pos: v(-4.5, 0.1, -8), neighbors: ['center_north', 'pool_edge'], area: 'midship' },
    { id: 'pool_edge', pos: v(-9.6, 0.1, 0), neighbors: ['port_mid', 'center_west', 'center_southwest'], area: 'midship' },
    { id: 'center_southwest', pos: v(-4.5, 0.1, 8), neighbors: ['pool_edge', 'center_south'], area: 'midship' },
    { id: 'center_south', pos: v(4.5, 0.1, 14), neighbors: ['center_southwest', 'center_southeast', 'star_south'], area: 'midship' },
    { id: 'center_southeast', pos: v(5.5, 0.1, 8), neighbors: ['center_south', 'lounge'], area: 'midship' },
    { id: 'lounge', pos: v(7.2, 0.1, 0), neighbors: ['star_mid', 'center_southeast'], area: 'midship' },

    // Stern cabin
    { id: 'stern_cabin_door', pos: v(0, 0.1, 34.5), neighbors: ['stern_hall', 'stern_deck'], area: 'stern' },
    { id: 'stern_hall', pos: v(0, 0.1, 27), neighbors: ['stern_cabin_door', 'stern_port_room', 'stern_star_room', 'stern_stair_bottom'], area: 'stern' },
    { id: 'stern_port_room', pos: v(-5.5, 0.1, 27), neighbors: ['stern_hall', 'port_south'], area: 'stern' },
    { id: 'stern_star_room', pos: v(5.5, 0.1, 27), neighbors: ['stern_hall', 'star_tail'], area: 'stern' },
    { id: 'stern_stair_bottom', pos: v(-4.6, 0.1, 23.8), neighbors: ['stern_hall', 'stern_stair_top'], area: 'stern' },
    { id: 'stern_stair_top', pos: v(-4.6, 4.6, 34.6), neighbors: ['stern_stair_bottom', 'upper_stern_land', 'stern_ext_top'], area: 'upper' },
    { id: 'upper_stern_land', pos: v(-3.0, 4.6, 34.6), neighbors: ['stern_stair_top', 'upper_stern'], area: 'upper' },
    { id: 'upper_stern', pos: v(0, 4.6, 28), neighbors: ['upper_stern_land'], area: 'upper' },
    { id: 'port_aftdeck', pos: v(-11.7, 0.1, 49), neighbors: ['port_stern', 'stern_ext_bottom'], area: 'stern' },
    { id: 'stern_ext_bottom', pos: v(-10.2, 0.1, 48.5), neighbors: ['port_aftdeck'], area: 'stern' },
    { id: 'stern_ext_top', pos: v(-10.2, 4.6, 35), neighbors: ['stern_stair_top'], area: 'upper' },
    { id: 'stern_deck', pos: v(0, 0.1, 38), neighbors: ['stern_cabin_door', 'star_deck', 'stern_jacuzzi'], area: 'stern' },
    { id: 'stern_jacuzzi', pos: v(5.5, 0.1, 46), neighbors: ['stern_deck', 'star_deck'], area: 'stern' },

    // Maintenance tunnel
    { id: 'maint_north', pos: v(0, -3.3, -32), neighbors: ['maint_n1'], area: 'midship' },
    { id: 'maint_n1', pos: v(0, -3.3, -21), neighbors: ['maint_north', 'maint_port_junction'], area: 'midship' },
    { id: 'maint_port_junction', pos: v(-2.6, -3.3, -14), neighbors: ['maint_n1', 'maint_n2', 'maint_port_bottom'], area: 'midship' },
    { id: 'maint_n2', pos: v(0, -3.3, -6), neighbors: ['maint_port_junction', 'maint_center'], area: 'midship' },
    { id: 'maint_center', pos: v(0, -3.3, 5), neighbors: ['maint_n2', 'maint_star_junction'], area: 'midship' },
    { id: 'maint_star_junction', pos: v(2.6, -3.3, 14), neighbors: ['maint_center', 'maint_south', 'maint_star_bottom'], area: 'midship' },
    { id: 'maint_south', pos: v(0, -3.3, 25), neighbors: ['maint_star_junction'], area: 'midship' },
    { id: 'maint_star_bottom', pos: v(10.2, -3.3, 16.5), neighbors: ['maint_star_junction', 'star_south'], area: 'midship' },
    { id: 'maint_port_bottom', pos: v(-10.2, -3.3, -16.5), neighbors: ['maint_port_junction', 'port_mid'], area: 'midship' },
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

  // --- Bake static boxes into one merged mesh per material+renderOrder bucket ---
  // Dev counters
  if (import.meta.env?.DEV) {
    console.log(`PRE-BAKE COLLIDERS: ${colliders.length}`);
    console.log(`PRE-BAKE PENDING BOXES: ${pendingBoxes.length}`);
  }

  function bakeMergedStatic(
    buckets: Map<string, Array<{ geo: THREE.BoxGeometry; matrix: THREE.Matrix4; renderOrder: number }>>,
    rootGroup: THREE.Group
  ) {
    for (const [key, items] of buckets) {
      const [matUuid, renderOrder] = key.split('|');
      const mat = materialByUuid.get(matUuid);
      if (!mat) continue;
      const geos = items.map(({ geo, matrix }) => geo.clone().applyMatrix4(matrix));
      const merged = mergeGeometries(geos, false);
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.renderOrder = Number(renderOrder);
      rootGroup.add(mesh);
    }
  }

  // Group pending boxes by material uuid + renderOrder (read renderOrder from the returned mesh
  // so post-call assignments like hBar.renderOrder = 2 are respected)
  const buckets = new Map<string, Array<{ geo: THREE.BoxGeometry; matrix: THREE.Matrix4; renderOrder: number }>>();
  for (const entry of pendingBoxes) {
    const ro = entry.mesh.renderOrder ?? 0;
    const key = entry.mat.uuid + '|' + ro;
    if (!buckets.has(key)) {
      buckets.set(key, []);
    }
    buckets.get(key)!.push({ geo: entry.geo, matrix: entry.matrix, renderOrder: ro });
  }

  bakeMergedStatic(buckets, root);

  if (import.meta.env?.DEV) {
    console.log(`POST-BAKE COLLIDERS: ${colliders.length}`);
    console.log(`POST-BAKE ROOT CHILDREN: ${root.children.length}`);
  }

  return {
    sceneGroup: root,
    colliders,
    bulletBlockers,
    spawnPoints,
    waypoints,
    update,
  };
}
