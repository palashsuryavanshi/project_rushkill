/**
 * Player health regeneration.
 *
 * After taking damage, regen pauses for a short delay, then restores health at
 * a fixed rate up to the maximum. Dead players never regenerate; respawning
 * restores full health through the normal respawn path.
 */

export const HEALTH_REGEN_DELAY_SEC = 4;
export const HEALTH_REGEN_PER_SEC = 20;

export class HealthRegen {
  private delayRemaining = 0;

  get delayActive(): boolean {
    return this.delayRemaining > 0;
  }

  /** Call whenever the player takes damage. */
  onDamage(): void {
    this.delayRemaining = HEALTH_REGEN_DELAY_SEC;
  }

  /** Clear the delay (respawn / match start). */
  reset(): void {
    this.delayRemaining = 0;
  }

  /**
   * Advance regeneration and return the resulting HP.
   * Does not heal at 0 HP (dead) or above the maximum.
   */
  tick(dt: number, hp: number, maxHp: number): number {
    if (hp <= 0 || hp >= maxHp) return hp;

    if (this.delayRemaining > 0) {
      this.delayRemaining = Math.max(0, this.delayRemaining - dt);
      return hp;
    }

    return Math.min(maxHp, hp + HEALTH_REGEN_PER_SEC * dt);
  }
}
