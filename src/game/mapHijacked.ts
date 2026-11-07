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
  /** Inverted sunset sphere, reused to bake the PMREM environment. */
  skyDome: THREE.Mesh;
  update: (time: number, dt: number) => void;
}

/**
 * 128 px teak plank texture: warm base, darker seams every 12 px.
 * Returns null when there is no DOM (node/tsx tests), so the map still builds headless.
 */
function makeTeakTexture(): THREE.Texture | null {
  if (typeof document === 'undefined') return null;

  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.fillStyle = '#9c5f36';
  ctx.fillRect(0, 0, size, size);

  // Faint grain streaks keep the planks from reading as flat fill.
  ctx.fillStyle = '#a8693c';
  for (let x = 0; x < size; x += 12) {
    ctx.fillRect(x + 4, 0, 2, size);
  }

  // Dark plank seams.
  ctx.fillStyle = '#7a4426';
  for (let x = 0; x < size; x += 12) {
    ctx.fillRect(x, 0, 2, size);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(8, 24);
  texture.needsUpdate = true;
  return texture;
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

  // --- PALETTE MATERIALS: warm sunset charter ---
  // Saturated colour is reserved for water and hazards; architecture stays low-saturation
  // so enemy silhouettes read against it.
  const matHullIvory = new THREE.MeshStandardMaterial({
    color: 0xf1e4cf,
    roughness: 0.42,
    metalness: 0.05,
  });

  // Recesses and toe kicks.
  const matHullTrim = new THREE.MeshStandardMaterial({
    color: 0xd9c3a4,
    roughness: 0.55,
    metalness: 0.05,
  });

  const teakTexture = makeTeakTexture();
  const matTeakDeck = new THREE.MeshStandardMaterial({
    // The texture already carries the teak base colour; white keeps it from double-darkening.
    color: teakTexture ? 0xffffff : 0x9c5f36,
    map: teakTexture,
    roughness: 0.68,
    metalness: 0.05,
    depthWrite: true,
    depthTest: true,
  });

  // Stairs, pool curb.
  const matTeakHighlight = new THREE.MeshStandardMaterial({
    color: 0xb3784a,
    roughness: 0.6,
    metalness: 0.05,
  });

  const matDarkMetal = new THREE.MeshStandardMaterial({
    color: 0x24262b,
    roughness: 0.5,
    metalness: 0.6,
  });

  const matBrass = new THREE.MeshStandardMaterial({
    color: 0xb08a4f,
    roughness: 0.28,
    metalness: 0.9,
  });

  const matGlassTeal = new THREE.MeshStandardMaterial({
    color: 0x2b6f6a,
    roughness: 0.1,
    metalness: 0.1,
    transparent: true,
    opacity: 0.42,
    depthWrite: false,
  });

  const matPoolWater = new THREE.MeshStandardMaterial({
    color: 0x37c6b0,
    emissive: 0x37c6b0,
    emissiveIntensity: 0.08,
    roughness: 0.1,
    metalness: 0.2,
    transparent: true,
    opacity: 0.75,
    depthWrite: false,
  });

  const matHazardAmber = new THREE.MeshBasicMaterial({
    color: 0xe2a13c,
  });

  // Cover accents only: crate/planter faces.
  const matCoverAccent = new THREE.MeshStandardMaterial({
    color: 0xc25a38,
    roughness: 0.8,
    metalness: 0.1,
  });

  const matNavy = new THREE.MeshStandardMaterial({
    color: 0x1e3446,
    roughness: 0.75,
    metalness: 0.15,
  });

  // Lounge seating.
  const matCushionCream = new THREE.MeshStandardMaterial({
    color: 0xe6d6ba,
    roughness: 0.85,
    metalness: 0.02,
  });

  // Map material uuid -> material instance so bakeMergedStatic can recover the right material per bucket
  const materialByUuid = new Map<string, THREE.Material>([
    [matHullIvory.uuid, matHullIvory],
    [matHullTrim.uuid, matHullTrim],
    [matTeakDeck.uuid, matTeakDeck],
    [matTeakHighlight.uuid, matTeakHighlight],
    [matDarkMetal.uuid, matDarkMetal],
    [matBrass.uuid, matBrass],
    [matGlassTeal.uuid, matGlassTeal],
    [matPoolWater.uuid, matPoolWater],
    [matHazardAmber.uuid, matHazardAmber],
    [matCoverAccent.uuid, matCoverAccent],
    [matNavy.uuid, matNavy],
    [matCushionCream.uuid, matCushionCream],
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

  // Hull shell: thin outer walls and a visual bottom; the void under the deck is sealed.
  createSolidBox(0.3, 6.0, 108, -12.05, -6.4, 0, matDarkMetal);
  createSolidBox(0.3, 6.0, 108, 12.05, -6.4, 0, matDarkMetal);
  createSolidBox(24.4, 0.3, 108, 0, -6.7, 0, matDarkMetal, { noCollider: true });

  // Deck undertray: one continuous slab sealing the underside of the deck.
  createSolidBox(21.8, 0.3, 108, 0, -0.7, 0, matDarkMetal);

  // Pointed Bow taper
  const bowNoseGeo = new THREE.ConeGeometry(13, 24, 4);
  bowNoseGeo.rotateX(-Math.PI / 2);
  bowNoseGeo.rotateY(Math.PI / 4);
  const bowNose = new THREE.Mesh(bowNoseGeo, matHullIvory);
  bowNose.position.set(0, -1, -66);
  root.add(bowNose);

  // Deck floors: top face at exactly Y = 0.0, one slab per zone, full width.
  createSolidBox(24.4, 0.4, 18, 0, -0.4, -45, matTeakDeck, { renderOrder: 0 }); // bow deck
  createSolidBox(17.0, 0.4, 36, 0, -0.4, 0, matTeakDeck, { renderOrder: 0 }); // centre deck core
  createSolidBox(3.7, 0.4, 28, -10.35, -0.4, 4, matTeakDeck, { renderOrder: 0 }); // port strip
  createSolidBox(3.7, 0.4, 28, 10.35, -0.4, -4, matTeakDeck, { renderOrder: 0 }); // starboard strip
  createSolidBox(17.0, 0.4, 18, 0, -0.4, -27, matTeakDeck, { renderOrder: 0 }); // bow cabin floor
  createSolidBox(17.0, 0.4, 18, 0, -0.4, 27, matTeakDeck, { renderOrder: 0 }); // stern cabin floor
  createSolidBox(3.7, 0.4, 18, -10.35, -0.4, -27, matTeakDeck, { renderOrder: 0 }); // bow port walkway
  createSolidBox(3.7, 0.4, 18, 10.35, -0.4, -27, matTeakDeck, { renderOrder: 0 }); // bow starboard walkway
  createSolidBox(3.7, 0.4, 18, -10.35, -0.4, 27, matTeakDeck, { renderOrder: 0 }); // stern port walkway
  createSolidBox(3.7, 0.4, 18, 10.35, -0.4, 27, matTeakDeck, { renderOrder: 0 }); // stern starboard walkway
  createSolidBox(24.4, 0.4, 18, 0, -0.4, 45, matTeakDeck, { renderOrder: 0 }); // stern deck

  // Exterior Bulwark / Edge Railings (prevent falling into ocean)
  // Left Railing (Port)
  createSolidBox(0.4, 1.2, 108, -12.2, 0, 0, matBrass);
  // Right Railing (Starboard)
  createSolidBox(0.4, 1.2, 108, 12.2, 0, 0, matBrass);
  // Bow Railing
  createSolidBox(24, 1.2, 0.4, 0, 0, -54.2, matBrass);
  // Stern Railing
  createSolidBox(24, 1.2, 0.4, 0, 0, 54.2, matBrass);

  // ==========================================
  // 2. BOW (FORWARD DECK) - HELIPAD & COVER
  // ==========================================
  // Helipad platform (top at Y = 0.15, resting cleanly on deck at Y = 0.0)
  const helipadBase = createSolidBox(10, 0.15, 10, 0, 0.0, -45, matHullTrim);
  // Helipad Yellow Circle - raised slightly above helipad surface
  const heliRingGeo = new THREE.RingGeometry(3.6, 4.0, 32);
  heliRingGeo.rotateX(-Math.PI / 2);
  const heliRing = new THREE.Mesh(heliRingGeo, matHazardAmber);
  heliRing.position.set(0, 0.155, -45);
  heliRing.renderOrder = 1;
  root.add(heliRing);

  // Helipad 'H' letter - resting cleanly on top of helipad
  const hBar1 = createSolidBox(0.5, 0.02, 3.2, -1.3, 0.156, -45, matHazardAmber, { noCollider: true });
  hBar1.renderOrder = 2;
  const hBar2 = createSolidBox(0.5, 0.02, 3.2, 1.3, 0.156, -45, matHazardAmber, { noCollider: true });
  hBar2.renderOrder = 2;
  const hCross = createSolidBox(2.6, 0.02, 0.5, 0, 0.156, -45, matHazardAmber, { noCollider: true });
  hCross.renderOrder = 2;

  // Bow deck cover: one crate stack per side, anchor winch forward, two loungers.
  createSolidBox(2.2, 1.8, 1.8, -7, 0, -42, matCoverAccent);
  createSolidBox(1.8, 1.4, 1.8, -7, 1.8, -42, matNavy);
  createSolidBox(2.4, 1.6, 1.6, 7, 0, -42, matCoverAccent);
  createSolidBox(2.5, 1.4, 3, 0, 0, -51, matDarkMetal);
  createSolidBox(1.2, 0.5, 2.4, -4.5, 0, -49, matCushionCream);
  createSolidBox(1.2, 0.5, 2.4, 4.5, 0, -49, matCushionCream);

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
      createSolidBox(6.5, 4.2, 0.4, -5.25, 0, z, matHullIvory);
      createSolidBox(6.5, 4.2, 0.4, 5.25, 0, z, matHullIvory);
      createSolidBox(4.0, 1.4, 0.4, 0, 2.8, z, matHullIvory);
    }

    // Outboard walls: a 2 m walkway doorway centred at z ∓27 sits beside a 4 m
    // glazed window at z ∓33..∓29. Segments: 3 m (∓36..∓33), 1 m (∓29..∓28),
    // 8 m (∓26..∓18).
    for (const x of [-8.5, 8.5]) {
      createSolidBox(0.4, 4.2, 3, x, 0, at(-34.5), matHullIvory);
      createSolidBox(0.4, 4.2, 1, x, 0, at(-28.5), matHullIvory);
      createSolidBox(0.4, 4.2, 8, x, 0, at(-22), matHullIvory);
    }

    // Hall partitions at x +/-3 with a 6 m central opening.
    for (const x of [-3, 3]) {
      createSolidBox(0.3, 4.2, 6, x, 0, at(-33), matHullIvory);
      createSolidBox(0.3, 4.2, 6, x, 0, at(-21), matHullIvory);
    }

    // Ground cover: bar in the port room, two sofas starboard, hall column.
    createSolidBox(3.0, 1.1, 1.2, at(-5.5), 0, at(-33), matDarkMetal);
    createSolidBox(1.4, 0.8, 2.6, at(6.2), 0, at(-33), matNavy);
    createSolidBox(1.4, 0.8, 2.6, at(6.2), 0, at(-21), matNavy);
    createSolidBox(0.8, 2.5, 0.8, at(2.0), 0, at(-34.5), matHullIvory);

    // Internal stair up to the upper room. 15 treads at 4.6/15 m rise land flush
    // with the floor strip at the bow/stern face, so the top node is fully supported.
    addStairRun(at(4.6), at(-23.4), m === 1 ? -1 : 1, 2.4, 15, 4.6 / 15, 0.8, matDarkMetal);

    // External stair on the walkway, landing at upper floor height.
    addStairRun(at(10.2), at(-47.2), m === 1 ? 1 : -1, 2.0, 14, 0.33, 0.8, matBrass);
    createSolidBox(4.0, 0.4, 3.0, at(10.2), 4.2, at(-34.9), matTeakDeck);

    // Upper floor slab around the internal stairwell (x 3.4..5.8, z -35..-23.4).
    createSolidBox(11.9, 0.4, 18, at(-2.55), 4.2, at(-27), matTeakDeck);
    createSolidBox(2.4, 0.4, 18, at(7.0), 4.2, at(-27), matTeakDeck);
    createSolidBox(2.4, 0.4, 5.4, at(4.6), 4.2, at(-20.7), matTeakDeck);

    // Upper room: solid outboard walls, open firing faces with waist-high rails.
    createSolidBox(0.3, 3.6, 16, at(-7), 4.6, at(-27), matHullIvory);
    createSolidBox(0.3, 3.6, 14.4, at(7), 4.6, at(-26.2), matHullIvory);
    createSolidBox(10.4, 1.0, 0.15, at(-1.8), 4.6, at(-35), matBrass);
    createSolidBox(1.2, 1.0, 0.15, at(6.4), 4.6, at(-35), matBrass);
    // Rail across the internal-stair mouth so the bow/stern firing face is
    // continuously railed from x -7..7; the stair top exits sideways to the landing.
    createSolidBox(2.4, 1.0, 0.15, at(4.6), 4.6, at(-35), matBrass);
    createSolidBox(14.0, 1.0, 0.15, 0, 4.6, at(-19), matBrass);

    // Ceiling and upper cover.
    createSolidBox(14.6, 0.4, 16, 0, 8.2, at(-27), matHullIvory);
    createSolidBox(1.6, 1.0, 1.2, at(4), 4.6, at(-22), matDarkMetal);
    createSolidBox(1.6, 0.7, 1.0, at(-4), 4.6, at(-22), matHullIvory);
  }

  buildCabin(1);
  buildCabin(-1);

  // Four ground-level teal panes beside the walkway doorways (walk-through, bullet-proof).
  for (const x of [-8.5, 8.5]) {
    for (const z of [-31, 31]) {
      createSolidBox(0.4, 3.8, 4, x, 0.2, z, matGlassTeal, {
        renderOrder: 1,
        noCollider: true,
        blocksBullets: true,
      });
    }
  }
  // ==========================================
  // 4. CENTRAL DECK - POOL, LOUNGE, PLANTER
  // ==========================================
  // Pool basin with teak curb (cover) and walk-through water.
  createSolidBox(0.4, 0.4, 14, -8.0, 0, 0, matTeakHighlight);
  createSolidBox(0.4, 0.4, 14, -3.0, 0, 0, matTeakHighlight);
  createSolidBox(4.6, 0.4, 0.4, -5.5, 0, -6.8, matTeakHighlight);
  createSolidBox(4.6, 0.4, 0.4, -5.5, 0, 6.8, matTeakHighlight);
  createSolidBox(4.6, 0.05, 13.2, -5.5, 0.06, 0, matPoolWater, { noCollider: true, renderOrder: 1 });

  // Covered lounge: solid roof on four columns, sofas and table inside.
  createSolidBox(5.4, 0.2, 14, 5.5, 3.2, 0, matHullIvory);
  for (const x of [3.2, 7.8]) {
    for (const z of [-6.5, 6.5]) {
      createSolidBox(0.25, 3.2, 0.25, x, 0, z, matBrass);
    }
  }
  createSolidBox(1.4, 0.8, 2.6, 4.0, 0, -4.5, matCushionCream);
  createSolidBox(1.4, 0.8, 2.6, 4.0, 0, 4.5, matCushionCream);
  createSolidBox(1.2, 0.5, 1.2, 6.2, 0, 0, matDarkMetal);
  createSolidBox(0.5, 1.0, 1.0, 7.9, 0, 0, matTeakHighlight);

  // Centre planter / sightline breaker.
  createSolidBox(2.8, 1.2, 6, 0, 0, 0, matCoverAccent);
  const palmGeo = new THREE.CylinderGeometry(0.12, 0.2, 3.2, 8);
  const palm = new THREE.Mesh(palmGeo, matBrass);
  palm.position.set(0, 2.8, 0);
  root.add(palm);

  // Centre-lane benches.
  createSolidBox(2.0, 0.7, 1.0, 0, 0, -11, matNavy);
  createSolidBox(2.0, 0.7, 1.0, 0, 0, 11, matNavy);

  // Full-width teak deck closes both former maintenance stairwell cuts
  // (port z -18..-10, starboard z 10..18) so the walkways are continuous.
  // 8.02 m long: 1 cm into each neighbouring slab so the seam points are
  // covered without a visible z-fighting band.
  createSolidBox(3.7, 0.4, 8.02, -10.35, -0.4, -14, matTeakDeck, { renderOrder: 0 });
  createSolidBox(3.7, 0.4, 8.02, 10.35, -0.4, 14, matTeakDeck, { renderOrder: 0 });

  // Staggered walkway cover: one crate cluster per side, outboard-rail side,
  // clear of both former stairwell cuts and every waypoint lane (inner face
  // x ±10.8 vs the ±10.2 walkway lane).
  createSolidBox(1.4, 1.0, 1.4, -11.5, 0, -5, matCoverAccent);
  createSolidBox(0.8, 0.6, 0.8, -11.5, 1.0, -5, matNavy);
  createSolidBox(1.4, 1.0, 1.4, 11.5, 0, 23.5, matNavy);
  createSolidBox(0.8, 0.6, 0.8, 11.5, 1.0, 23.5, matCoverAccent);

  // Decorative life-ring stations on both walkway rails at z 0 (no collider).
  const lifeRingGeo = new THREE.TorusGeometry(0.35, 0.06, 8, 20);
  for (const x of [-11.9, 11.9]) {
    const ring = new THREE.Mesh(lifeRingGeo, matCoverAccent);
    ring.position.set(x, 1.1, 0);
    ring.rotation.y = Math.PI / 2;
    ring.castShadow = false;
    ring.receiveShadow = false;
    root.add(ring);
  }

  // Purely visual steel-and-glass viewing shelf hanging outside the port rail
  // (x -14.5..-12.2, z -4..4, y -0.6). No collider, no bullet blocker.
  createSolidBox(2.3, 0.1, 8, -13.35, -0.6, 0, matGlassTeal, { noCollider: true, renderOrder: 1 });
  createSolidBox(0.1, 0.12, 8, -14.45, -0.65, 0, matBrass, { noCollider: true });
  createSolidBox(0.1, 0.12, 8, -12.25, -0.65, 0, matBrass, { noCollider: true });
  for (const z of [-3.9, 3.9]) {
    createSolidBox(2.3, 0.12, 0.1, -13.35, -0.65, z, matBrass, { noCollider: true });
  }

  // ==========================================
  // 5. STERN DECK - JACUZZI & COVER
  // ==========================================
  createSolidBox(6.5, 1.2, 6.5, 0, 0, 50, matTeakDeck);
  const jacuzziWater = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.2, 5.2), matPoolWater);
  jacuzziWater.position.set(0, 1.05, 50);
  jacuzziWater.renderOrder = 1;
  root.add(jacuzziWater);

  createSolidBox(2.2, 1.8, 1.8, -7.5, 0, 50, matNavy);
  createSolidBox(2.2, 1.8, 1.8, 7.5, 0, 50, matCoverAccent);
  createSolidBox(1.2, 0.5, 2.4, -6.5, 0, 40, matCushionCream);
  createSolidBox(1.2, 0.5, 2.4, 6.5, 0, 40, matCushionCream);

  const flagPole = createSolidBox(0.1, 4.5, 0.1, 0, 1.2, 53.5, matBrass, { noCollider: true });
  const flagMat = new THREE.MeshStandardMaterial({
    color: 0xc25a38,
    side: THREE.DoubleSide,
    roughness: 0.6,
  });
  const flagGeo = new THREE.PlaneGeometry(1.4, 0.9);
  const flag = new THREE.Mesh(flagGeo, flagMat);
  flag.position.set(0.7, 5.0, 53.5);
  root.add(flag);

  // Radar mast on the planter and satellite domes on the cabin roofs.
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.25, 4.5, 8), matBrass);
  mast.position.set(0, 3.4, 0);
  root.add(mast);
  const radarBar = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.4, 0.3), matDarkMetal);
  radarBar.position.set(0, 5.4, 0);
  root.add(radarBar);
  const domeGeo = new THREE.SphereGeometry(1.2, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2);
  const dome1 = new THREE.Mesh(domeGeo, matHullIvory);
  dome1.position.set(-3.5, 8.6, -27);
  root.add(dome1);
  const dome2 = new THREE.Mesh(domeGeo, matHullIvory);
  dome2.position.set(3.5, 8.6, 27);
  root.add(dome2);

  // Warm practicals: two cabin, one lounge = 3 point lights.
  for (const z of [-27, 27]) {
    const light = new THREE.PointLight(0xffb46b, 0.8, 12);
    light.position.set(0, 3.0, z);
    root.add(light);
  }
  const loungeLight = new THREE.PointLight(0xffc07a, 0.6, 10);
  loungeLight.position.set(5.5, 2.6, 0);
  root.add(loungeLight);


  // ==========================================
  // 6. SUNSET SKY DOME & SUN DISC
  // ==========================================
  // Radius 380 (not 400) so the far side of the dome stays inside the 450 m camera far
  // plane from the deck ends: worst case |camera| ~= 54.5 m, so 380 + 54.5 = 434.5 m.
  const SKY_DOME_RADIUS = 380;
  const skyGeo = new THREE.SphereGeometry(SKY_DOME_RADIUS, 32, 16);
  const skyPositions = skyGeo.attributes.position;
  const skyColors = new Float32Array(skyPositions.count * 3);
  const horizonColor = new THREE.Color(0xffca9c);
  const zenithColor = new THREE.Color(0x3f6699);
  const blendColor = new THREE.Color();
  for (let i = 0; i < skyPositions.count; i++) {
    // Vertex colours key off the normalised sphere height (-1..1): warm horizon band
    // hugging the waterline, cool blue taking over towards the zenith.
    const t = THREE.MathUtils.clamp((skyPositions.getY(i) / SKY_DOME_RADIUS - 0.05) / 0.65, 0, 1);
    blendColor.copy(horizonColor).lerp(zenithColor, t);
    skyColors[i * 3] = blendColor.r;
    skyColors[i * 3 + 1] = blendColor.g;
    skyColors[i * 3 + 2] = blendColor.b;
  }
  skyGeo.setAttribute('color', new THREE.BufferAttribute(skyColors, 3));
  const skyMat = new THREE.MeshBasicMaterial({
    side: THREE.BackSide,
    vertexColors: true,
    fog: false,
    depthWrite: false,
  });
  const skyDome = new THREE.Mesh(skyGeo, skyMat);
  skyDome.renderOrder = -2;
  root.add(skyDome);

  // Low sun disc near the stern-starboard horizon, facing the yacht.
  const sunDisc = new THREE.Mesh(
    new THREE.CircleGeometry(14, 32),
    new THREE.MeshBasicMaterial({ color: 0xfff1c9, fog: false, depthWrite: false })
  );
  sunDisc.position.set(220, 26, 300);
  sunDisc.lookAt(0, 0, 0);
  sunDisc.renderOrder = -1;
  root.add(sunDisc);

  // ==========================================
  // 7. OCEAN WATER & HORIZON ISLANDS
  // ==========================================
  const waterPlaneGeo = new THREE.PlaneGeometry(500, 500, 32, 32);
  waterPlaneGeo.rotateX(-Math.PI / 2);
  const waterPlaneMat = new THREE.MeshStandardMaterial({
    color: 0x0a4b52,
    roughness: 0.1,
    metalness: 0.6,
    transparent: true,
    opacity: 0.94,
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
    color: 0xd9e8e0,
    transparent: true,
    opacity: 0.2,
    depthWrite: false,
  });
  const wake = new THREE.Mesh(wakeGeo, wakeMat);
  wake.position.set(0, -3.75, 10);
  wake.renderOrder = -1;
  root.add(wake);

  // Distant horizon islands: desaturated green cones with a thin sand shelf at the waterline.
  const islandMat = new THREE.MeshStandardMaterial({
    color: 0x3c5b48,
    roughness: 0.9,
    metalness: 0.1,
  });
  const islandSandMat = new THREE.MeshStandardMaterial({
    color: 0xd9c08a,
    roughness: 0.95,
    metalness: 0.02,
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

    // Sand ring pokes just above the ocean surface (y -3.8) around the cone base.
    const sandGeo = new THREE.CylinderGeometry(isl.r * 1.06, isl.r * 1.12, 0.7, 32);
    const sandRing = new THREE.Mesh(sandGeo, islandSandMat);
    sandRing.position.set(isl.x, -4.1, isl.z);
    root.add(sandRing);
  });

  // ==========================================
  // 8. SPAWN POINTS & WAYPOINT GRAPH
  // ==========================================
  const spawnPoints: THREE.Vector3[] = [
    new THREE.Vector3(0, 0.1, -46),
    new THREE.Vector3(-9.5, 0.1, -42),
    new THREE.Vector3(9.5, 0.1, -34.5),
    new THREE.Vector3(0, 0.1, 46),
    new THREE.Vector3(-9.5, 0.1, 34.5),
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
    { id: 'port_mid', pos: v(-10.2, 0.1, -7), neighbors: ['port_bridge_south', 'pool_edge', 'port_center'], area: 'midship' },
    { id: 'port_center', pos: v(-10.2, 0.1, 4), neighbors: ['port_mid', 'port_aft'], area: 'midship' },
    { id: 'port_aft', pos: v(-10.2, 0.1, 15), neighbors: ['port_center', 'port_south'], area: 'midship' },
    { id: 'port_south', pos: v(-10.2, 0.1, 26.5), neighbors: ['port_aft', 'port_deck', 'stern_port_room'], area: 'midship' },
    { id: 'port_deck', pos: v(-10.2, 0.1, 32), neighbors: ['port_south', 'port_stern'], area: 'stern' },

    { id: 'port_stern', pos: v(-11.7, 0.1, 38), neighbors: ['port_deck', 'port_aftdeck'], area: 'stern' },

    // Starboard walkway
    { id: 'star_north', pos: v(10.2, 0.1, -27), neighbors: ['bow_star', 'bow_star_room', 'star_center'], area: 'midship' },
    { id: 'star_center', pos: v(10.2, 0.1, -16), neighbors: ['star_north', 'star_mid'], area: 'midship' },
    { id: 'star_mid', pos: v(10.2, 0.1, -5), neighbors: ['star_center', 'lounge', 'star_south'], area: 'midship' },
    { id: 'star_south', pos: v(10.2, 0.1, 7), neighbors: ['star_mid', 'center_south', 'star_bridge_south'], area: 'midship' },
    { id: 'star_bridge_south', pos: v(11.7, 0.1, 9.6), neighbors: ['star_south', 'star_bridge_north'], area: 'midship' },
    { id: 'star_bridge_north', pos: v(11.7, 0.1, 18.4), neighbors: ['star_bridge_south', 'star_aft'], area: 'midship' },
    { id: 'star_aft', pos: v(10.2, 0.1, 22), neighbors: ['star_tail', 'star_bridge_north'], area: 'midship' },
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
    skyDome,
    update,
  };
}
