import * as THREE from 'three';

/**
 * Pre-allocated visual effects: bullet tracers and impact particles.
 *
 * Both pools are fixed-size InstancedMeshes created once at scene setup and
 * recycled, so firing never allocates meshes. Extracted from GameEngine so the
 * effect lifetimes/tier caps have one home and can be unit-tested without WebGL.
 */

export type GraphicsTier = 'high' | 'low';

export const MAX_TRACERS = 32;
export const MAX_PARTICLES = 64;

/** Active tracer slots for the given quality tier. */
export function tracerCapacity(tier: GraphicsTier): number {
  return tier === 'low' ? 16 : MAX_TRACERS;
}

/** Active particle slots for the given quality tier. */
export function particleCapacity(tier: GraphicsTier): number {
  return tier === 'low' ? 32 : MAX_PARTICLES;
}

export interface TracerSlot {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  active: boolean;
}

export interface ParticleSlot {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  color: THREE.Color;
  active: boolean;
}

const TRACER_MAX_LIFE = 0.25;
const PARTICLE_GRAVITY = 9.8;

export class EffectsPool {
  readonly tracerMesh: THREE.InstancedMesh;
  readonly particleMesh: THREE.InstancedMesh;

  private readonly tracerData: TracerSlot[] = [];
  private readonly particleData: ParticleSlot[] = [];
  private readonly tier: () => GraphicsTier;

  constructor(scene: THREE.Scene, tier: () => GraphicsTier = () => 'high') {
    this.tier = tier;

    // Pre-allocate tracer instances
    const tracerGeo = new THREE.CylinderGeometry(0.015, 0.015, 1.2, 4);
    tracerGeo.rotateX(Math.PI / 2);
    const tracerMat = new THREE.MeshBasicMaterial({ color: 0xffea78 });
    this.tracerMesh = new THREE.InstancedMesh(tracerGeo, tracerMat, MAX_TRACERS);
    this.tracerMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(this.tracerMesh);

    const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < MAX_TRACERS; i++) {
      this.tracerData.push({
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        life: 0,
        active: false,
      });
      this.tracerMesh.setMatrixAt(i, hidden);
    }
    this.tracerMesh.instanceMatrix.needsUpdate = true;

    // Pre-allocate particle instances
    const partGeo = new THREE.BoxGeometry(0.08, 0.08, 0.08);
    const partMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.particleMesh = new THREE.InstancedMesh(partGeo, partMat, MAX_PARTICLES);
    this.particleMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(this.particleMesh);

    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.particleData.push({
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        life: 0,
        color: new THREE.Color(),
        active: false,
      });
      this.particleMesh.setMatrixAt(i, hidden);
    }
    this.particleMesh.instanceMatrix.needsUpdate = true;
  }

  /** Read-only view of tracer slots (for tests/debugging). */
  get tracers(): readonly TracerSlot[] {
    return this.tracerData;
  }

  /** Read-only view of particle slots (for tests/debugging). */
  get particles(): readonly ParticleSlot[] {
    return this.particleData;
  }

  /** Fire one tracer that travels from the muzzle toward the impact point. */
  spawnTracer(from: THREE.Vector3, to: THREE.Vector3, bulletSpeed: number): void {
    const capacity = tracerCapacity(this.tier());
    const tracer = this.tracerData.slice(0, capacity).find((t) => !t.active);
    if (!tracer) return;
    tracer.active = true;
    tracer.pos.copy(from);
    const dir = new THREE.Vector3().subVectors(to, from);
    const len = dir.length();
    dir.normalize();
    tracer.vel.copy(dir).multiplyScalar(bulletSpeed);
    tracer.life = Math.min(TRACER_MAX_LIFE, len / bulletSpeed);
  }

  /** Spawn up to `count` impact particles in the first free slots. */
  spawnParticles(pos: THREE.Vector3, count: number, hexColor: number): void {
    const capacity = particleCapacity(this.tier());
    let spawned = 0;
    for (let i = 0; i < capacity; i++) {
      if (spawned >= count) break;
      const p = this.particleData[i];
      if (!p.active) {
        p.active = true;
        p.pos.copy(pos);
        p.vel.set(
          (Math.random() - 0.5) * 5,
          Math.random() * 4 + 1,
          (Math.random() - 0.5) * 5
        );
        p.color.setHex(hexColor);
        p.life = 0.35 + Math.random() * 0.2;
        spawned++;
      }
    }
  }

  update(dt: number): void {
    // Tracers
    let tracerNeedsUpdate = false;
    const tracerCap = tracerCapacity(this.tier());
    for (let i = 0; i < tracerCap; i++) {
      const t = this.tracerData[i];
      if (t.active) {
        t.life -= dt;
        t.pos.addScaledVector(t.vel, dt);
        if (t.life <= 0) {
          t.active = false;
          const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
          this.tracerMesh.setMatrixAt(i, hidden);
        } else {
          const matrix = new THREE.Matrix4();
          matrix.setPosition(t.pos);
          this.tracerMesh.setMatrixAt(i, matrix);
        }
        tracerNeedsUpdate = true;
      }
    }
    if (tracerNeedsUpdate) this.tracerMesh.instanceMatrix.needsUpdate = true;

    // Particles
    let partNeedsUpdate = false;
    const particleCap = particleCapacity(this.tier());
    for (let i = 0; i < particleCap; i++) {
      const p = this.particleData[i];
      if (p.active) {
        p.life -= dt;
        p.vel.y -= PARTICLE_GRAVITY * dt;
        p.pos.addScaledVector(p.vel, dt);
        if (p.life <= 0) {
          p.active = false;
          const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
          this.particleMesh.setMatrixAt(i, hidden);
        } else {
          const matrix = new THREE.Matrix4();
          matrix.setPosition(p.pos);
          this.particleMesh.setMatrixAt(i, matrix);
        }
        partNeedsUpdate = true;
      }
    }
    if (partNeedsUpdate) this.particleMesh.instanceMatrix.needsUpdate = true;
  }
}
