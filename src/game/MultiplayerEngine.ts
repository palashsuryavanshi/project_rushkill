import { NetworkManager } from './NetworkManager';
import { 
  InputMessage, 
  StateMessage, 
  NetworkEntity,
  JoinedMessage,
  LeftMessage,
  HostMigratedMessage
} from './NetworkTypes';

// Player interface for internal representation
export interface Player {
  id: string;
  name: string;
  pos: [number, number, number];
  rot: [number, number, number]; // [pitch, yaw, roll]
  hp: number;
  weapon: string;
  isHost: boolean;
  
  // For client-side interpolation
  interpolationBuffer?: Array<{
    tick: number;
    pos: [number, number, number];
    rot: [number, number, number];
    timestamp: number;
  }>;
  
  // Current interpolated position (client only)
  currentPos?: [number, number, number];
  currentRot?: [number, number, number];
}

// Game engine interface for integration
export interface GameEngine {
  update: (delta: number) => void;
  getPlayerState?: () => {
    pos: [number, number, number];
    rot: [number, number, number];
    hp: number;
    weapon: string;
  };
  spawnRemotePlayer?: (id: string, name: string, pos: [number, number, number]) => void;
  updateRemotePlayer?: (id: string, pos: [number, number, number], rot: [number, number]) => void;
  removeRemotePlayer?: (id: string) => void;
}

export class MultiplayerEngine {
  private networkManager: NetworkManager | null = null;
  private gameEngine: GameEngine | null = null;
  
  // Multiplayer state
  public isMultiplayer: boolean = false;
  public isHost: boolean = false;
  public room: string = '';
  public players: Map<string, Player> = new Map();
  public latestState: StateMessage | null = null;
  
  // Host state
  private broadcastTimer: number = 0;
  private broadcastInterval: number = 1/30; // 30Hz
  
  // Client interpolation
  private interpolationBufferTime: number = 0.1; // 100ms
  private lastServerTick: number = 0;
  
  // Input sequence counter
  private inputSeq: number = 0;
  
  // Event handlers
  private onPlayerJoin?: (player: Player) => void;
  private onPlayerLeave?: (playerId: string) => void;
  private onHostMigrated?: (newHostId: string) => void;
  
  constructor() {
    // Set up network manager event handlers
    this.setupNetworkHandlers();
  }
  
  private setupNetworkHandlers(): void {
    // These will be set when network manager is attached
  }
  
  public attachNetworkManager(networkManager: NetworkManager): void {
    this.networkManager = networkManager;
    
    // Set up event handlers (fresh NetworkManager starts with null handlers)
    networkManager.onState = (state: StateMessage) => {
      this.handleStateMessage(state);
    };
    
    networkManager.onPlayerJoin = (joined: JoinedMessage) => {
      this.handlePlayerJoined(joined);
    };
    
    networkManager.onPlayerLeave = (left: LeftMessage) => {
      this.handlePlayerLeft(left);
    };
    
    networkManager.onHostMigrated = (migrated: HostMigratedMessage) => {
      this.handleHostMigrated(migrated);
    };
  }
  
  public attachGameEngine(gameEngine: GameEngine): void {
    this.gameEngine = gameEngine;
  }
  
  public async startMultiplayer(room: string, isHost: boolean, name: string, serverUrl?: string): Promise<void> {
    if (!this.networkManager) {
      throw new Error('NetworkManager not attached');
    }
    
    console.warn("[MP] startMultiplayer", { room, isHost, name, serverUrl, beforePlayers: this.players.size });
    this.room = room;
    this.isHost = isHost;
    this.isMultiplayer = true;

    if (this.gameEngine) {
      (this.gameEngine as any).isMultiplayer = true;
    }
    
    // Connect to the relay server
    await this.networkManager.connect(room, isHost, name, serverUrl);

    console.warn("[MP] connected", { clientId: this.networkManager.clientId, state: this.networkManager.state, playersAfterConnect: this.players.size });
    
    const selfState = this.gameEngine?.getPlayerState?.();
    if (selfState) {
      this.players.set(this.networkManager.clientId!, {
        id: this.networkManager.clientId!,
        name,
        pos: selfState.pos,
        rot: selfState.rot,
        hp: selfState.hp,
        weapon: selfState.weapon,
        isHost
      });
    }
    console.warn("[MP] startMultiplayerdone", { clientId: this.networkManager.clientId, playerCount: this.players.size, names: Array.from(this.players.values()).map(p=>p.name) });
  }
  
  public update(delta: number): void {
    if (!this.isMultiplayer || !this.networkManager) {
      return;
    }
    if (!this.gameEngine || !this.networkManager) {
      return;
    }

    // Every peer broadcasts its OWN player state (relay forwards to others).
    this.broadcastTimer += delta;
    if (this.broadcastTimer >= this.broadcastInterval) {
      this.broadcastTimer = 0;
      this.broadcastSelf(delta);
    }

    // Update local game engine (player controls, etc.)
    this.gameEngine.update(delta);

    // Interpolate (and render) other players' positions
    this.interpolatePlayers(delta);
  }

  /** Each peer sends its own entity at 30Hz. */
  private broadcastSelf(_delta: number): void {
    const state = this.gameEngine?.getPlayerState?.();
    if (!state) return;
    if (!this.networkManager) return;
    const clientId = this.networkManager.clientId;
    if (!clientId) return;
    const message: StateMessage = {
      type: 'state',
      tick: performance.now(),
      entities: [{
        id: clientId,
        x: state.pos[0],
        y: state.pos[1],
        z: state.pos[2],
        yaw: state.rot[1],
        pitch: state.rot[0],
        hp: state.hp
      }]
    };
    const nm = this.networkManager;
    if (!nm) return;
    nm.broadcastState(message);
    this.latestState = message;
  }
  
  private broadcastPlayerState(): void {
    if (!this.networkManager || !this.gameEngine || !this.isHost) {
      return;
    }
    
    const state = this.gameEngine.getPlayerState?.();
    if (!state) {
      return;
    }
    
    // Create network entities from all players
    const entities: NetworkEntity[] = [];
    
    // Add self
    entities.push({
      id: this.networkManager.clientId!,
      x: state.pos[0],
      y: state.pos[1],
      z: state.pos[2],
      yaw: state.rot[1], // yaw is horizontal rotation
      pitch: state.rot[0], // pitch is vertical rotation
      hp: state.hp
    });
    
    // Add other players (simulated by host)
    for (const [id, player] of this.players) {
      if (id !== this.networkManager.clientId!) {
        entities.push({
          id,
          x: player.pos[0],
          y: player.pos[1],
          z: player.pos[2],
          yaw: player.rot[1],
          pitch: player.rot[0],
          hp: player.hp
        });
      }
    }
    
    // Broadcast state
    const stateMessage: StateMessage = {
      type: 'state',
      tick: performance.now(), // Use high-resolution time for tick
      entities
    };
    
    this.networkManager.broadcastState(stateMessage);
    this.latestState = stateMessage;
  }
  
  private interpolatePlayers(delta: number): void {
    if (!this.latestState) {
      return;
    }
    
    const now = performance.now();
    
    // Update interpolation buffer for each entity
    for (const entity of this.latestState.entities) {
      const existingPlayer = this.players.get(entity.id);
      
      if (existingPlayer) {
        // Add to interpolation buffer
        if (!existingPlayer.interpolationBuffer) {
          existingPlayer.interpolationBuffer = [];
        }
        
        existingPlayer.interpolationBuffer.push({
          tick: this.latestState.tick,
          pos: [entity.x, entity.y, entity.z],
          rot: [entity.pitch, entity.yaw, 0],
          timestamp: now
        });
        
        // Remove old entries (older than 100ms)
        existingPlayer.interpolationBuffer = existingPlayer.interpolationBuffer.filter(
          entry => now - entry.timestamp <= this.interpolationBufferTime * 1000
        );
        
        // Interpolate position
        if (existingPlayer.interpolationBuffer.length >= 2) {
          this.interpolatePlayerPosition(existingPlayer);
        }
      }
    }
  }
  
  private interpolatePlayerPosition(player: Player): void {
    if (!player.interpolationBuffer || player.interpolationBuffer.length < 2) {
      return;
    }
    
    const now = performance.now();
    const buffer = player.interpolationBuffer;
    
    // Find two most recent entries
    const latest = buffer[buffer.length - 1];
    const previous = buffer[buffer.length - 2];
    
    // Calculate interpolation factor (0 to 1)
    const timeDiff = latest.timestamp - previous.timestamp;
    const factor = timeDiff > 0 ? Math.min(1, (now - previous.timestamp) / timeDiff) : 1;
    
    // Linear interpolation for position
    const interpolatedPos: [number, number, number] = [
      previous.pos[0] + (latest.pos[0] - previous.pos[0]) * factor,
      previous.pos[1] + (latest.pos[1] - previous.pos[1]) * factor,
      previous.pos[2] + (latest.pos[2] - previous.pos[2]) * factor
    ];
    
    // Linear interpolation for rotation
    const interpolatedRot: [number, number, number] = [
      previous.rot[0] + (latest.rot[0] - previous.rot[0]) * factor,
      previous.rot[1] + (latest.rot[1] - previous.rot[1]) * factor,
      previous.rot[2] + (latest.rot[2] - previous.rot[2]) * factor
    ];
    
    player.currentPos = interpolatedPos;
    player.currentRot = interpolatedRot;
  }
  
  public sendPlayerInput(input: Partial<{
    yaw: number;
    pitch: number;
    keys: Record<string, boolean>;
    fire: boolean;
  }>): void {
    if (!this.isMultiplayer || !this.networkManager || this.isHost) {
      return; // Host doesn't send input, it receives from others
    }
    
    const inputMessage: InputMessage = {
      type: 'input',
      seq: this.inputSeq++,
      yaw: input.yaw || 0,
      pitch: input.pitch || 0,
      keys: input.keys || {},
      fire: input.fire || false
    };
    
    this.networkManager.sendInput(inputMessage);
  }
  
  public receiveState(state: StateMessage): void {
    this.handleStateMessage(state);
  }
  
  private handleStateMessage(state: StateMessage): void {
    this.latestState = state;
    this.lastServerTick = state.tick;
    
    // Update player positions from state
    for (const entity of state.entities) {
      const existingPlayer = this.players.get(entity.id);
      
      if (existingPlayer) {
        // Update player data
        existingPlayer.pos = [entity.x, entity.y, entity.z];
        existingPlayer.rot = [entity.pitch, entity.yaw, 0];
        existingPlayer.hp = entity.hp || existingPlayer.hp;
        if (entity.id !== this.networkManager?.clientId) {
          this.gameEngine?.updateRemotePlayer?.(entity.id, [entity.x, entity.y, entity.z], [entity.pitch, entity.yaw]);
        }
      } else {
        // New player observed via state (fallback if join missed)
        const newPlayer: Player = {
          id: entity.id,
          name: `Player ${entity.id.slice(0, 4)}`,
          pos: [entity.x, entity.y, entity.z],
          rot: [entity.pitch, entity.yaw, 0],
          hp: entity.hp || 100,
          weapon: 'rival_9',
          isHost: entity.id === this.networkManager?.clientId
        };
        this.players.set(entity.id, newPlayer);
        this.gameEngine?.spawnRemotePlayer?.(entity.id, newPlayer.name, [entity.x, entity.y, entity.z]);
      }
    }
  }
  
  private handlePlayerJoined(joined: JoinedMessage): void {
    const selfId = this.networkManager?.clientId;
    if (joined.id === selfId) {
      // Self already tracked; no remote mesh.
      const existingPlayer = this.players.get(joined.id);
      if (!existingPlayer) {
        const newPlayer: Player = {
          id: joined.id,
          name: joined.name,
          pos: [0, 0, 0],
          rot: [0, 0, 0],
          hp: 100,
          weapon: 'rival_9',
          isHost: true
        };
        this.players.set(joined.id, newPlayer);
      }
      this.onPlayerJoin?.(this.players.get(joined.id)!);
      return;
    }

    const newPlayer: Player = {
      id: joined.id,
      name: joined.name,
      pos: [0, 0, 0],
      rot: [0, 0, 0],
      hp: 100,
      weapon: 'rival_9',
      isHost: false
    };

    this.players.set(joined.id, newPlayer);
    this.gameEngine?.spawnRemotePlayer?.(joined.id, joined.name, [0, 0, 0]);
    this.onPlayerJoin?.(newPlayer);
  }
  
  private handlePlayerLeft(left: LeftMessage): void {
    const player = this.players.get(left.id);
    if (player) {
      this.players.delete(left.id);
      if (left.id !== this.networkManager?.clientId) {
        this.gameEngine?.removeRemotePlayer?.(left.id);
      }
      this.onPlayerLeave?.(left.id);
    }
  }
  
  private handleHostMigrated(migrated: HostMigratedMessage): void {
    this.isHost = migrated.newHost === this.networkManager?.clientId;
    
    // Update all players' host status
    for (const [id, player] of this.players) {
      player.isHost = id === migrated.newHost;
    }
    
    this.onHostMigrated?.(migrated.newHost);
  }
  
  public disconnect(): void {
    if (this.networkManager) {
      this.networkManager.disconnect();
    }
    
    this.isMultiplayer = false;
    this.isHost = false;
    this.room = '';
    this.players.clear();
    this.latestState = null;
    this.broadcastTimer = 0;
    this.inputSeq = 0;
    this.lastServerTick = 0;
  }
  
  // Utility methods
  public getPlayers(): Player[] {
    return Array.from(this.players.values());
  }
  
  public getPlayer(id: string): Player | undefined {
    return this.players.get(id);
  }
  
  public isPlayerHost(id: string): boolean {
    const player = this.players.get(id);
    return player?.isHost || false;
  }
  
  // Event subscription methods
  public onPlayerJoinHandler(callback: (player: Player) => void): void {
    this.onPlayerJoin = callback;
  }
  
  public onPlayerLeaveHandler(callback: (playerId: string) => void): void {
    this.onPlayerLeave = callback;
  }
  
  public onHostMigratedHandler(callback: (newHostId: string) => void): void {
    this.onHostMigrated = callback;
  }
}