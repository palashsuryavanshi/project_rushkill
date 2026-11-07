import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  EffectsPool,
  MAX_PARTICLES,
  MAX_TRACERS,
  particleCapacity,
  tracerCapacity,
} from './effectsPool';

function makePool(tier: 'high' | 'low' = 'high'): EffectsPool {
  return new EffectsPool(new THREE.Scene(), () => tier);
}

test('effect capacities follow the graphics tier', () => {
  assert.equal(tracerCapacity('high'), MAX_TRACERS);
  assert.equal(tracerCapacity('low'), 16);
  assert.equal(particleCapacity('high'), MAX_PARTICLES);
  assert.equal(particleCapacity('low'), 32);
});

test('spawnTracer activates one slot and derives its life from travel time', () => {
  const pool = makePool();
  const from = new THREE.Vector3(0, 0, 0);
  const to = new THREE.Vector3(0, 0, -50);

  pool.spawnTracer(from, to, 1000);

  const active = pool.tracers.filter((t) => t.active);
  assert.equal(active.length, 1);
  assert.ok(Math.abs(active[0].life - 0.05) < 1e-9);
  assert.ok(active[0].vel.z < 0, 'tracer should travel toward the impact point');
});

test('tracer life is clamped to a quarter second for very long shots', () => {
  const pool = makePool();
  pool.spawnTracer(new THREE.Vector3(), new THREE.Vector3(0, 0, -300), 100);

  const active = pool.tracers.filter((t) => t.active);
  assert.equal(active.length, 1);
  assert.equal(active[0].life, 0.25);
});

test('tracers deactivate once their life expires', () => {
  const pool = makePool();
  pool.spawnTracer(new THREE.Vector3(), new THREE.Vector3(0, 0, -10), 1000);
  assert.equal(pool.tracers.filter((t) => t.active).length, 1);

  pool.update(0.2);
  assert.equal(pool.tracers.filter((t) => t.active).length, 0);
});

test('spawnParticles respects the requested count and the tier cap', () => {
  const high = makePool('high');
  high.spawnParticles(new THREE.Vector3(), 6, 0xffffff);
  assert.equal(high.particles.filter((p) => p.active).length, 6);

  const low = makePool('low');
  low.spawnParticles(new THREE.Vector3(), 100, 0xffffff);
  assert.equal(low.particles.filter((p) => p.active).length, 32);
});

test('particles fall under gravity and expire', () => {
  const pool = makePool();
  pool.spawnParticles(new THREE.Vector3(), 1, 0xffffff);
  const particle = pool.particles.find((p) => p.active)!;
  const startY = particle.pos.y;
  const startVy = particle.vel.y;

  pool.update(0.1);
  assert.ok(particle.pos.y > startY, 'initial upward velocity should lift the particle');
  assert.ok(particle.vel.y < startVy, 'gravity should reduce vertical velocity');

  pool.update(1.0);
  assert.equal(pool.particles.filter((p) => p.active).length, 0);
});
