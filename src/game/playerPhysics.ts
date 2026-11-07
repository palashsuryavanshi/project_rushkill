import * as THREE from 'three';
import type { BoxCollider } from './mapHijacked';

/**
 * Player movement, gravity, jump/slide state, and AABB collision resolution.
 *
 * Extracted from GameEngine so the body simulation has one reason to change and
 * can be reasoned about without the renderer. GameEngine keeps camera state,
 * weapon state, and the audio/callback wiring (passed in as events).
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

export class PlayerPhysics {
  readonly pos = new THREE.Vector3(0, 0.1, -45);
  readonly vel = new THREE.Vector3();
  isGrounded = true;
  isSliding = false;
  /** Animation phase for weapon bob, advanced while moving on the ground. */
  gunBobTime = 0;

  private slideTimer = 0;
  private coyoteTimer = 0;
  private jumpBufferTimer = 0;

  /** Horizontal speed in units/second. */
  get speed(): number {
    return Math.sqrt(this.vel.x * this.vel.x + this.vel.z * this.vel.z);
  }

  /** Reposition and stop (used by startMatch / respawn). */
  reset(pos: THREE.Vector3): void {
    this.pos.copy(pos);
    this.vel.set(0, 0, 0);
  }

  /** Buffer a jump press (coyote-time friendly). */
  queueJump(buffer = 0.14): void {
    this.jumpBufferTimer = buffer;
  }

  update(dt: number, input: PlayerPhysicsInput, events: PlayerPhysicsEvents = {}): void {
    const keys = input.keys;
    const isShiftHeld = keys.has('ShiftLeft') || keys.has('KeyC');

    // Slide initiation
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

    // Friction
    this.vel.x *= Math.pow(friction, dt * 60);
    this.vel.z *= Math.pow(friction, dt * 60);

    // Cap horizontal speed
    const maxSpeed = this.isSliding ? 18.0 : baseSpeed;
    const hSpeed = this.speed;
    if (hSpeed > maxSpeed && this.isGrounded && !this.isSliding) {
      this.vel.x = (this.vel.x / hSpeed) * maxSpeed;
      this.vel.z = (this.vel.z / hSpeed) * maxSpeed;
    }

    // Gravity
    this.vel.y += GRAVITY * dt;

    // Coyote time + jump buffering
    if (this.isGrounded) this.coyoteTimer = 0.1;
    else this.coyoteTimer -= dt;

    if (this.jumpBufferTimer > 0) this.jumpBufferTimer -= dt;

    if (this.jumpBufferTimer > 0 && (this.isGrounded || this.coyoteTimer > 0)) {
      this.vel.y = JUMP_VELOCITY;
      this.isGrounded = false;
      this.coyoteTimer = 0;
      this.jumpBufferTimer = 0;
      events.onJump?.();

      // Slide-hop boost (reduced exploit potential)
      if (this.isSliding) {
        const boostFactor = 1.1;
        const momentumConservation = 0.8;
        this.vel.x = this.vel.x * momentumConservation + this.vel.x * boostFactor;
        this.vel.z = this.vel.z * momentumConservation + this.vel.z * boostFactor;
        this.isSliding = false;
      }
    }

    // Variable jump cut on early release
    if (!keys.has('Space') && this.vel.y > 0) {
      this.vel.y *= Math.pow(0.5, dt * 60);
    }

    const nextPos = this.pos.clone().addScaledVector(this.vel, dt);
    this.resolveCollisions(nextPos, input.colliders);

    // Footstep cadence + weapon-bob phase
    if (this.isGrounded && hSpeed > 3.0 && !this.isSliding) {
      this.gunBobTime += dt * hSpeed * 1.4;
      if (Math.sin(this.gunBobTime * 2) > 0.95 && Math.random() < 0.25) {
        events.onFootstep?.();
      }
    }

    // Fall in ocean: report damage, then teleport back to a deck spawn.
    if (this.pos.y < -3.5) {
      events.onOceanFall?.();
      this.pos.set(0, 0.1, -40);
      this.vel.set(0, 0, 0);
    }
  }

  private resolveCollisions(nextPos: THREE.Vector3, colliders: readonly BoxCollider[]): void {
    const playerHeight = this.isSliding ? 1.0 : 1.8;

    // 1. Detect walkable ground beneath the player's horizontal footprint
    let highestGroundY = -999;
    for (const c of colliders) {
      if (
        nextPos.x + PLAYER_RADIUS > c.min.x &&
        nextPos.x - PLAYER_RADIUS < c.max.x &&
        nextPos.z + PLAYER_RADIUS > c.min.z &&
        nextPos.z - PLAYER_RADIUS < c.max.z
      ) {
        if (c.max.y <= this.pos.y + STEP_HEIGHT && nextPos.y >= c.min.y - 0.25) {
          if (c.max.y > highestGroundY) {
            highestGroundY = c.max.y;
          }
        }
      }
    }

    // 2. Snap to floor when within landing contact distance and not ascending
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

    // 3. Resolve horizontal collisions against walls and obstacles
    for (const c of colliders) {
      if (c.max.y <= nextPos.y + 0.08) continue; // ignore floors beneath feet

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
          const minPush = Math.min(pushX1, pushX2, pushZ1, pushZ2);

          if (minPush === pushX1) {
            nextPos.x = c.max.x + PLAYER_RADIUS;
            if (this.vel.x < 0) this.vel.x = 0;
          } else if (minPush === pushX2) {
            nextPos.x = c.min.x - PLAYER_RADIUS;
            if (this.vel.x > 0) this.vel.x = 0;
          } else if (minPush === pushZ1) {
            nextPos.z = c.max.z + PLAYER_RADIUS;
            if (this.vel.z < 0) this.vel.z = 0;
          } else if (minPush === pushZ2) {
            nextPos.z = c.min.z - PLAYER_RADIUS;
            if (this.vel.z > 0) this.vel.z = 0;
          }
        }
      }
    }

    this.pos.copy(nextPos);
  }
}
