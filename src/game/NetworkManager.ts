import type {
  JoinMessage,
  InputMessage,
  StateMessage,
  JoinedMessage,
  LeftMessage,
  HostMigratedMessage,
  ErrorMessage,
  ServerMessage,
  Message,
  NetworkEntity,
} from './NetworkTypes';
import {
  isStateMessage,
  isJoinedMessage,
  isLeftMessage,
  isHostMigratedMessage,
  isErrorMessage,
  isInputMessage,
} from './NetworkTypes';

// ===== NetworkManager =====

/** Configuration for reconnection attempts */
const MAX_RECONNECT_ATTEMPTS = 3;
const RECONNECT_BASE_DELAY_MS = 1000; // 1s, 2s, 4s...
const PING_INTERVAL_MS = 10000; // 10 seconds
// Server URL will be set dynamically when connecting

/** Callback type for state updates */
export type StateCallback = (state: StateMessage) => void;
/** Callback type for player join events */
export type PlayerJoinCallback = (joined: JoinedMessage) => void;
/** Callback type for player leave events */
export type PlayerLeaveCallback = (left: LeftMessage) => void;
/** Callback type for error events */
export type ErrorCallback = (error: ErrorMessage) => void;
/** Callback type for host migration events */
export type HostMigratedCallback = (migrated: HostMigratedMessage) => void;

/** Connection state enum */
export enum ConnectionState {
  Disconnected = 'disconnected',
  Connecting = 'connecting',
  Connected = 'connected',
  Reconnecting = 'reconnecting',
}

/**
 * NetworkManager handles WebSocket connection to the relay server,
 * message routing, auto-reconnect, and event callbacks.
 */
export class NetworkManager {
  private ws: WebSocket | null = null;
  private room: string = '';
  private isHostFlag: boolean = false;
  private playerName: string = '';
  private assignedId: string | null = null;
  private connectionState: ConnectionState = ConnectionState.Disconnected;
  private reconnectAttempts: number = 0;
  private messageQueue: string[] = [];
  private pingIntervalId: ReturnType<typeof setInterval> | null = null;
  private pongReceived: boolean = true;
  private latestStateValue: StateMessage | null = null;
  private isReconnecting: boolean = false;
  private connectionTimedOut: boolean = false;
  private isFreshConnect: boolean = true;

  // Event callbacks
  public onState: StateCallback | null = null;
  public onPlayerJoin: PlayerJoinCallback | null = null;
  public onPlayerLeave: PlayerLeaveCallback | null = null;
  public onError: ErrorCallback | null = null;
  public onHostMigrated: HostMigratedCallback | null = null;

  /** Whether the WebSocket is currently connected and ready */
  public get isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN && this.connectionState === ConnectionState.Connected;
  }

  /** Whether this client is the host of the room */
  public get isHost(): boolean {
    return this.isHostFlag;
  }

  /** The room code this client is connected to */
  public get roomCode(): string {
    return this.room;
  }

  /** The latest state message received from the server */
  public get latestState(): StateMessage | null {
    return this.latestStateValue;
  }

  /** The assigned client ID from the server */
  public get clientId(): string | null {
    return this.assignedId;
  }

  /** Current connection state */
  public get state(): ConnectionState {
    return this.connectionState;
  }

  /**
   * Connect to the WebSocket server with the given room code.
   * @param room - Room code to join
   * @param isHost - Whether this client should be the host
   * @param name - Player name (1-32 chars)
   * @param serverUrl - WebSocket server URL (defaults to production relay)
   * @returns Promise that resolves when connection is established and join is confirmed
   */
  public async connect(room: string, isHost: boolean, name: string, serverUrl?: string): Promise<void> {
    if (this.isConnected) {
      await this.disconnect();
    }

    this.room = room;
    this.isHostFlag = isHost;
    this.playerName = name;
    this.connectionState = ConnectionState.Connecting;
    this.connectionTimedOut = false;

    // Only reset reconnectAttempts on fresh connect, not on reconnection
    if (this.isFreshConnect) {
      this.reconnectAttempts = 0;
    }
    this.isFreshConnect = false;

    return new Promise((resolve, reject) => {
      let joinedReceived = false;

      // Store original handleMessage so cleanup can restore it after joined.
      const originalHandleMessage = this.handleMessage.bind(this);

      const cleanup = () => {
        this.handleMessage = originalHandleMessage;
      };

      try {
        const url = `${serverUrl || 'wss://rushkill-relay.fly.dev'}?room=${encodeURIComponent(room)}`;
        console.log('[NetworkManager] Connecting to:', url);
        this.ws = new WebSocket(url);

        this.ws.onopen = () => {
          console.log('[NetworkManager] WebSocket connection opened');
          this.connectionState = ConnectionState.Connected;
          // Only reset reconnectAttempts on fresh connect, not on reconnection
          if (this.isFreshConnect) {
            this.reconnectAttempts = 0;
          }
          this.pongReceived = true;
          this.startPingInterval();
          this.flushMessageQueue();

          // Send join message
          const joinMsg: JoinMessage = {
            type: 'join',
            name: this.playerName,
          };
          console.log('[NetworkManager] Sending join message:', joinMsg);
          this.send(joinMsg);
        };

        this.ws.onmessage = (event: MessageEvent) => {
          console.log('[NetworkManager] Received message:', event.data);
          
          if (!joinedReceived) {
            try {
              const msg = JSON.parse(event.data) as Message;
              if (msg.type === 'joined') {
                const jm = msg as JoinedMessage;
                if (jm.self === true) {
                  console.log('[NetworkManager] Self-joined confirmation received:', jm);
                  this.assignedId = jm.id;
                  joinedReceived = true;
                  cleanup();
                  resolve();
                  return;
                }
              }
            } catch (err) {
              console.error('[NetworkManager] Error parsing joined message:', err);
            }
          }
          
          // Handle all messages normally after joined
          this.handleMessage(event.data);
        };

        this.ws.onclose = (event: CloseEvent) => {
          console.log('[NetworkManager] WebSocket connection closed:', event);
          if (!joinedReceived) {
            cleanup();
            reject(new Error('Connection closed before joined confirmation'));
          }
          this.handleClose(event);
        };

        this.ws.onerror = (event: Event) => {
          console.error('[NetworkManager] WebSocket error:', event);
          if (!joinedReceived) {
            cleanup();
            reject(new Error('WebSocket error'));
          }
          // onclose will be called after onerror, handle cleanup there
        };

        // Timeout for connection
        setTimeout(() => {
          if (this.connectionState === ConnectionState.Connecting && !joinedReceived) {
            this.connectionTimedOut = true;
            this.connectionState = ConnectionState.Disconnected;
            this.ws?.close();
            cleanup();
            reject(new Error('Connection timeout - unable to join room'));
          }
        }, 15000);
      } catch (err) {
        this.connectionState = ConnectionState.Disconnected;
        cleanup();
        reject(err);
      }
    });
  }

  /**
   * Send an input message to the server.
   * Queued if not yet connected.
   * @param input - Input message to send
   */
  public sendInput(input: InputMessage): void {
    this.send(input);
  }

  /**
   * Broadcast a state message to all clients in the room (host only).
   * Queued if not yet connected.
   * @param state - State message to broadcast
   */
  public broadcastState(state: StateMessage): void {
    // Relay supports per-client broadcasts; allow every participant to sync own state.
    this.send(state);
  }

  /**
   * Disconnect from the server.
   */
  public disconnect(): void {
    this.stopPingInterval();
    this.connectionState = ConnectionState.Disconnected;
    this.reconnectAttempts = 0;
    this.isReconnecting = false;
    this.isFreshConnect = true;

    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onclose = null;
      this.ws.onerror = null;

      if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
        this.ws.close();
      }
      this.ws = null;
    }

    this.messageQueue = [];
    this.assignedId = null;
    this.latestStateValue = null;
  }

  /** Send a message, queuing if not connected */
  private send(msg: Message): void {
    const data = JSON.stringify(msg);

    if (this.isConnected) {
      this.ws!.send(data);
    } else {
      this.messageQueue.push(data);
    }
  }

  /** Flush queued messages */
  private flushMessageQueue(): void {
    while (this.messageQueue.length > 0 && this.isConnected) {
      const data = this.messageQueue.shift()!;
      this.ws!.send(data);
    }
  }

  /** Handle incoming message from server */
  private handleMessage(data: string): void {
    let rawMsg: { type: string };
    try {
      rawMsg = JSON.parse(data) as { type: string };
    } catch (err) {
      console.error('[NetworkManager] Failed to parse message:', err, 'data:', data);
      return;
    }

    const msgType = rawMsg.type;
    console.log('[NetworkManager] Processing message type:', msgType);

    // Handle ping from server - respond with pong
    if (msgType === 'ping') {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'pong' }));
      }
      return;
    }

    // Handle pong response
    if (msgType === 'pong') {
      this.pongReceived = true;
      return;
    }

    // Now safe to treat as full Message for type guards
    const fullMsg = rawMsg as Message;

    // Type-safe handling using type guards
    if (isStateMessage(fullMsg)) {
      this.latestStateValue = fullMsg;
      this.onState?.(fullMsg);
      return;
    }

    if (isJoinedMessage(fullMsg)) {
      console.log('[NetworkManager] Joined message received:', fullMsg);
      this.assignedId = fullMsg.id;
      this.onPlayerJoin?.(fullMsg);
      return;
    }

    if (isLeftMessage(fullMsg)) {
      this.onPlayerLeave?.(fullMsg);
      return;
    }

    if (isHostMigratedMessage(fullMsg)) {
      this.isHostFlag = fullMsg.newHost === this.assignedId;
      this.onHostMigrated?.(fullMsg);
      return;
    }

    if (isErrorMessage(fullMsg)) {
      console.error('[NetworkManager] Error message received:', fullMsg);
      this.onError?.(fullMsg);
      return;
    }

    if (isInputMessage(fullMsg)) {
      // Relayed input from other clients - could be forwarded to game logic
      // For now, we don't have a callback for this, but it's handled
      return;
    }

    console.warn('[NetworkManager] Unknown message type:', fullMsg.type);
  }

  /** Handle WebSocket close event */
  private handleClose(event: CloseEvent): void {
    this.stopPingInterval();
    this.ws = null;

    if (this.connectionState === ConnectionState.Disconnected) {
      // Intentional disconnect or already handled
      return;
    }

    // Don't reconnect if connection timed out - the connect() Promise already rejected
    if (this.connectionTimedOut) {
      this.connectionTimedOut = false;
      this.connectionState = ConnectionState.Disconnected;
      return;
    }

    // Don't reconnect if ping timeout occurred
    if (event.code === 1006 && event.reason === 'Ping timeout') {
      this.connectionState = ConnectionState.Disconnected;
      return;
    }

    if (this.reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
      this.scheduleReconnect();
    } else {
      this.connectionState = ConnectionState.Disconnected;
      this.onError?.({
        type: 'error',
        code: 'INTERNAL_ERROR',
        message: `Max reconnection attempts (${MAX_RECONNECT_ATTEMPTS}) reached`,
      });
    }
  }

  /** Schedule a reconnection attempt with exponential backoff */
  private scheduleReconnect(): void {
    this.connectionState = ConnectionState.Reconnecting;
    this.isReconnecting = true;
    // isFreshConnect remains false for reconnection attempts
    const delay = RECONNECT_BASE_DELAY_MS * Math.pow(2, this.reconnectAttempts);
    this.reconnectAttempts++;

    console.log(`[NetworkManager] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);

    setTimeout(() => {
      if (this.connectionState === ConnectionState.Reconnecting) {
        this.connect(this.room, this.isHostFlag, this.playerName).catch((err) => {
          console.error('[NetworkManager] Reconnection failed:', err);
          this.handleClose({} as CloseEvent);
        });
      }
    }, delay);
  }

  /** Start ping/pong interval to detect dead connections */
  private startPingInterval(): void {
    this.stopPingInterval();
    this.pingIntervalId = setInterval(() => {
      // Check if we should even be running ping interval
      if (this.connectionState === ConnectionState.Disconnected || !this.ws) {
        this.stopPingInterval();
        return;
      }

      // If not connected, stop the interval
      if (this.ws.readyState !== WebSocket.OPEN) {
        this.stopPingInterval();
        return;
      }

      if (!this.pongReceived) {
        // Missed pong - connection is dead
        console.log('[NetworkManager] Ping timeout, closing connection');
        this.connectionTimedOut = true;
        this.connectionState = ConnectionState.Disconnected;
        this.ws.close(1006, 'Ping timeout');
        this.stopPingInterval();
        return;
      }

      this.pongReceived = false;
      try {
        this.ws.send(JSON.stringify({ type: 'ping' }));
      } catch {
        // Send failed, connection likely dead
        this.stopPingInterval();
        this.handleClose({ code: 1006, reason: 'Send failed', wasClean: false } as CloseEvent);
      }
    }, PING_INTERVAL_MS);
  }

  /** Stop ping/pong interval */
  private stopPingInterval(): void {
    if (this.pingIntervalId !== null) {
      clearInterval(this.pingIntervalId);
      this.pingIntervalId = null;
    }
  }
}