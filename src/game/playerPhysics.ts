import * as THREE from 'three';
import type { BoxCollider } from './mapHijacked';

/**
 * Player movement, gravity, jump/slide state, and AABB collision resolution.
 *
 * Tuned for responsive bunny-hop feel without auto-bunny or long hold jumps:
 *  - discrete taps => full JUMP_VELOCITY
 *  - holding Space adds no extra height (zero sustained jump input)
 *  - holding Space cannot re-launch while already airborne
 */
export interface PlayerPhysicsInput {
  keys: ReadonlySet<string>;
  yaw: number;
  isAds: boolean;
  colliders: readonly BoxCollider[];
}

export interface PlayerPhysicsEvents {
  onJump?: () => void;
  onSlide?: () => void;
  onFootstep?: () => void;
  onOceanFall?: () => void;
}

const GRAVITY = -9.81; // 1:1 Earth gravity
const JUMP_VELOCITY = 5.42; // tuned for a ~1.5 m apex at Earth gravity
const PLAYER_RADIUS = 0.45;
const STEP_HEIGHT = 0.55;

export function shouldQueueJump(event: { code: string; repeat: boolean }): boolean {
  return event.code === 'Space' && !event.repeat;
}

export class PlayerPhysics {
  readonly pos = new THREE.Vector3(0, 0.1, -45);
  readonly vel = new THREE.Vector3();
  isGrounded = true;
  isSliding = false;
  gunBobTime = 0;

  private slideTimer = 0;
  private coyoteTimer = 0;
  private jumpBufferTimer = 0;
  /** Space key state tracking to cut jumps WITHOUT repeat auto-launch. */
  private spaceWasDown = false;

  get speed(): number {
    return Math.sqrt(this.vel.x * this.vel.x + this.vel.z * this.vel.z);
  }

  reset(pos: THREE.Vector3): void {
    this.pos.copy(pos);
    this.vel.set(0, 0, 0);
    this.isGrounded = true;
    this.isSliding = false;
    this.spaceWasDown = false;
  }

  queueJump(buffer = 0.14): void {
    this.jumpBufferTimer = buffer;
  }

  update(dt: number, input: PlayerPhysicsInput, events: PlayerPhysicsEvents = {}): void {
    const keys = input.keys;
    const isShiftHeld = keys.has('ShiftLeft') || keys.has('KeyC');
    const spaceDown = keys.has('Space');

    // Slide initiation (unchanged)
    if (isShiftHeld && this.isGrounded && !this.isSliding && this.vel.lengthSq() > 16) {
      this.isSliding = true;
      this.slideTimer = 0.55;
      events.onSlide?.();
      const fwd = new THREE.Vector3(-Math.sin(input.yaw), 0, -Math.cos(input.yaw)).normalize();
      this.vel.addScaledVector(fwd, 6.0);
    }

    if (this.isSliding) {
      this.slideTimer -= dt;
      if (this.slideTimer <= 0 || !isShiftHeld) {
        this.isSliding = false;
      }
    }

    // Movement intent
    let moveX = 0;
    let moveZ = 0;
    if (keys.has('KeyW') || keys.has('ArrowUp')) moveZ -= 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) moveZ += 1;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) moveX -= 1;
    if (keys.has('KeyD') || keys.has('ArrowRight')) moveX += 1;

    const inputDir = new THREE.Vector3(moveX, 0, moveZ);
    if (inputDir.lengthSq() > 0) inputDir.normalize();
    const moveDir = inputDir.applyAxisAngle(new THREE.Vector3(0, 1, 0), input.yaw);

    const baseSpeed = input.isAds ? 5.5 : 12.0;
    const accel = this.isGrounded ? 80.0 : 35.0;
    const friction = this.isGrounded ? (this.isSliding ? 0.88 : 0.82) : 0.98;

    if (inputDir.lengthSq() > 0 && !this.isSliding) {
      this.vel.x += moveDir.x * accel * dt;
      this.vel.z += moveDir.z * accel * dt;
    }

    this.vel.x *= Math.pow(friction, dt * 60);
    this.vel.z *= Math.pow(friction, dt * 60);

    const maxSpeed = this.isSliding ? 18.0 : baseSpeed;
    const hSpeed = this.speed;
    if (hSpeed > maxSpeed && this.isGrounded && !this.isSliding) {
      this.vel.x = (this.vel.x / hSpeed) * maxSpeed;
      this.vel.z = (this.vel.z / hSpeed) * maxSpeed;
    }

    // Gravity — keep applied every frame regardless of key state.
    this.vel.y += GRAVITY * dt;

    // Coyote time + jump buffering
    if (this.isGrounded) this.coyoteTimer = 0.1;
    else this.coyoteTimer -= dt;
    if (this.jumpBufferTimer > 0) this.jumpBufferTimer -= dt;

    // Execute a buffered jump exactly once per press. Held Space cannot
    // re-trigger because jumpBuffer is cleared on consumption, and release
    // means we need a fresh keydown event (shouldQueueJump gates engine).
    if (this.jumpBufferTimer > 0 && (this.isGrounded || this.coyoteTimer > 0)) {
      this.vel.y = JUMP_VELOCITY;
      this.isGrounded = false;
      this.coyoteTimer = 0;
      this.jumpBufferTimer = 0;
      events.onJump?.();
      if (this.isSliding) {
        const boostFactor = 1.1;
        const momentumConservation = 0.8;
        this.vel.x = this.vel.x * momentumConservation + this.vel.x * boostFactor;
        this.vel.z = this.vel.z * momentumConservation + this.vel.z * boostFactor;
        this.isSliding = false;
      }
    }

    // Variable jump: holding Space NEVER adds height. Releasing Space cuts
    // upward velocity by 55% (standard COD-style short hop).
    if (!spaceDown && this.vel.y > 0 && this.spaceWasDown) {
      this.vel.y *= 0.45;
    }
    this.spaceWasDown = spaceDown;

    // Prevent Space held from auto-bunny by clearing the held flag notion:
    // If still in air with Space pressed, do nothing special — gravity does the rest.
    // This removes any "vault to the moon" path.

    const nextPos = this.pos.clone().addScaledVector(this.vel, dt);
    this.resolveCollisions(nextPos, input.colliders);

    if (this.isGrounded && this.speed > 3.0 && !this.isSliding) {
      this.gunBobTime += dt * this.speed * 1.4;
      if (Math.sin(this.gunBobTime * 2) > 0.95 && Math.random() < 0.25) events.onFootstep?.();
    }

    // Guard against NaN/infinity poisoning (e.g. bad collider mins) — recover in place, don't teleport to ocean.
    if (!Number.isFinite(this.pos.x) || !Number.isFinite(this.pos.y) || !Number.isFinite(this.pos.z)) {
      this.pos.set(0, 0.1, -40);
      this.vel.set(0, 0, 0);
      this.isGrounded = true;
      return;
    }
    if (this.pos.y < -3.5) {
      events.onOceanFall?.();
      this.pos.set(0, 0.1, -40);
      this.vel.set(0, 0, 0);
    }
  }
  private resolveCollisions(nextPos: THREE.Vector3, colliders: readonly BoxCollider[]): void {
    const playerHeight = this.isSliding ? 1.0 : 1.8;
    let highestGroundY = -999;
    for (const c of colliders) {
      if (
        nextPos.x + PLAYER_RADIUS > c.min.x &&
        nextPos.x - PLAYER_RADIUS < c.max.x &&
        nextPos.z + PLAYER_RADIUS > c.min.z &&
        nextPos.z - PLAYER_RADIUS < c.max.z
      ) {
        if (c.max.y <= this.pos.y + STEP_HEIGHT && nextPos.y >= c.min.y - 0.25) {
          if (c.max.y > highestGroundY) highestGroundY = c.max.y;
        }
      }
    }
    if (highestGroundY > -900 && (nextPos.y <= highestGroundY + 0.15 || this.pos.y <= highestGroundY + 0.05)) {
      if (this.vel.y <= 0) {
        nextPos.y = highestGroundY;
        this.vel.y = 0;
        this.isGrounded = true;
      } else {
        this.isGrounded = false;
      }
    } else {
      this.isGrounded = false;
    }
    let ceilingY = Infinity;
    for (const c of colliders) {
      if (c.min.y <= this.pos.y + playerHeight * 0.5) continue;
      if (
        nextPos.x + PLAYER_RADIUS > c.min.x &&
        nextPos.x - PLAYER_RADIUS < c.max.x &&
        nextPos.z + PLAYER_RADIUS > c.min.z &&
        nextPos.z - PLAYER_RADIUS < c.max.z
      ) {
        if (c.min.y < ceilingY) ceilingY = c.min.y;
      }
    }
    if (this.vel.y > 0 && nextPos.y + playerHeight > ceilingY) {
      nextPos.y = ceilingY - playerHeight;
      this.vel.y = 0;
    }
    for (const c of colliders) {
      if (c.max.y <= nextPos.y + 0.08) continue;
      if (c.min.y >= nextPos.y + playerHeight - 0.01) continue;
      if (nextPos.y < c.max.y && nextPos.y + playerHeight > c.min.y) {
        if (
          nextPos.x + PLAYER_RADIUS > c.min.x &&
          nextPos.x - PLAYER_RADIUS < c.max.x &&
          nextPos.z + PLAYER_RADIUS > c.min.z &&
          nextPos.z - PLAYER_RADIUS < c.max.z
        ) {
          const pushX1 = c.max.x - (nextPos.x - PLAYER_RADIUS);
          const pushX2 = nextPos.x + PLAYER_RADIUS - c.min.x;
          const pushZ1 = c.max.z - (nextPos.z - PLAYER_RADIUS);
          const pushZ2 = nextPos.z + PLAYER_RADIUS - c.min.z;
          if (pushX1 < pushX2 && pushX1 < pushZ1 && pushX1 < pushZ2) {
            nextPos.x = c.max.x + PLAYER_RADIUS;
            if (this.vel.x < 0) this.vel.x = 0;
          } else if (pushX2 < pushX1 && pushX2 < pushZ1 && pushX2 < pushZ2) {
            nextPos.x = c.min.x - PLAYER_RADIUS;
            if (this.vel.x > 0) this.vel.x = 0;
          } else if (pushZ1 < pushX1 && pushZ1 < pushX2 && pushZ1 < pushZ2) {
            nextPos.z = c.max.z + PLAYER_RADIUS;
            if (this.vel.z < 0) this.vel.z = 0;
          } else {
            nextPos.z = c.min.z - PLAYER_RADIUS;
            if (this.vel.z > 0) this.vel.z = 0;
          }
        }
      }
    }
    this.pos.copy(nextPos);
  }
}
