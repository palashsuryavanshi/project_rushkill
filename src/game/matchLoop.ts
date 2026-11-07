import { checkMatchEnd } from './rules';

/**
 * Match clock plus the per-frame HUD/FPS cadence.
 *
 * Extracted from GameEngine so the countdown, 10 Hz HUD throttle, and FPS
 * averaging are pure bookkeeping that can be unit-tested without a renderer.
 * The engine still owns bot iteration and the actual HUD payloads; this module
 * only decides *when* they run and when the match is over.
 */

export type MatchWinner = 'player' | 'bots' | 'draw';

/** Seconds between forced HUD stat pushes. */
export const HUD_INTERVAL_SEC = 0.1;
/** Seconds between FPS samples. */
export const FPS_INTERVAL_SEC = 1.0;

export interface HudTick {
  statsDue: boolean;
  minimapDue: boolean;
}

export interface FpsSample {
  fps: number;
  frameMs: number;
  calls: number;
}

export class MatchLoop {
  timeRemaining: number;

  private statsAccum = 0;
  private minimapAccum = 0;
  private fpsFrames = 0;
  private fpsElapsed = 0;

  constructor(initialSeconds = 300) {
    this.timeRemaining = initialSeconds;
  }

  /**
   * Advance the countdown. Returns the winner the frame time expires, else null.
   * The clock is not advanced when it is already exhausted (matches the engine's
   * original `if (timeRemaining > 0)` guard).
   */
  advance(dt: number, playerScore: number, scoreLimit: number): MatchWinner | null {
    if (this.timeRemaining <= 0) return null;

    this.timeRemaining -= dt;
    if (this.timeRemaining > 0) return null;

    const result = checkMatchEnd({ playerScore, scoreLimit, timeRemainingSec: 0 });
    return result.isOver ? result.winner : null;
  }

  /** Accumulate frame time and report which HUD streams are due this frame. */
  hudDue(dt: number): HudTick {
    this.statsAccum += dt;
    this.minimapAccum += dt;
    return {
      statsDue: this.statsAccum >= HUD_INTERVAL_SEC,
      minimapDue: this.minimapAccum >= HUD_INTERVAL_SEC,
    };
  }

  /** Call after pushing stats so the next push waits a full interval. */
  markStatsSent(): void {
    this.statsAccum = 0;
  }

  /** Call after pushing the minimap so the next push waits a full interval. */
  markMinimapSent(): void {
    this.minimapAccum = 0;
  }

  /**
   * Accumulate frame time and return an FPS sample once per second when the
   * overlay is enabled. When disabled the counters keep accumulating (original
   * behavior), so enabling the overlay produces an immediate sample.
   */
  sampleFps(dt: number, enabled: boolean, renderCalls: number): FpsSample | null {
    this.fpsFrames++;
    this.fpsElapsed += dt;

    if (this.fpsElapsed < FPS_INTERVAL_SEC || !enabled) return null;

    const sample: FpsSample = {
      fps: this.fpsFrames / this.fpsElapsed,
      frameMs: (this.fpsElapsed / this.fpsFrames) * 1000,
      calls: renderCalls,
    };
    this.fpsFrames = 0;
    this.fpsElapsed = 0;
    return sample;
  }
}
