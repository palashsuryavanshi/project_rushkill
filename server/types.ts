import { z } from 'zod';
import { WebSocket } from 'ws';

// ===== Message Types (matching brief protocol exactly) =====

export const JoinMessageSchema = z.object({
  type: z.literal('join'),
  room: z.string().min(1).optional(), // Optional - room is in URL query param
  name: z.string().min(1).max(32).optional(),
  id: z.string().optional() // Client-provided, but server will override
});

export const InputMessageSchema = z.object({
  type: z.literal('input'),
  seq: z.number().int().nonnegative(),
  yaw: z.number(),
  pitch: z.number(),
  keys: z.record(z.string(), z.boolean()),
  fire: z.boolean(),
  id: z.string().optional() // Added by server when relaying
});

export const StateMessageSchema = z.object({
  type: z.literal('state'),
  tick: z.number().int().nonnegative(),
  entities: z.array(z.object({
    id: z.string(),
    x: z.number(),
    y: z.number(),
    z: z.number(),
    yaw: z.number(),
    pitch: z.number(),
    hp: z.number().int().nonnegative().optional()
  })),
  id: z.string().optional() // Added by server when relaying
});

export const JoinedMessageSchema = z.object({
  type: z.literal('joined'),
  id: z.string(),
  name: z.string()
});

export const LeftMessageSchema = z.object({
  type: z.literal('left'),
  id: z.string()
});

export const HostMigratedMessageSchema = z.object({
  type: z.literal('host-migrated'),
  newHost: z.string()
});

export const ErrorMessageSchema = z.object({
  type: z.literal('error'),
  code: z.string(), // Added for programmatic handling
  message: z.string()
});

// Union of all client->server messages
export const ClientMessageSchema = z.discriminatedUnion('type', [
  JoinMessageSchema,
  InputMessageSchema,
  StateMessageSchema
]);

// Union of all server->client messages
export const ServerMessageSchema = z.discriminatedUnion('type', [
  JoinedMessageSchema,
  LeftMessageSchema,
  HostMigratedMessageSchema,
  ErrorMessageSchema,
  InputMessageSchema, // Relayed
  StateMessageSchema  // Relayed
]);

// ===== Inferred Types =====

export type JoinMessage = z.infer<typeof JoinMessageSchema>;
export type InputMessage = z.infer<typeof InputMessageSchema>;
export type StateMessage = z.infer<typeof StateMessageSchema>;
export type JoinedMessage = z.infer<typeof JoinedMessageSchema>;
export type LeftMessage = z.infer<typeof LeftMessageSchema>;
export type HostMigratedMessage = z.infer<typeof HostMigratedMessageSchema>;
export type ErrorMessage = z.infer<typeof ErrorMessageSchema>;
export type ClientMessage = z.infer<typeof ClientMessageSchema>;
export type ServerMessage = z.infer<typeof ServerMessageSchema>;

// ===== Room & Client Types =====

export interface ClientInfo {
  ws: WebSocket;
  id: string;
  name: string;
  joinedAt: number;
  lastInputSeq: number;
  inputRateLimit: { count: number; windowStart: number };
}

export interface Room {
  code: string;
  hostId: string;
  clients: Map<string, ClientInfo>;
  tick: number;
  lastState: StateMessage | null; // For late-joiner sync
  tickInterval: NodeJS.Timeout | null;
}

export interface ServerInstance {
  close: () => Promise<void>;
  rooms: Map<string, Room>;
}