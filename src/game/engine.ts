import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { WeaponDef, PlayerStats, KillfeedEntry, StreakBanner, HitmarkerData, FloatingDamage, GameSettings, MatchConfig, BotDifficulty } from './types';
import { RUSH_WEAPONS, getWeaponById, calculateShotTotalDamage } from './weapons';
import { buildHijackedMap, MapData, BoxCollider } from './mapHijacked';
import { buildGunModel, GunRig } from './gunModels';
import { BotState, BotPersonality, createBot, updateBotAI, triggerBotHit } from './botAI';
import { findClosestBotHit, findClosestBoxHit, isBlockedByCover, applySpread, computeShotSpread, resolveShotAim, drainPendingHits, RAY_FAR, type PendingHit } from './combat';
import { PlayerPhysics, shouldQueueJump } from './playerPhysics';
import { PointerLockController } from './pointerLock';
import { EffectsPool } from './effectsPool';
import { MatchLoop } from './matchLoop';
import { pickSafestSpawn, PLAYER_RESPAWN_SECONDS, respawnLoadout } from './respawn';
import { HealthRegen } from './healthRegen';
import { evaluateKillScore, checkMatchEnd } from './rules';
import { sound } from './audio';
import { statsChanged, minimapChanged, LastMinimap } from './notifyGate';

export interface EngineCallbacks {
  onStatsUpdate: (stats: PlayerStats) => void;
  onKillfeed: (entry: KillfeedEntry) => void;
  onStreakBanner: (banner: StreakBanner) => void;
  onHitmarker: (data: HitmarkerData) => void;
  onFloatingDamage: (dmg: FloatingDamage) => void;
  onMatchEnd: (winner: 'player' | 'bots' | 'draw') => void;
  onMinimapUpdate: (playerPos: { x: number; z: number; angle: number }, bots: { id: string; x: number; z: number; isDead: boolean }[]) => void;
  onPointerLockChange?: (locked: boolean) => void;
  onWebGLError?: (errorMsg: string) => void;
  onFpsSample?: (sample: { fps: number; frameMs: number; calls: number } | null) => void;
}

export class GameEngine {
  private container: HTMLDivElement;
  private renderer: THREE.WebGLRenderer | null = null;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private mapData!: MapData;
  private sunLight!: THREE.DirectionalLight;

  // Software GL detection & lifecycle state
  private isSoftwareGl: boolean = false;
  public webGlFailed: boolean = false;
  public graphicsTierApplied: 'high' | 'low' = 'high';
  private frameId: number = 0;
  private cleanupListeners: (() => void) | null = null;
  private handleContextLost: ((e: Event) => void) | null = null;
  private handleContextRestored: (() => void) | null = null;

  // Player & Controls
  public activeWeapon: WeaponDef = RUSH_WEAPONS[0];
  private gunRig: GunRig | null = null;
  private gunCameraRig: THREE.Group = new THREE.Group();

  // Position & Physics (body state lives in PlayerPhysics; camera-only state stays here)
  public readonly physics = new PlayerPhysics();
  private pitch: number = 0;
  private yaw: number = 0;
  private currentCamHeight: number = 1.7;

  // Gunplay State
  private ammo: number = 30;
  private reserveAmmo: number = 120;
  private isReloading: boolean = false;
  private reloadTimer: number = 0;
  private fireTimer: number = 0;
  private isAds: boolean = false;
  private adsWeight: number = 0; // 0 (hip) to 1 (full ADS)
  private recoilPitch: number = 0;
  private recoilYaw: number = 0;
  private flashTimer: number = 0;
  // Single-registration pending-hit queue (projectile travel / delay)
  private pendingHits: PendingHit[] = [];

  // Stats & Scoring
  public hp: number = 100;
  public maxHp: number = 100;
  public score: number = 0;
  public kills: number = 0;
  public deaths: number = 0;
  public streak: number = 0;
  public highestStreak: number = 0;
  public headshots: number = 0;
  public shotsFired: number = 0;
  public shotsHit: number = 0;
  private readonly matchLoop = new MatchLoop();
  public scoreLimit: number = 25; // 25 kills to win

  /** Match clock, kept public for App.tsx (delegates to MatchLoop). */
  public get matchTimeRemaining(): number {
    return this.matchLoop.timeRemaining;
  }
  public set matchTimeRemaining(seconds: number) {
    this.matchLoop.timeRemaining = seconds;
  }

  // Bots
  private bots: BotState[] = [];

  // Player death / respawn
  private isPlayerDead = false;
  private playerRespawnTimer = 0;
  private readonly healthRegen = new HealthRegen();

  // Tracers & Particles Pool
  private effects!: EffectsPool;

  // Inputs
  private keysHeld = new Set<string>();
  private mouseButtonsHeld = new Set<number>();
  private pointerLock: PointerLockController | null = null;

  /** Public read-only view of the lock state (App/HUD never wrote this). */
  public get isPointerLocked(): boolean {
    return this.pointerLock?.isLocked ?? false;
  }

  // Engine state
  public isRunning: boolean = true;
  public isTitleScreen: boolean = true;
  private callbacks: EngineCallbacks;
  public settings: GameSettings;
  private lastStatsPayload: PlayerStats | null = null;
  private lastMinimapSample: LastMinimap | null = null;

  constructor(container: HTMLDivElement, settings: GameSettings, callbacks: EngineCallbacks) {
    this.container = container;
    this.settings = settings;
    this.callbacks = callbacks;

    this.initRenderer();
    if (this.webGlFailed || !this.renderer) {
      return;
    }
    this.applyGraphicsPreset(this.settings.graphicsPreset);
    this.initScene();
    this.initInputListeners();
    this.setWeapon(RUSH_WEAPONS[0]);
    this.spawnBots();
    this.startLoop();
  }

  private initRenderer() {
    // Stage 1: Attempt standard high-performance WebGL context
    try {
      this.renderer = new THREE.WebGLRenderer({
        antialias: true,
        powerPreference: 'high-performance',
        alpha: false,
        logarithmicDepthBuffer: false,
      });
    } catch (primaryErr) {
      console.warn('Primary WebGLRenderer init failed, trying safe fallback:', primaryErr);
      try {
        // Stage 2: Fallback with low power / relaxed constraints
        this.renderer = new THREE.WebGLRenderer({
          antialias: false,
          powerPreference: 'default',
          failIfMajorPerformanceCaveat: false,
          alpha: false,
          depth: true,
          stencil: false,
        });
      } catch (fallbackErr) {
        console.error('All WebGL context attempts failed:', fallbackErr);
        this.webGlFailed = true;
        const msg = fallbackErr instanceof Error ? fallbackErr.message : 'WebGL context could not be created.';
        this.callbacks.onWebGLError?.(msg);
        return;
      }
    }

    if (!this.renderer) {
      this.webGlFailed = true;
      this.callbacks.onWebGLError?.('WebGL renderer unavailable.');
      return;
    }

    // Inspect GPU safely from renderer's context without creating throwaway contexts
    try {
      const gl = this.renderer.getContext();
      if (gl) {
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        const param = ext ? ext.UNMASKED_RENDERER_WEBGL : (gl as unknown as { RENDERER: number }).RENDERER;
        const gpu = String((gl as unknown as { getParameter: (p: number) => unknown }).getParameter?.(param) || '');
        this.isSoftwareGl = /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
      }
    } catch {
      this.isSoftwareGl = false;
    }

    // Register WebGL context loss listeners to prevent permanent browser abort
    const canvas = this.renderer.domElement;
    this.handleContextLost = (e: Event) => {
      e.preventDefault(); // REQUIRED: stops browser from permanently invalidating the context
      console.warn('GameEngine: WebGL context lost.');
      this.callbacks.onWebGLError?.('WebGL graphics context was temporarily lost. Attempting to restore...');
    };
    this.handleContextRestored = () => {
      console.info('GameEngine: WebGL context restored.');
    };
    canvas.addEventListener('webglcontextlost', this.handleContextLost, false);
    canvas.addEventListener('webglcontextrestored', this.handleContextRestored, false);

    const width = Math.max(1, this.container.clientWidth || window.innerWidth || 800);
    const height = Math.max(1, this.container.clientHeight || window.innerHeight || 600);
    this.renderer.setSize(width, height);
    // Allow up to 2x pixel ratio for crisp rendering on high-DPI, but cap for performance
    this.renderer.setPixelRatio(this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05; // Slightly reduced for better highlight retention
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFShadowMap; // PCFSoftShadowMap deprecated/removed in r160+
    this.renderer.shadowMap.autoUpdate = true;

    // Make canvas focusable so pointer lock can be requested reliably (trackpad/laptop)
    canvas.tabIndex = 0;
    canvas.style.outline = 'none';

    this.container.appendChild(this.renderer.domElement);
  }

  public applyGraphicsPreset(preset: 'auto' | 'high' | 'low'): void {
    let tier: 'high' | 'low' = 'high';
    if (this.isSoftwareGl) {
      tier = 'low';
    } else if (preset === 'low') {
      tier = 'low';
    } else if (preset === 'auto') {
      const dm = (navigator as unknown as { deviceMemory?: number }).deviceMemory ?? 8;
      const hc = navigator.hardwareConcurrency ?? 8;
      tier = dm < 4 || hc <= 4 ? 'low' : 'high';
    }
    if (tier === 'low') {
      this.renderer?.setPixelRatio(1);
      if (this.renderer) this.renderer.shadowMap.enabled = false;
    } else {
      this.renderer?.setPixelRatio(this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2));
      if (this.renderer) this.renderer.shadowMap.enabled = true;
    }
    this.graphicsTierApplied = tier;
    if (this.sunLight) this.sunLight.castShadow = this.graphicsTierApplied === 'high' && !this.isSoftwareGl;
  }

  private initScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x7ec8e3); // Tropical bright Caribbean sky
    this.scene.fog = new THREE.FogExp2(0x8bc3d6, 0.0035);

    this.camera = new THREE.PerspectiveCamera(
      this.settings.fov,
      this.container.clientWidth / this.container.clientHeight,
      0.15,
      450
    );
    this.camera.rotation.order = 'YXZ';

    // Studio Environment map
    const pmrem = new THREE.PMREMGenerator(this.renderer!);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    // Balanced Lighting Rig
    const sunLight = new THREE.DirectionalLight(0xfffaed, 2.2);
    this.sunLight = sunLight;
    sunLight.position.set(45, 60, -35);
    sunLight.castShadow = !this.isSoftwareGl && this.graphicsTierApplied === 'high';
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    sunLight.shadow.bias = -0.00005;
    sunLight.shadow.normalBias = 0.03;
    sunLight.shadow.camera.left = -80;
    sunLight.shadow.camera.right = 80;
    sunLight.shadow.camera.top = 80;
    sunLight.shadow.camera.bottom = -80;
    sunLight.shadow.camera.near = 0.5;
    sunLight.shadow.camera.far = 200;
    this.scene.add(sunLight);

    const hemiLight = new THREE.HemisphereLight(0xbbeeff, 0x334455, 1.0);
    this.scene.add(hemiLight);

    // Build Hijacked Yacht Map
    this.mapData = buildHijackedMap();
    this.scene.add(this.mapData.sceneGroup);

    // Attach gun rig camera container
    this.camera.add(this.gunCameraRig);
    this.scene.add(this.camera);

    // Pre-allocate tracer and particle pools
    this.effects = new EffectsPool(this.scene, () => this.graphicsTierApplied);
  }

  public setWeapon(weapon: WeaponDef) {
    this.activeWeapon = weapon;
    this.ammo = weapon.magSize;
    this.reserveAmmo = weapon.reserveAmmo;
    this.isReloading = false;
    this.reloadTimer = 0;

    // Remove old gun model
    if (this.gunRig) {
      this.gunCameraRig.remove(this.gunRig.group);
    }

    // Build new 3D model
    this.gunRig = buildGunModel(weapon);
    this.gunCameraRig.add(this.gunRig.group);

    // Initial position
    this.gunRig.group.position.set(0.24, -0.22, -0.42);
    this.gunRig.group.rotation.set(0, 0, 0);

    this.notifyStats(true);
  }

  private spawnBots(difficulty: BotDifficulty = 'regular') {
    const personalities: BotPersonality[] = [
      'assault',
      'flanker',
      'sniper',
      'defender',
      'support',
      'balanced',
    ];

    personalities.forEach((pers, idx) => {
      const spawnPos = this.mapData.spawnPoints[(idx + 1) % this.mapData.spawnPoints.length];
      const bot = createBot(`bot_${idx}`, idx, pers, difficulty, spawnPos, this.mapData.waypoints);
      this.bots.push(bot);
      this.scene.add(bot.mesh);
    });
  }

  private initInputListeners() {
    const onKeyDown = (e: KeyboardEvent) => {
      this.keysHeld.add(e.code);

      // Edge triggers
      if (shouldQueueJump(e) && !this.isPlayerDead) {
        this.physics.queueJump(0.14); // coyote/jump buffering
      }
      if (e.code === 'KeyR' && !this.isPlayerDead && !this.isReloading && this.ammo < this.activeWeapon.magSize && this.reserveAmmo > 0) {
        this.startReload();
      }
      if (e.code === 'KeyM') {
        sound.toggleMute();
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      this.keysHeld.delete(e.code);
    };

    const onMouseDown = (e: MouseEvent) => {
      if (this.isTitleScreen) return;
      if (this.isPlayerDead) return;

      // Pointer lock is toggled exclusively with the F key — clicks while unlocked do nothing
      if (!this.isPointerLocked) {
        return;
      }

      this.mouseButtonsHeld.add(e.button);
      if (e.button === 2) {
        this.isAds = true;
      }
      if (e.button === 0) {
        this.tryFireWeapon();
      }
    };

    const onMouseUp = (e: MouseEvent) => {
      this.mouseButtonsHeld.delete(e.button);
      if (e.button === 2) {
        this.isAds = false;
      }
    };

    const onMouseMove = (e: MouseEvent) => {
      if (this.isTitleScreen) return;
      if (!this.isPointerLocked) {
        return;
      }
      const sens = (this.settings.mouseSensitivity * 0.002) * (this.isAds ? 0.65 : 1.0);
      this.yaw -= e.movementX * sens;
      this.pitch -= e.movementY * sens;
      // Clamp pitch to prevent somersaults
      this.pitch = Math.max(-Math.PI / 2.05, Math.min(Math.PI / 2.05, this.pitch));
    };

    const onBlur = () => {
      this.keysHeld.clear();
      this.mouseButtonsHeld.clear();
      this.isAds = false;
    };

    const onResize = () => {
      if (!this.container || !this.renderer || !this.camera) return;
      const width = Math.max(1, this.container.clientWidth);
      const height = Math.max(1, this.container.clientHeight);
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(width, height);
    };

    const onContextMenu = (e: MouseEvent) => e.preventDefault();

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('blur', onBlur);
    window.addEventListener('resize', onResize);
    window.addEventListener('contextmenu', onContextMenu);

    // Pointer lock (including focus re-lock and browser cooldown) lives in its own module.
    this.pointerLock = new PointerLockController({
      isEnabled: () => !this.isTitleScreen && !!this.renderer,
      onChange: (locked) => {
        if (!locked) this.mouseButtonsHeld.clear();
        this.callbacks.onPointerLockChange?.(locked);
      },
    });
    this.pointerLock.attach();

    this.cleanupListeners = () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('contextmenu', onContextMenu);
    };
  }

  public requestPointerLock(isDirectUserGesture = false) {
    this.pointerLock?.request(isDirectUserGesture);
  }

  public exitPointerLock() {
    this.pointerLock?.exit();
  }

  public startMatch(config?: MatchConfig) {
    this.applyGraphicsPreset(this.settings.graphicsPreset);
    this.isTitleScreen = false;
    document.body.dataset.state = 'playing';
    this.physics.pos.set(0, 0.1, -45);
    this.physics.vel.set(0, 0, 0);
    this.physics.isSliding = false;
    this.physics.isGrounded = true;
    this.yaw = Math.PI; // Face down yacht towards center
    this.pitch = 0;
    this.hp = 100;
    this.isPlayerDead = false;
    this.playerRespawnTimer = 0;
    this.healthRegen.reset();
    this.score = 0;
    this.kills = 0;
    this.deaths = 0;
    this.streak = 0;
    this.highestStreak = 0;
    this.shotsFired = 0;
    this.shotsHit = 0;

    if (config) {
      this.scoreLimit = config.scoreLimit;
      this.matchTimeRemaining = config.timeLimitMinutes > 0 ? config.timeLimitMinutes * 60 : Infinity;

      // Respawn custom bot roster matching setup
      for (const b of this.bots) {
        this.scene.remove(b.mesh);
      }
      this.bots = [];

      const personalities: BotPersonality[] = [
        'assault',
        'flanker',
        'sniper',
        'defender',
        'support',
        'balanced',
      ];
      const botCount = Math.max(1, Math.min(10, config.botCount || 6));
      const difficulty: BotDifficulty = config.botDifficulty || 'regular';

      for (let idx = 0; idx < botCount; idx++) {
        let pers = personalities[idx % personalities.length];
        if (config.allowedCategories && config.allowedCategories.length > 0) {
          if (!config.allowedCategories.includes('AR') && (pers === 'defender' || pers === 'balanced')) pers = 'assault';
          if (!config.allowedCategories.includes('SMG') && pers === 'assault') pers = 'balanced';
          if (!config.allowedCategories.includes('Shotgun') && pers === 'flanker') pers = 'assault';
          if (!config.allowedCategories.includes('Sniper') && pers === 'sniper') pers = 'balanced';
        }
        const spawnPos = this.mapData.spawnPoints[(idx + 1) % this.mapData.spawnPoints.length];
        const bot = createBot(`bot_${idx}`, idx, pers, difficulty, spawnPos, this.mapData.waypoints);
        if (config.allowedCategories && config.allowedCategories.length > 0 && !config.allowedCategories.includes(bot.weapon.category)) {
          const allowedGuns = RUSH_WEAPONS.filter((w) => config.allowedCategories.includes(w.category));
          if (allowedGuns.length > 0) {
            bot.weapon = allowedGuns[idx % allowedGuns.length];
          }
        }
        this.bots.push(bot);
        this.scene.add(bot.mesh);
      }
    } else {
      this.scoreLimit = 25;
      this.matchTimeRemaining = 300;
    }

    this.requestPointerLock(true);
    this.notifyStats(true);
    this.callbacks.onFpsSample?.(null);
    this.pendingHits = [];
  }

  private startReload() {
    if (this.isPlayerDead) return;
    this.isReloading = true;
    this.reloadTimer = this.activeWeapon.reloadTimeSec;
    sound.playReload(this.activeWeapon.reloadTimeSec);
  }

  private tryFireWeapon() {
    if (this.isPlayerDead || this.isReloading || this.fireTimer > 0) return;

    if (this.ammo <= 0) {
      sound.playMechanicalClick(800, 0.05);
      if (this.reserveAmmo > 0) {
        this.startReload();
      }
      return;
    }

    this.ammo--;
    this.shotsFired++;
    const fireInterval = 60 / this.activeWeapon.fireRateRpm;
    this.fireTimer = fireInterval;

    // Recoil kick (realistic recoil based on movement and stance)
    const recoilMultiplier = this.physics.isSliding ? 1.3 : 1.0;
    const moveRecoil = this.physics.vel.length() * 0.002; // movement-based recoil scaled to weapon class (≈0.024 at full sprint, not 1.2)

    // Aim first, then kick: the round follows the reticle the player saw, and
    // only the next shot inherits the recoil.
    const shotAim = resolveShotAim(
      this.pitch,
      this.yaw,
      this.recoilPitch,
      this.recoilYaw,
      (this.activeWeapon.recoilVertical + moveRecoil) * recoilMultiplier,
      this.activeWeapon.recoilHorizontal * recoilMultiplier
    );
    this.recoilPitch = shotAim.recoilPitch;
    this.recoilYaw = shotAim.recoilYaw;

    // Audio
    sound.playGunshot(this.activeWeapon.soundType);

    // Muzzle Flash
    this.flashTimer = 0.05;
    if (this.gunRig) {
      (this.gunRig.muzzleFlash.material as THREE.MeshBasicMaterial).opacity = 1.0;
      this.gunRig.muzzleFlash.rotation.z = Math.random() * Math.PI * 2;
    }

    // Bullet Spreads & Raycasting — each trigger pull registers at most ONCE per spray; pellet count applied once.
    const spread = computeShotSpread(
      this.activeWeapon,
      this.isAds,
      this.physics.vel.length(),
      this.physics.isSliding
    );
    const shotContext = { registered: false, tracerSpawned: false };
    this.shootPellet(shotAim.dir, spread, shotContext);

    this.notifyStats(true);
  }

  private shootPellet(baseAim: THREE.Vector3, spreadRad: number, ctx: { registered: boolean; tracerSpawned: boolean }) {
    // Direction was resolved from the pre-recoil view angles in tryFireWeapon.
    const aimDir = baseAim.clone();

    // Movement / stance spread is already folded into `spreadRad` by computeShotSpread.
    applySpread(aimDir, spreadRad);

    const rayOrigin = this.camera.position.clone();

    // Sniper rounds have no range ceiling; other guns stop at the map clip.
    const range = this.activeWeapon.category === 'Sniper' ? Infinity : RAY_FAR;

    // Padded, rotation-agnostic AABB hit test.
    const closestHitBot = findClosestBotHit(rayOrigin, aimDir, this.bots, range);

    // Cover: walls and glass stop the round before it reaches the bot.
    const coverDist = findClosestBoxHit(rayOrigin, aimDir, this.mapData.bulletBlockers, range);
    const blocked = isBlockedByCover(coverDist, closestHitBot ? closestHitBot.dist : Infinity);

    // One tracer per trigger pull — never spawn parallel pellets visually
    const muzzleWorld = new THREE.Vector3();
    if (this.gunRig) {
      this.gunRig.muzzleFlash.getWorldPosition(muzzleWorld);
    } else {
      muzzleWorld.copy(rayOrigin);
    }

    const hitPoint = blocked
      ? rayOrigin.clone().addScaledVector(aimDir, coverDist!)
      : closestHitBot
        ? closestHitBot.point
        : rayOrigin.clone().addScaledVector(aimDir, 100);
    if (!ctx.tracerSpawned) {
      this.effects.spawnTracer(muzzleWorld, hitPoint, this.activeWeapon.bulletSpeed);
      ctx.tracerSpawned = true;
    }

    // A shot registers at most once; impact queued as a projectile with travel time.
    if (!blocked && closestHitBot && !ctx.registered) {
      const { bot, isHead, point, dist } = closestHitBot;
      const damage = calculateShotTotalDamage(this.activeWeapon, isHead, dist);

      // Shotgun pellets beyond the cutoff are treated as a miss: no hitmarker,
      // no damage, no kill credit. The tracer still shows where the shot landed.
      if (damage > 0) {
        ctx.registered = true;
        const travelDelay = dist / this.activeWeapon.bulletSpeed;
        const pendingHit: PendingHit = { bot, isHead, damage, point, dist, delay: Math.max(travelDelay, 0.05) };
        // Execute immediately for instantaneous projectile (named for clarity) but keep queue for consistency
        this.pendingHits.push(pendingHit);
      }
    }

    if ((blocked || !closestHitBot) && !ctx.registered) {
      // Cover / wall impact spark — one per trigger pull, no damage or hitmarker.
      this.effects.spawnParticles(hitPoint, 6, 0xffe680);
      ctx.registered = true; // consumed spark budget for this shot
    }
  }

  private applyPlayerHit(pending: PendingHit) {
    const { bot, isHead, point, dist } = pending;
    const damage = pending.damage;
    const isKill = triggerBotHit(bot, damage, isHead);

    // HP/ammo/kills can change; user should see those instantly
    this.shotsHit++;
    this.notifyStats(true);

    sound.playHitmarker(isHead, isKill);
    this.callbacks.onHitmarker({
      time: Date.now(),
      isHeadshot: isHead,
      isKill,
      damage,
    });

    const screenPos = point.clone().project(this.camera);
    const screenX = ((screenPos.x + 1) * 0.5) * window.innerWidth;
    const screenY = ((-screenPos.y + 1) * 0.5) * window.innerHeight;
    this.callbacks.onFloatingDamage({
      id: `dmg_${Date.now()}_${Math.random()}`,
      damage,
      isHeadshot: isHead,
      x: point.x,
      y: point.y,
      z: point.z,
      screenX,
      screenY,
      opacity: 1,
    });

    this.effects.spawnParticles(point, 12, isHead ? 0xff3333 : 0xffaa00);

    if (isKill) {
      this.kills++;
      this.streak++;
      if (this.streak > this.highestStreak) this.highestStreak = this.streak;
      if (isHead) this.headshots++;

      this.callbacks.onKillfeed({
        id: `kf_${Date.now()}`,
        killer: 'You',
        victim: bot.name,
        weapon: this.activeWeapon.name,
        isHeadshot: isHead,
        isPlayerKiller: true,
        isPlayerVictim: false,
        timestamp: Date.now(),
      });

      const scoreRes = evaluateKillScore({
        isHeadshot: isHead,
        distance: dist,
        currentStreak: this.streak - 1,
        isSliding: this.physics.isSliding,
      });

      this.score += scoreRes.addedScore;
      scoreRes.banners.forEach((b) => this.callbacks.onStreakBanner(b));

      if (this.streak >= 3) sound.playStreakFanfare();

      const matchState = checkMatchEnd({
        playerScore: this.kills,
        scoreLimit: this.scoreLimit,
        timeRemainingSec: this.matchTimeRemaining,
      });
      if (matchState.isOver && matchState.winner) {
        this.callbacks.onMatchEnd(matchState.winner);
      }
    }
  }

  private onBotFire(bot: BotState, aimDir: THREE.Vector3, targetId: string) {
    const muzzlePos = bot.pos.clone().add(new THREE.Vector3(0, 1.2, 0));

    // Audio sound for bot gunshot if within reasonable auditory distance
    const distToPlayer = bot.pos.distanceTo(this.physics.pos);
    if (distToPlayer < 75) {
      sound.playGunshot(bot.weapon.soundType);
    }

    if (targetId === 'player') {
      if (this.isPlayerDead) return;

      const toPlayer = new THREE.Vector3().subVectors(this.physics.pos, bot.pos);
      const dist = toPlayer.length();
      toPlayer.normalize();

      // Cover blocks bot fire too: stop the tracer and deal no damage.
      const coverDist = findClosestBoxHit(muzzlePos, toPlayer, this.mapData.bulletBlockers, dist + 1);
      const blocked = isBlockedByCover(coverDist, dist);

      const hitPos = blocked
        ? muzzlePos.clone().addScaledVector(toPlayer, coverDist!)
        : this.physics.pos.clone().add(new THREE.Vector3(0, 0.9, 0));
      this.effects.spawnTracer(muzzlePos, hitPos, this.activeWeapon.bulletSpeed);

      // Hit chance evaluated via alignment & distance
      if (!blocked && dist < 55 && aimDir.dot(toPlayer) > 0.94) {
        // Player takes realistic damage
        const damage = Math.round(bot.weapon.damage * (0.6 + Math.random() * 0.4));
        this.hp -= damage;
        this.healthRegen.onDamage();
        sound.playHurt();

        if (this.hp <= 0) {
          this.killPlayer(bot.name, bot.weapon.name, false);
        } else {
          this.notifyStats(true);
        }
      }
    } else {
      // Bot firing at another bot (FFA Bot-vs-Bot action!)
      const targetBot = this.bots.find((b) => b.id === targetId && !b.isDead);
      if (targetBot) {
        const toTarget = new THREE.Vector3().subVectors(targetBot.pos, bot.pos);
        const dist = toTarget.length();
        toTarget.normalize();

        const coverDist = findClosestBoxHit(muzzlePos, toTarget, this.mapData.bulletBlockers, dist + 1);
        const blocked = isBlockedByCover(coverDist, dist);

        const hitPos = blocked
          ? muzzlePos.clone().addScaledVector(toTarget, coverDist!)
          : targetBot.pos.clone().add(new THREE.Vector3(0, 1.1, 0));
        this.effects.spawnTracer(muzzlePos, hitPos, this.activeWeapon.bulletSpeed);

        if (!blocked && dist < 50 && aimDir.dot(toTarget) > 0.92) {
          const damage = Math.round(bot.weapon.damage * (0.65 + Math.random() * 0.35));
          const isKilled = triggerBotHit(targetBot, damage, false, bot.id);
          if (isKilled) {
            bot.kills++;
            bot.score += 100;

            this.callbacks.onKillfeed({
              id: `kf_${Date.now()}_${Math.random()}`,
              killer: bot.name,
              victim: targetBot.name,
              weapon: bot.weapon.name,
              isHeadshot: false,
              isPlayerKiller: false,
              isPlayerVictim: false,
              timestamp: Date.now(),
            });
          }
        }
      }
    }
  }

  private killPlayer(killer: string, weaponName: string, isHeadshot: boolean) {
    this.deaths++;
    this.streak = 0;
    this.hp = 0;
    this.isPlayerDead = true;
    this.playerRespawnTimer = PLAYER_RESPAWN_SECONDS;

    // Freeze combat state while dead. Look-around stays enabled.
    this.isAds = false;
    this.adsWeight = 0;
    this.isReloading = false;
    this.reloadTimer = 0;
    this.mouseButtonsHeld.clear();
    this.keysHeld.clear();
    this.physics.vel.set(0, 0, 0);
    this.physics.isSliding = false;

    this.callbacks.onKillfeed({
      id: `kf_${Date.now()}_${Math.random()}`,
      killer,
      victim: 'You',
      weapon: weaponName,
      isHeadshot,
      isPlayerKiller: false,
      isPlayerVictim: true,
      timestamp: Date.now(),
    });

    this.notifyStats(true);
  }

  private tickPlayerRespawn(dt: number) {
    this.playerRespawnTimer -= dt;
    if (this.playerRespawnTimer <= 0) {
      this.respawnPlayer();
    }
  }

  private respawnPlayer() {
    const threats = this.bots.filter((b) => !b.isDead).map((b) => ({ pos: b.pos }));
    const spawn = pickSafestSpawn(this.mapData.spawnPoints, threats) ?? this.mapData.spawnPoints[0];
    if (spawn) this.physics.reset(spawn);

    this.hp = this.maxHp;
    this.isPlayerDead = false;
    this.playerRespawnTimer = 0;
    this.healthRegen.reset();
    this.isAds = false;
    this.adsWeight = 0;
    this.fireTimer = 0;

    const loadout = respawnLoadout(this.activeWeapon.magSize);
    this.ammo = loadout.ammo;
    this.isReloading = loadout.isReloading;
    this.reloadTimer = loadout.reloadTimer;

    this.physics.isGrounded = true;
    this.physics.isSliding = false;
    this.keysHeld.clear();
    this.mouseButtonsHeld.clear();
    this.notifyStats(true);
  }

  private updateHealthRegen(dt: number) {
    this.hp = this.healthRegen.tick(dt, this.hp, this.maxHp);
  }

  private updatePlayerPhysics(dt: number) {
    // Continuous fire for automatic weapons
    if (this.mouseButtonsHeld.has(0) && (this.activeWeapon.category === 'AR' || this.activeWeapon.category === 'SMG')) {

      this.tryFireWeapon();
    }

    // Cooldown timers
    if (this.fireTimer > 0) this.fireTimer -= dt;

    if (this.isReloading) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) {
        this.isReloading = false;
        const needed = this.activeWeapon.magSize - this.ammo;
        const reloadAmount = Math.min(needed, this.reserveAmmo);
        this.ammo += reloadAmount;
        this.reserveAmmo -= reloadAmount;
        this.notifyStats(true);
      }
    }

    this.physics.update(
      dt,
      {
        keys: this.keysHeld,
        yaw: this.yaw,
        isAds: this.isAds,
        colliders: this.mapData.colliders,
      },
      {
        onJump: () => sound.playJump(),
        onSlide: () => sound.playSlide(),
        onFootstep: () => sound.playFootstep(),
        onOceanFall: () => {
          this.hp -= 35;
          this.healthRegen.onDamage();
          sound.playHurt();
          if (this.hp <= 0) this.killPlayer('The ocean', 'Fall', false);
        },
      }
    );
  }

  private updateCameraAndWeapon(dt: number) {
    // Recoil recovery
    this.recoilPitch = THREE.MathUtils.damp(this.recoilPitch, 0, this.activeWeapon.recoilRecoverySpeed, dt);
    this.recoilYaw = THREE.MathUtils.damp(this.recoilYaw, 0, this.activeWeapon.recoilRecoverySpeed, dt);

    // Camera height with smooth damping for sliding/standing transitions
    const targetCamHeight = this.physics.isSliding ? 0.85 : 1.7;
    this.currentCamHeight = THREE.MathUtils.damp(this.currentCamHeight, targetCamHeight, 18.0, dt);
    const currentCamY = this.physics.pos.y + this.currentCamHeight;

    this.camera.position.set(this.physics.pos.x, currentCamY, this.physics.pos.z);
    this.camera.rotation.set(this.pitch + this.recoilPitch, this.yaw + this.recoilYaw, 0, 'YXZ');

    // Smooth ADS zoom FOV
    const targetFov = this.isAds ? this.activeWeapon.adsZoomFov : this.settings.fov;
    this.camera.fov = THREE.MathUtils.damp(this.camera.fov, targetFov, 14.0, dt);
    this.camera.updateProjectionMatrix();

    // Gun Model Position (Hip vs ADS alignment)
    this.adsWeight = THREE.MathUtils.damp(this.adsWeight, this.isAds ? 1.0 : 0.0, 16.0, dt);

    if (this.gunRig) {
      // Weapon Bobbing
      const hSpeed = Math.sqrt(this.physics.vel.x * this.physics.vel.x + this.physics.vel.z * this.physics.vel.z);
      const bobX = Math.cos(this.physics.gunBobTime) * 0.015 * (1 - this.adsWeight);
      const bobY = Math.sin(this.physics.gunBobTime * 2) * 0.012 * (1 - this.adsWeight);

      // Hip position: slightly to right & lower
      const hipPos = new THREE.Vector3(0.22 + bobX, -0.22 + bobY, -0.42);
      // ADS position: straight center
      const adsPos = new THREE.Vector3(0.0, -0.15, -0.32);

      this.gunRig.group.position.lerpVectors(hipPos, adsPos, this.adsWeight);

      // Recoil kick on model
      this.gunRig.group.position.z += this.recoilPitch * 0.4;
      this.gunRig.group.rotation.x = this.recoilPitch * 0.7;

      // Muzzle flash decay
      if (this.flashTimer > 0) {
        this.flashTimer -= dt;
        if (this.flashTimer <= 0) {
          (this.gunRig.muzzleFlash.material as THREE.MeshBasicMaterial).opacity = 0;
        }
      }
    }
  }

  private updatePendingHits(dt: number) {
    drainPendingHits(this.pendingHits, dt, (hit) => this.applyPlayerHit(hit));
  }

  private notifyStats(force: boolean = false) {
    const hSpeed = Math.sqrt(this.physics.vel.x * this.physics.vel.x + this.physics.vel.z * this.physics.vel.z);
    const reloadProgress = this.isReloading ? Math.max(0, 1 - this.reloadTimer / this.activeWeapon.reloadTimeSec) : 1;
    const payload: PlayerStats = {
      hp: Math.max(0, this.hp),
      maxHp: this.maxHp,
      ammo: this.ammo,
      reserveAmmo: this.reserveAmmo,
      isReloading: this.isReloading,
      reloadProgress: Math.round(reloadProgress * 100) / 100,
      isAds: this.isAds,
      score: this.score,
      kills: this.kills,
      deaths: this.deaths,
      streak: this.streak,
      highestStreak: this.highestStreak,
      headshots: this.headshots,
      shotsFired: this.shotsFired,
      shotsHit: this.shotsHit,
      speed: Math.round(hSpeed),
      isSliding: this.physics.isSliding,
      isGrounded: this.physics.isGrounded,
      respawnTimeRemaining: this.isPlayerDead ? Math.max(0, this.playerRespawnTimer) : 0,
    };
    if (!force && !statsChanged(this.lastStatsPayload, payload)) return;
    this.lastStatsPayload = payload;
    this.callbacks.onStatsUpdate(payload);
  }

  private notifyMinimap(due: boolean) {
    // throttle: at most one emission every >= 0.1s
    if (!due) return;
    const x = this.physics.pos.x, z = this.physics.pos.z, angle = this.yaw;
    if (!minimapChanged(this.lastMinimapSample, x, z, angle)) return;
    const bots = this.bots.map((b) => ({ id: b.id, x: b.pos.x, z: b.pos.z, isDead: b.isDead }));
    this.lastMinimapSample = { x, z, angle };
    this.matchLoop.markMinimapSent();
    this.callbacks.onMinimapUpdate(
      { x, z, angle },
      bots
    );
  }

  private startLoop() {
    let lastTime = performance.now();

    const afterDraw = (cb: () => void) => {
      if (!this.isRunning || !this.renderer) return;
      try {
        const gl = this.renderer.getContext() as WebGL2RenderingContext;
        if (gl && typeof gl.fenceSync === 'function') {
          const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
          gl.flush();
          const poll = () => {
            if (!this.isRunning || !this.renderer) return;
            try {
              const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
              if (state === gl.UNSIGNALED) {
                this.frameId = window.setTimeout(poll, 5);
              } else {
                if (sync) gl.deleteSync(sync);
                this.frameId = window.setTimeout(cb, 60);
              }
            } catch {
              this.frameId = window.setTimeout(cb, 60);
            }
          };
          this.frameId = window.setTimeout(poll, 5);
          return;
        }
      } catch {
        // Fallback to normal requestAnimationFrame
      }
      this.frameId = requestAnimationFrame(cb);
    };

    const tick = () => {
      if (!this.isRunning || !this.renderer || !this.scene || !this.camera) return;

      const now = performance.now();
      const rawDt = (now - lastTime) / 1000;
      lastTime = now;
      const dt = Math.min(rawDt, 0.05);

      if (this.isRunning) {
        const timeSec = now / 1000;
        this.mapData.update(timeSec, dt);

        if (this.isTitleScreen) {
          // Scenic Orbit Camera around Hijacked Yacht
          const camR = 52;
          const camY = 16 + Math.sin(timeSec * 0.4) * 4;
          const camAngle = timeSec * 0.22;
          this.camera.position.set(Math.cos(camAngle) * camR, camY, Math.sin(camAngle) * camR);
          this.camera.lookAt(0, 4, 0);
          if (this.gunRig) this.gunRig.group.visible = false;
        } else {
          // Active Match Loop
          if (this.gunRig) this.gunRig.group.visible = !this.isPlayerDead;
          if (this.isPlayerDead) {
            this.tickPlayerRespawn(dt);
          } else {
            this.updatePlayerPhysics(dt);
            this.updateHealthRegen(dt);
          }
          this.updateCameraAndWeapon(dt);
          this.effects.update(dt);
          this.updatePendingHits(dt);

          // Update Bots AI with Perception, LOS colliders, and Bot vs Bot targets
          const potentialTargets = [
            { id: 'player', isPlayer: true, pos: this.physics.pos, hp: this.hp },
            ...this.bots.filter((b) => !b.isDead).map((b) => ({ id: b.id, isPlayer: false, pos: b.pos, hp: b.hp })),
          ];

          for (const bot of this.bots) {
            updateBotAI(
              bot,
              dt,
              timeSec,
              potentialTargets,
              this.mapData.waypoints,
              this.mapData.colliders,
              (b, aimDir, targetId) => {
                this.onBotFire(b, aimDir, targetId);
              },
              this.mapData.bulletBlockers
            );
          }

          // Match Timer countdown
          const winner = this.matchLoop.advance(dt, this.kills, this.scoreLimit);
          if (winner) {
            this.callbacks.onMatchEnd(winner);
          }

          // Throttled HUD update
          const hud = this.matchLoop.hudDue(dt);
          if (hud.statsDue) {
            this.notifyStats(true);
            this.matchLoop.markStatsSent();
          }
          this.notifyMinimap(hud.minimapDue);
        }
      }

      try {
        this.renderer.render(this.scene, this.camera);
      } catch (renderErr) {
        console.warn('Render exception caught:', renderErr);
      }

      const fpsSample = this.matchLoop.sampleFps(
        dt,
        this.settings.showFps,
        (this.renderer as any)?.info?.render?.calls ?? 0
      );
      if (fpsSample) {
        this.callbacks.onFpsSample?.(fpsSample);
      }

      if (this.isSoftwareGl) {
        afterDraw(tick);
      } else {
        this.frameId = requestAnimationFrame(tick);
      }
    };

    tick();
  }

  public destroy() {
    this.isRunning = false;
    if (this.frameId) {
      cancelAnimationFrame(this.frameId);
      clearTimeout(this.frameId);
    }
    if (this.pointerLock) {
      this.pointerLock.dispose();
      this.pointerLock = null;
    }
    if (this.cleanupListeners) {
      this.cleanupListeners();
      this.cleanupListeners = null;
    }
    if (this.renderer) {
      try {
        if (this.renderer.domElement) {
          if (this.handleContextLost) {
            this.renderer.domElement.removeEventListener('webglcontextlost', this.handleContextLost);
          }
          if (this.handleContextRestored) {
            this.renderer.domElement.removeEventListener('webglcontextrestored', this.handleContextRestored);
          }
          if (this.renderer.domElement.parentNode) {
            this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
          }
        }
        this.renderer.dispose();
      } catch (err) {
        console.warn('Error during renderer disposal:', err);
      }
      this.renderer = null;
    }
  }
}
