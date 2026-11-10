import * as THREE from 'three';
import { sound } from './audio';
import { GameEngine } from './engine';

export interface TraumaData {
  trauma: number;
  decay: number;
  maxOffset: THREE.Vector2;
  maxRoll: number;
}

export interface HitDirection {
  angle: number; // angle in radians where 0 = front, Math.PI = back
  elevation: number; // up/down angle
  distance: number; // distance of shooter
  screenX: number; // screen position (-1 to 1)
  screenY: number; // screen position (-1 to 1)
}

export class GameFeelSystem {
  private trauma: TraumaData = {
    trauma: 0,
    decay: 1.2,
    maxOffset: new THREE.Vector2(12, 8),
    maxRoll: 0.1
  };

  private hitDirection: HitDirection | null = null;
  private hitDirectionTimer: number = 0;
  private redTintTimer: number = 0;
  private hitStopTimer: number = 0;
  private screenEffects: {
    redTint: number;
    vignette: number;
    contrast: number;
  } = {
    redTint: 0,
    vignette: 0,
    contrast: 1
  };
  private traumaTime: number = 0;
  private lastTraumaUpdate: number = 0;

  // Feedback tiers for consistent scaling
  private readonly feedbackTiers = {
    small: {
      trauma: 0.15,
      hitStop: 0,
      redTint: 0.1,
      soundVolume: 0.7
    },
    medium: {
      trauma: 0.4,
      hitStop: 0.05,
      redTint: 0.3,
      soundVolume: 1.0
    },
    large: {
      trauma: 0.8,
      hitStop: 0.12,
      redTint: 0.6,
      soundVolume: 1.3
    }
  };

  private camera: THREE.PerspectiveCamera | null = null;
  private renderer: THREE.WebGLRenderer | null = null;

  constructor() {
    this.traumaTime = 0;
  }

  setCamera(camera: THREE.PerspectiveCamera) {
    this.camera = camera;
  }

  setRenderer(renderer: THREE.WebGLRenderer) {
    this.renderer = renderer;
  }

  addTrauma(amount: number) {
    this.trauma.trauma = Math.min(this.trauma.trauma + amount, 1.0);
  }

  processHit(
    damage: number,
    hitPosition: THREE.Vector3,
    shooterPosition: THREE.Vector3 | null,
    isHeadshot: boolean = false,
    tier: 'small' | 'medium' | 'large' = 'medium',
    gameEngine: GameEngine
  ): HitDirection | null {
    // Determine feedback tier based on damage and context
    const actualTier = this.getFeedbackTier(damage, isHeadshot, tier, gameEngine);
    
    // Add trauma based on hit severity
    this.addTrauma(this.feedbackTiers[actualTier].trauma);
    
    // Calculate hit direction
    const hitDirection = this.calculateHitDirection(hitPosition, shooterPosition);
    this.hitDirection = hitDirection;
    this.hitDirectionTimer = 1.0; // Show for 1 second
    
    // Apply hit-stop for impactful hits
    if (this.feedbackTiers[actualTier].hitStop > 0) {
      this.triggerHitStop(this.feedbackTiers[actualTier].hitStop);
    }
    
    // Apply red tint
    this.redTintTimer = this.feedbackTiers[actualTier].redTint;
    
    // Play hit sounds
    this.playHitFeedback(actualTier, hitDirection, gameEngine);
    
    return hitDirection;
  }

  private getFeedbackTier(
    damage: number,
    isHeadshot: boolean,
    tier: 'small' | 'medium' | 'large',
    gameEngine: GameEngine
  ): 'small' | 'medium' | 'large' {
    if (gameEngine.isMultiplayer) {
      // In multiplayer mode, headshots are always large
      if (isHeadshot) return 'large';
      // Players do more damage on average, so adjust thresholds
      if (damage > 40) return 'large';
      if (damage > 20) return 'medium';
      return tier;
    } else {
      // Single-player mode uses original thresholds
      if (isHeadshot) return 'large';
      if (damage > 50) return 'large';
      if (damage > 25) return 'medium';
      return tier;
    }
  }

  calculateHitDirection(
    hitPosition: THREE.Vector3,
    shooterPosition: THREE.Vector3 | null
  ): HitDirection | null {
    if (!shooterPosition) {
      // Random direction if shooter unknown
      return {
        angle: Math.random() * Math.PI * 2,
        elevation: (Math.random() - 0.5) * 0.5,
        distance: 10,
        screenX: (Math.random() - 0.5) * 2,
        screenY: (Math.random() - 0.5) * 2
      };
    }

    // Calculate direction from shooter to hit position
    const direction = hitPosition.clone().sub(shooterPosition).normalize();
    
    // Convert to screen space
    if (this.camera) {
      const screenPos = hitPosition.clone().project(this.camera);
      const screenX = ((screenPos.x + 1) * 0.5) * 2 - 1; // -1 to 1
      const screenY = ((-screenPos.y + 1) * 0.5) * 2 - 1; // -1 to 1
      
      // Calculate angle (0 = front, Math.PI = back)
      const playerForward = new THREE.Vector3(0, 0, -1);
      const angle = Math.atan2(direction.x, direction.z);
      
      // Calculate elevation
      const elevation = Math.asin(direction.y);
      
      // Calculate distance
      const distance = hitPosition.distanceTo(shooterPosition);
      
      return {
        angle,
        elevation,
        distance,
        screenX,
        screenY
      };
    }

    return {
      angle: Math.atan2(direction.x, direction.z),
      elevation: Math.asin(direction.y),
      distance: hitPosition.distanceTo(shooterPosition),
      screenX: direction.x,
      screenY: direction.y
    };
  }

  private triggerHitStop(duration: number) {
    this.hitStopTimer = duration;
    // Note: Time scale manipulation should be handled in the main game loop
  }

  private playHitFeedback(
    tier: 'small' | 'medium' | 'large',
    hitDirection: HitDirection | null,
    gameEngine: GameEngine
  ) {
    const volume = this.feedbackTiers[tier].soundVolume;
    
    // Play hit sound
    sound.playHitSound(volume);
    
    // Play directional sound if direction is known and we're in multiplayer
    if (hitDirection && gameEngine.isMultiplayer) {
      this.playDirectionalHitSound(hitDirection, volume);
    }
    
    // Play different sounds for headshots
    if (tier === 'large') {
      sound.playHeadshotSound(volume);
    }
  }

  private playDirectionalHitSound(direction: HitDirection, volume: number) {
    // Simple stereo panning based on screen position
    const pan = Math.max(-1, Math.min(1, direction.screenX));
    sound.playHitDirectionalSound(pan, volume);
  }

  update(deltaTime: number, timeScale: number = 1.0) {
    const actualDeltaTime = deltaTime * timeScale;
    
    // Update trauma (camera shake)
    this.updateTrauma(actualDeltaTime);
    
    // Update hit direction indicator
    if (this.hitDirectionTimer > 0) {
      this.hitDirectionTimer -= actualDeltaTime;
    }
    
    // Update red tint
    if (this.redTintTimer > 0) {
      this.redTintTimer -= actualDeltaTime;
      this.screenEffects.redTint = this.redTintTimer;
    } else {
      this.screenEffects.redTint = Math.max(0, this.screenEffects.redTint - deltaTime * 2);
    }
    
    // Update hit-stop
    if (this.hitStopTimer > 0) {
      this.hitStopTimer -= actualDeltaTime;
    }
    
    // Update screen effects
    this.updateScreenEffects(deltaTime);
  }

  private updateTrauma(deltaTime: number) {
    if (this.trauma.trauma <= 0) return;
    
    // Decay trauma
    this.trauma.trauma = Math.max(0, this.trauma.trauma - this.trauma.decay * deltaTime);
    
    // Update trauma time for smooth shake
    this.traumaTime += deltaTime * 30.0;
    
    // Apply camera shake if camera is available
    if (this.camera) {
      const shakeIntensity = this.trauma.trauma * this.trauma.trauma; // Quadratic falloff
      
      // Smooth pseudo-random shake using sine waves
      const offsetX = this.trauma.maxOffset.x * shakeIntensity * Math.sin(this.traumaTime * 1.7);
      const offsetY = this.trauma.maxOffset.y * shakeIntensity * Math.sin(this.traumaTime * 2.3);
      const roll = this.trauma.maxRoll * shakeIntensity * Math.sin(this.traumaTime * 1.1);

      // Apply shake to camera
      if (this.camera.parent) {
        (this.camera.parent as any).position.x = offsetX;
        (this.camera.parent as any).position.y = offsetY;
        (this.camera.parent as any).rotation.z = roll;
      }
    }
  }

  private updateScreenEffects(deltaTime: number) {
    // Update vignette
    if (this.hitDirectionTimer > 0) {
      this.screenEffects.vignette = Math.min(0.8, this.screenEffects.vignette + deltaTime * 2);
    } else {
      this.screenEffects.vignette = Math.max(0, this.screenEffects.vignette - deltaTime * 1);
    }
    
    // Update contrast
    this.screenEffects.contrast = 1 + this.screenEffects.redTint * 0.3;
  }

  getScreenEffects() {
    return {
      redTint: this.screenEffects.redTint,
      vignette: this.screenEffects.vignette,
      contrast: this.screenEffects.contrast
    };
  }

  getHitDirection(): HitDirection | null {
    return this.hitDirectionTimer > 0 ? this.hitDirection : null;
  }

  isHitStopActive(): boolean {
    return this.hitStopTimer > 0;
  }

  reset() {
    this.trauma.trauma = 0;
    this.hitDirection = null;
    this.hitDirectionTimer = 0;
    this.redTintTimer = 0;
    this.hitStopTimer = 0;
    this.screenEffects = {
      redTint: 0,
      vignette: 0,
      contrast: 1
    };
    this.traumaTime = 0;
  }

  getTrauma(): number {
    return this.trauma.trauma;
  }
}