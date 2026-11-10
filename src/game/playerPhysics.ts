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

    // Clamp horizontal speed in the air too. Previously this only ran while
    // grounded, so an airborne player accelerated to ~28 m/s (air accel 35 with
    // light drag). Jumping near the open walkway rail then carried the player
    // far outboard over the 1.2 m rail and into the ocean respawn.
    const maxSpeed = this.isSliding ? 18.0 : baseSpeed;
    const hSpeed = this.speed;
    if (hSpeed > maxSpeed && !this.isSliding) {
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
      // ROOT CAUSE of the "stairs teleport me into the ocean" bug.
      // This used to be `nextPos.y = ceilingY - playerHeight`, which moves the
      // player DOWN by the full player height whenever the ceiling is lower than
      // standing height. Walking along the outboard walkway underneath the
      // external staircase (which has only 1.65 m of clearance for a 1.8 m
      // player) therefore buried the player at y = -0.15 — inside the deck slab
      // (y -0.40..0.00). The horizontal pass then resolved that overlap by the
      // smallest exit, which was the outboard face of the deck slab, and shoved
      // the player 2.45 m sideways to x = 12.65, outside the hull. From there
      // they fell past y -3.5 and the ocean respawn fired.
      //
      // A ceiling may only ever cancel upward motion. It must never lower the
      // player below the feet position they already had, otherwise it can push
      // them through the floor they are standing on.
      const ceilingLimitY = ceilingY - playerHeight;
      if (ceilingLimitY > this.pos.y) nextPos.y = ceilingLimitY;
      else nextPos.y = this.pos.y;
      this.vel.y = 0;
    }
    // ------------------------------------------------------------------
    // Horizontal resolution: swept "stop at the first blocking face".
    //
    // The previous implementation pushed the player out of every overlapping
    // box by that box's smallest penetration, independently, in a single pass.
    // Because each push moved the player into the next box, corrections
    // accumulated: standing slightly inside the internal staircase produced
    // seven consecutive 0.8 m pushes in one frame and flung the player 5.15 m
    // down the run. The same mechanism could shove the player out of the hull.
    //
    // Instead, for each axis we only clamp the move back to the first face the
    // player would have crossed, so a correction can never exceed the distance
    // the player actually tried to travel. No collider can teleport them.
    //
    // Stair climbing still works because the ground pass above runs on the
    // desired (not yet clamped) position and lifts the player by STEP_HEIGHT
    // first; anything we can step onto is skipped here.
    // ------------------------------------------------------------------
    const fromX = this.pos.x;
    const fromZ = this.pos.z;

    // Fixed X-then-Z order (not "dominant axis first"): clamping X first means
    // the Z pass sees a non-overlapping X, so brushing a wall diagonally still
    // lets the player slide along it instead of sticking.
    for (const axis of ['x', 'z'] as const) {
      const move = axis === 'x' ? nextPos.x - fromX : nextPos.z - fromZ;
      if (Math.abs(move) < 1e-6) continue;
      const sign = Math.sign(move);
      let allowed = axis === 'x' ? nextPos.x : nextPos.z;
      let blocked = false;

      for (const c of colliders) {
        // Anything at or below stepping height is walked onto, not blocked.
        if (c.max.y <= nextPos.y + 0.08) continue;
        // Anything entirely above the player is a ceiling, handled above.
        if (c.min.y >= nextPos.y + playerHeight - 0.01) continue;
        if (!(nextPos.y < c.max.y && nextPos.y + playerHeight > c.min.y)) continue;

        // Only boxes that overlap on the other horizontal axis can block.
        if (axis === 'x') {
          if (nextPos.z + PLAYER_RADIUS <= c.min.z || nextPos.z - PLAYER_RADIUS >= c.max.z) continue;
        } else {
          if (nextPos.x + PLAYER_RADIUS <= c.min.x || nextPos.x - PLAYER_RADIUS >= c.max.x) continue;
        }

        const start = axis === 'x' ? fromX : fromZ;
        if (sign > 0) {
          const face = axis === 'x' ? c.min.x - PLAYER_RADIUS : c.min.z - PLAYER_RADIUS;
          // `start <= face` means we were outside this box and are crossing into
          // it. If we were already inside, do not clamp, so we can walk out.
          if (start <= face && allowed > face) {
            allowed = face;
            blocked = true;
          }
        } else {
          const face = axis === 'x' ? c.max.x + PLAYER_RADIUS : c.max.z + PLAYER_RADIUS;
          if (start >= face && allowed < face) {
            allowed = face;
            blocked = true;
          }
        }
      }

      if (axis === 'x') {
        nextPos.x = allowed;
        if (blocked) this.vel.x = 0;
      } else {
        nextPos.z = allowed;
        if (blocked) this.vel.z = 0;
      }
    }
    this.pos.copy(nextPos);
  }
}
