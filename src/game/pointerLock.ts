/**
 * Pointer-lock lifecycle for the game canvas.
 *
 * Owns the lock request/exit dance (including Chromium's post-exit cooldown),
 * focus re-locking, and the `pointerlockchange` / `pointerlockerror` listeners.
 * Extracted from GameEngine so the browser-quirk handling has one home and the
 * cooldown math can be unit-tested without a DOM.
 */

/** Chromium ignores lock requests for roughly this long after an exit. */
export const LOCK_COOLDOWN_MS = 1200;
/** Retry slightly after the cooldown so the request is not rejected again. */
export const LOCK_RETRY_MS = 1250;

/**
 * How long to wait before retrying a pointer-lock request.
 * Returns 0 when a request may be attempted immediately.
 * A direct user gesture (click/keypress) is always allowed through, matching the
 * pre-extraction engine behavior.
 */
export function pointerLockRetryDelay(elapsedMs: number, isDirectUserGesture: boolean): number {
  if (isDirectUserGesture) return 0;
  return elapsedMs < LOCK_COOLDOWN_MS ? LOCK_RETRY_MS - elapsedMs : 0;
}

export interface PointerLockOptions {
  /** Element that receives the lock. Defaults to `document.body`. */
  target?: HTMLElement;
  /** Whether lock requests are currently allowed (game started, renderer alive). */
  isEnabled: () => boolean;
  /** Called whenever the lock state changes. */
  onChange?: (locked: boolean) => void;
}

export class PointerLockController {
  private readonly target: HTMLElement;
  private readonly isEnabled: () => boolean;
  private readonly onChange?: (locked: boolean) => void;

  private locked = false;
  private lastExitTime = 0;
  private pendingTimeout: number | null = null;
  private disposed = false;

  private readonly onLockChange = () => {
    const locked = document.pointerLockElement === this.target;
    this.locked = locked;
    if (!locked) this.lastExitTime = Date.now();
    this.onChange?.(locked);
  };

  private readonly onLockError = () => {
    // Swallow unhandled pointerlockerror during browser cooldown.
  };

  private readonly onFocus = () => {
    // Re-lock if the game is running and focus returned (trackpad-friendly).
    if (!this.disposed && !this.locked && this.isEnabled() && document.hasFocus()) {
      this.request(true);
    }
  };

  constructor(options: PointerLockOptions) {
    this.target = options.target ?? document.body;
    this.isEnabled = options.isEnabled;
    this.onChange = options.onChange;
  }

  get isLocked(): boolean {
    return this.locked;
  }

  attach(): void {
    if (this.disposed) return;
    document.addEventListener('pointerlockchange', this.onLockChange);
    document.addEventListener('pointerlockerror', this.onLockError);
    window.addEventListener('focus', this.onFocus);
  }

  request(isDirectUserGesture = false): void {
    if (this.disposed || !this.isEnabled()) return;

    if (document.pointerLockElement === this.target) {
      this.locked = true;
      this.onChange?.(true);
      return;
    }

    const elapsedSinceExit = Date.now() - this.lastExitTime;
    const retryDelay = pointerLockRetryDelay(elapsedSinceExit, isDirectUserGesture);
    if (retryDelay > 0) {
      if (this.pendingTimeout !== null) clearTimeout(this.pendingTimeout);
      this.pendingTimeout = window.setTimeout(() => {
        this.pendingTimeout = null;
        this.request(true);
      }, retryDelay);
      return;
    }

    try {
      if (import.meta.env.DEV) {
        console.warn(
          'DEBUG POINTERLOCK el=',
          this.target.tagName,
          'lockedElement=',
          document.pointerLockElement,
          'active=',
          document.hasFocus(),
          'targetInDoc=',
          this.target.isConnected
        );
      }
      try {
        this.target.focus();
      } catch {}
      const result = this.target.requestPointerLock();
      if (result && typeof (result as unknown as Promise<void>).catch === 'function') {
        (result as unknown as Promise<void>).catch((err: unknown) => {
          console.warn('Pointer lock request rejected:', String(err));
        });
      }
    } catch (err) {
      console.warn('Pointer lock request threw:', err);
    }
  }

  exit(): void {
    this.lastExitTime = Date.now();
    if (this.pendingTimeout !== null) {
      clearTimeout(this.pendingTimeout);
      this.pendingTimeout = null;
    }
    if (document.pointerLockElement) {
      try {
        document.exitPointerLock();
      } catch {}
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.pendingTimeout !== null) {
      clearTimeout(this.pendingTimeout);
      this.pendingTimeout = null;
    }
    document.removeEventListener('pointerlockchange', this.onLockChange);
    document.removeEventListener('pointerlockerror', this.onLockError);
    window.removeEventListener('focus', this.onFocus);
  }
}
