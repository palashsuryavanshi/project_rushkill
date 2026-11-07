// ===== Shared Network Types (matching server/types.ts exactly) =====

/** Client → Server: Join a room */
export interface JoinMessage {
  type: 'join';
  room?: string;        // Optional - room is in URL query param
  name?: string;        // Optional - player name (1-32 chars)
  id?: string;          // Optional - client-provided ID (server overrides)
}

/** Client → Server: Input state for a tick */
export interface InputMessage {
  type: 'input';
  seq: number;          // Sequence number (non-negative integer)
  yaw: number;          // Horizontal rotation in radians
  pitch: number;        // Vertical rotation in radians
  keys: Record<string, boolean>; // Key states (e.g., 'w', 'a', 's', 'd', 'shift', 'space')
  fire: boolean;        // Whether fire button is pressed
  id?: string;          // Added by server when relaying to other clients
}

/** Client → Server: Full state (host only) */
export interface StateMessage {
  type: 'state';
  tick: number;         // Server tick number (non-negative integer)
  entities: NetworkEntity[]; // Array of entities in the room
  id?: string;          // Added by server when relaying
}

/** Server → Client: Join confirmed with assigned ID */
export interface JoinedMessage {
  type: 'joined';
  id: string;           // Authoritative client ID assigned by server
  name: string;         // Player name
}

/** Server → Client: Another player left */
export interface LeftMessage {
  type: 'left';
  id: string;           // ID of the player who left
}

/** Server → Client: Host migration occurred */
export interface HostMigratedMessage {
  type: 'host-migrated';
  newHost: string;      // ID of the new host
}

/** Server → Client: Error response */
export interface ErrorMessage {
  type: 'error';
  code: ErrorCode;      // Programmatic error code
  message: string;      // Human-readable message
}

/** Error codes for programmatic handling */
export type ErrorCode =
  | 'MISSING_ROOM'
  | 'NOT_JOINED'
  | 'NOT_HOST'
  | 'VALIDATION_ERROR'
  | 'INVALID_JSON'
  | 'RATE_LIMIT_EXCEEDED'
  | 'INTERNAL_ERROR';

/** Entity state as sent over the network (matches server StateMessageSchema.entities) */
export interface NetworkEntity {
  id: string;           // Entity ID
  x: number;            // World X position
  y: number;            // World Y position
  z: number;            // World Z position
  yaw: number;          // Horizontal rotation in radians
  pitch: number;        // Vertical rotation in radians
  hp?: number;          // Current HP (non-negative integer, optional)
}

/** Discriminated union of all client → server messages */
export type ClientMessage = JoinMessage | InputMessage | StateMessage;

/** Discriminated union of all server → client messages */
export type ServerMessage =
  | JoinedMessage
  | LeftMessage
  | HostMigratedMessage
  | ErrorMessage
  | InputMessage    // Relayed from other clients (has id)
  | StateMessage;   // Relayed from host (has id and server tick)

/** All message types combined */
export type Message = ClientMessage | ServerMessage;

/** Type guards for discriminated unions */
export function isClientMessage(msg: Message): msg is ClientMessage {
  return msg.type === 'join' || msg.type === 'input' || msg.type === 'state';
}

export function isServerMessage(msg: Message): msg is ServerMessage {
  return !isClientMessage(msg);
}

export function isJoinMessage(msg: Message): msg is JoinMessage {
  return msg.type === 'join';
}

export function isInputMessage(msg: Message): msg is InputMessage {
  return msg.type === 'input';
}

export function isStateMessage(msg: Message): msg is StateMessage {
  return msg.type === 'state';
}

export function isJoinedMessage(msg: Message): msg is JoinedMessage {
  return msg.type === 'joined';
}

export function isLeftMessage(msg: Message): msg is LeftMessage {
  return msg.type === 'left';
}

export function isHostMigratedMessage(msg: Message): msg is HostMigratedMessage {
  return msg.type === 'host-migrated';
}

export function isErrorMessage(msg: Message): msg is ErrorMessage {
  return msg.type === 'error';
}