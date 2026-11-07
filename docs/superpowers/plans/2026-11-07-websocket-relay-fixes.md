# WebSocket Relay Server Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all critical and important findings from the Task 1 review: rewrite in TypeScript strict mode, add message validation, fix client ID collisions, implement late-joiner state sync, implement 30Hz tick reference, add rate limiting and message size limits, and expand test coverage.

**Architecture:** Convert existing JavaScript server to TypeScript with strict mode. Add validation schemas using Zod for message validation. Implement server-authoritative client IDs. Add 30Hz tick interval that increments room.tick and exposes it to host. Implement per-client rate limiting (60 input msgs/sec) and 16KB max payload. Expand test suite to cover all protocol paths.

**Tech Stack:** Node.js, TypeScript (strict), ws (WebSocket library), Zod (validation), Jest (testing), ts-jest/tsx for test running

**Spec:** `.superpowers/sdd/websocket-relay-multiplayer/task-1-brief.md` and review findings in `.superpowers/sdd/websocket-relay-multiplayer/task-1-review.md`

## Global Constraints

- TypeScript strict mode required (`tsc --noEmit` must pass)
- All files in `server/` directory
- Tests must pass: `cd server && npm test`
- Build must pass: `cd server && npx tsc --noEmit`
- Protocol must match brief exactly (join, input, state, joined, left, host-migrated, error)

## Review Focus

1. **Malformed input/state packets** — Server must validate required fields and reject invalid messages with error response, not relay them
2. **Duplicate client IDs** — Server must generate authoritative IDs; two clients sending same `id` in join must get different server-assigned IDs
3. **Late joiner state sync** — New joiners must receive current `state` (tick + entities) from host automatically on join
4. **Missing 30Hz tick** — Room.tick must increment at 30Hz; host must have access to server tick for timing reference
5. **Input spam / large payloads** — Per-client rate limit (60/s) and maxPayload (16KB) must be enforced
6. **Unknown message types** — Must return error with code, not crash
7. **Concurrent rooms** — Multiple rooms must operate independently

---

### Task 1: Set up TypeScript project structure

**Files:**
- Create: `server/tsconfig.json`
- Create: `server/package.json` (updated with TypeScript, Zod, tsx, @types/ws, @types/jest)
- Modify: `server/server.js` → `server/server.ts` (rename and convert)
- Modify: `server/server.test.js` → `server/server.test.ts` (rename and convert)

**Interfaces:**
- Consumes: existing server.js logic
- Produces: TypeScript server with strict types, Zod schemas for all message types

- [ ] **Step 1: Create tsconfig.json with strict mode**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "./dist",
    "rootDir": ".",
    "baseUrl": ".",
    "types": ["node", "jest", "ws"]
  },
  "include": ["*.ts"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 2: Update package.json with TypeScript dependencies and scripts**

```json
{
  "name": "rushkill-relay",
  "version": "1.0.0",
  "description": "WebSocket relay server for Project Rushkill multiplayer",
  "main": "dist/server.js",
  "type": "module",
  "scripts": {
    "start": "node dist/server.js",
    "dev": "tsx watch server.ts",
    "build": "tsc",
    "typecheck": "tsc --noEmit",
    "test": "node --experimental-vm-modules node_modules/jest/bin/jest.js --testTimeout=10000"
  },
  "dependencies": {
    "ws": "^8.18.0",
    "zod": "^3.22.0"
  },
  "devDependencies": {
    "jest": "^29.7.0",
    "tsx": "^4.7.0",
    "typescript": "^5.4.0",
    "@types/ws": "^8.5.0",
    "@types/jest": "^29.5.0",
    "@types/node": "^20.11.0"
  }
}
```

- [ ] **Step 3: Run `npm install` in server directory**

- [ ] **Step 4: Verify `npx tsc --noEmit` passes (will fail initially, that's expected)**

- [ ] **Step 5: Commit**

```bash
git add server/tsconfig.json server/package.json
git commit -m "chore: add TypeScript project setup with strict mode"
```

---

### Task 2: Define TypeScript types and Zod validation schemas

**Files:**
- Create: `server/types.ts` (message types, room types, client types)
- Modify: `server/server.ts` (import types)

**Interfaces:**
- Consumes: protocol from brief
- Produces: TypeScript interfaces and Zod schemas for all message types

- [ ] **Step 1: Create `server/types.ts` with all message types and Zod schemas**

```typescript
import { z } from 'zod';
import { WebSocket } from 'ws';

// ===== Message Types (matching brief protocol exactly) =====

export const JoinMessageSchema = z.object({
  type: z.literal('join'),
  room: z.string().min(1),
  name: z.string().min(1).max(32).optional(),
  id: z.string().optional() // Client-provided, but server will override
});

export const InputMessageSchema = z.object({
  type: z.literal('input'),
  seq: z.number().int().nonnegative(),
  yaw: z.number(),
  pitch: z.number(),
  keys: z.record(z.string(), z.boolean()),
  fire: z.boolean()
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
  }))
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
```

- [ ] **Step 2: Run `npx tsc --noEmit` to verify types compile**

- [ ] **Step 3: Commit**

```bash
git add server/types.ts
git commit -m "feat: add TypeScript types and Zod validation schemas"
```

---

### Task 3: Implement server-authoritative client IDs and join handling

**Files:**
- Modify: `server/server.ts` (replace handleJoin, connection handler)

**Interfaces:**
- Consumes: types from Task 2
- Produces: Updated join logic that generates server-side IDs, ignores client-provided

- [ ] **Step 1: Write failing test for server-authoritative IDs**

In `server/server.test.ts`, add test:
```typescript
test('server assigns unique IDs even when clients provide same id', async () => {
  const server = await createServer({ port: 3002 });
  const client1 = new WebSocket('ws://localhost:3002?room=SAMEID');
  const client2 = new WebSocket('ws://localhost:3002?room=SAMEID');
  await Promise.all([once(client1, 'open'), once(client2, 'open')]);
  
  // Both send same ID
  client1.send(JSON.stringify({ type: 'join', id: 'duplicate', name: 'Client1' }));
  client2.send(JSON.stringify({ type: 'join', id: 'duplicate', name: 'Client2' }));
  
  // Both should receive joined with DIFFERENT server-assigned IDs
  const [msg1] = await once(client1, 'message');
  const [msg2] = await once(client2, 'message');
  const joined1 = JSON.parse(msg1.toString());
  const joined2 = JSON.parse(msg2.toString());
  
  expect(joined1.type).toBe('joined');
  expect(joined2.type).toBe('joined');
  expect(joined1.id).not.toBe(joined2.id); // Different IDs!
  expect(joined1.id).not.toBe('duplicate'); // Not client-provided
  expect(joined2.id).not.toBe('duplicate');
  
  await server.close();
});
```

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Implement server-authoritative ID generation in `server.ts`**

- Generate unique ID server-side (e.g., `crypto.randomUUID()` or similar)
- Ignore `message.id` from client in join handler
- Send assigned ID back in `joined` confirmation

- [ ] **Step 4: Run test to verify it passes**

- [ ] **Step 5: Commit**

```bash
git add server/server.ts server/server.test.ts
git commit -m "feat: server-authoritative client IDs prevent collisions"
```

---

### Task 4: Add message validation with Zod schemas

**Files:**
- Modify: `server/server.ts` (add validation in message handler)

**Interfaces:**
- Consumes: Zod schemas from Task 2
- Produces: Validated message handling that rejects invalid input/state

- [ ] **Step 1: Write failing tests for message validation**

```typescript
test('server rejects invalid input message (missing fields)', async () => {
  const server = await createServer({ port: 3003 });
  const host = new WebSocket('ws://localhost:3003?room=VALIDATION');
  const client = new WebSocket('ws://localhost:3003?room=VALIDATION');
  await Promise.all([once(host, 'open'), once(client, 'open')]);
  
  host.send(JSON.stringify({ type: 'join', name: 'Host' }));
  client.send(JSON.stringify({ type: 'join', name: 'Client' }));
  await once(host, 'message'); // joined
  await once(client, 'message'); // joined
  
  // Send invalid input (missing seq)
  host.send(JSON.stringify({ type: 'input', yaw: 0, pitch: 0, keys: {}, fire: false }));
  
  // Host should receive error, client should NOT receive relayed input
  const [errorMsg] = await once(host, 'message');
  const error = JSON.parse(errorMsg.toString());
  expect(error.type).toBe('error');
  expect(error.code).toBe('VALIDATION_ERROR');
  
  // Client should not have received the invalid input
  // (use a timeout to verify no message received)
  
  await server.close();
});

test('server rejects invalid state message (missing entities)', async () => {
  // Similar test for state validation
});
```

- [ ] **Step 2: Run tests to verify they fail**

- [ ] **Step 3: Implement validation in `server.ts`**

- Parse message with `ClientMessageSchema.safeParse()`
- On failure: send `error` with `code: 'VALIDATION_ERROR'` and details
- On success: proceed with typed message handling
- Validate `input` and `state` specifically before relaying

- [ ] **Step 4: Run tests to verify they pass**

- [ ] **Step 5: Commit**

```bash
git add server/server.ts server/server.test.ts
git commit -m "feat: add Zod schema validation for all message types"
```

---

### Task 5: Implement late-joiner state sync

**Files:**
- Modify: `server/server.ts` (store last state, send to new joiners)

**Interfaces:**
- Consumes: Room type with `lastState` field
- Produces: New joiners receive current state automatically

- [ ] **Step 1: Write failing test for late-joiner state sync**

```typescript
test('late joiner receives current state from host', async () => {
  const server = await createServer({ port: 3004 });
  const host = new WebSocket('ws://localhost:3004?room=STATESYNC');
  const client1 = new WebSocket('ws://localhost:3004?room=STATESYNC');
  await Promise.all([once(host, 'open'), once(client1, 'open')]);
  
  host.send(JSON.stringify({ type: 'join', name: 'Host' }));
  client1.send(JSON.stringify({ type: 'join', name: 'Client1' }));
  await once(host, 'message');
  await once(client1, 'message');
  
  // Host sends state
  const stateMsg = {
    type: 'state',
    tick: 100,
    entities: [{ id: 'host', x: 10, y: 0, z: 5, yaw: 0, pitch: 0, hp: 100 }]
  };
  host.send(JSON.stringify(stateMsg));
  await once(client1, 'message'); // client1 receives state
  
  // Late joiner connects
  const client2 = new WebSocket('ws://localhost:3004?room=STATESYNC');
  await once(client2, 'open');
  client2.send(JSON.stringify({ type: 'join', name: 'Client2' }));
  
  // Client2 should receive: joined (host), joined (client1), AND state
  const messages = [];
  for (let i = 0; i < 3; i++) {
    const [msg] = await once(client2, 'message');
    messages.push(JSON.parse(msg.toString()));
  }
  
  const stateReceived = messages.find(m => m.type === 'state');
  expect(stateReceived).toBeDefined();
  expect(stateReceived.tick).toBe(100);
  expect(stateReceived.entities).toHaveLength(1);
  
  await server.close();
});
```

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Implement late-joiner state sync in `server.ts`**

- Store `lastState` in Room when host sends state
- In `handleJoin`, after sending existing player `joined` messages, if `room.lastState` exists, send it to the new joiner

- [ ] **Step 4: Run test to verify it passes**

- [ ] **Step 5: Commit**

```bash
git add server/server.ts server/server.test.ts
git commit -m "feat: implement late-joiner state sync"
```

---

### Task 6: Implement 30Hz tick reference

**Files:**
- Modify: `server/server.ts` (add tick interval on room creation)

**Interfaces:**
- Consumes: Room type with `tick` and `tickInterval`
- Produces: Room.tick increments at 30Hz; host can use for timing

- [ ] **Step 1: Write failing test for 30Hz tick**

```typescript
test('room tick increments at 30Hz and is available to host', async () => {
  const server = await createServer({ port: 3005 });
  const host = new WebSocket('ws://localhost:3005?room=TICK');
  await once(host, 'open');
  host.send(JSON.stringify({ type: 'join', name: 'Host' }));
  await once(host, 'message'); // joined
  
  // Wait ~100ms (3 ticks at 30Hz)
  await new Promise(r => setTimeout(r, 110));
  
  // Host sends state - tick should have advanced
  host.send(JSON.stringify({ type: 'state', tick: 0, entities: [] }));
  
  // Note: Server doesn't enforce host tick, but room.tick should be incrementing
  // We verify by checking internal state or by host receiving tick updates
  // (Implementation detail: server could send periodic tick updates to host)
  
  await server.close();
});
```

Actually, the spec says "host should send state, server doesn't simulate" but "server provides tick synchronization or enforcement". Let me re-read... The review says "Host has no server-side timing reference for 30Hz state updates". So the server should increment tick and make it available. The simplest approach: server increments room.tick at 30Hz, and when host sends state, server can include current server tick in relayed state or send periodic tick updates.

Let me adjust: The server increments room.tick at 30Hz. When relaying state from host, server can update the tick to server's tick (or include both). Or server sends periodic `tick` messages to host.

For now, let's implement: room.tick increments at 30Hz via setInterval. When host sends state, server uses room.tick in the relayed message (overriding host's tick). This gives host a reference.

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Implement 30Hz tick in `server.ts`**

- On room creation, start `setInterval` at 33.33ms (30Hz) that increments `room.tick`
- Store interval reference for cleanup on room deletion
- In `handleState`, use `room.tick` for the relayed message (or include both)

- [ ] **Step 4: Run test to verify it passes**

- [ ] **Step 5: Commit**

```bash
git add server/server.ts server/server.test.ts
git commit -m "feat: implement 30Hz tick reference for host timing"
```

---

### Task 7: Add rate limiting and message size limits

**Files:**
- Modify: `server/server.ts` (configure WebSocketServer maxPayload, add per-client rate limiting)

**Interfaces:**
- Consumes: ClientInfo with rate limit tracking
- Produces: Enforced 60 input msgs/sec per client, 16KB max payload

- [ ] **Step 1: Write failing tests for rate limiting and size limits**

```typescript
test('server enforces 60 input messages/sec rate limit', async () => {
  const server = await createServer({ port: 3006 });
  const host = new WebSocket('ws://localhost:3006?room=RATELIMIT');
  const client = new WebSocket('ws://localhost:3006?room=RATELIMIT');
  await Promise.all([once(host, 'open'), once(client, 'open')]);
  
  host.send(JSON.stringify({ type: 'join', name: 'Host' }));
  client.send(JSON.stringify({ type: 'join', name: 'Client' }));
  await once(host, 'message');
  await once(client, 'message');
  
  // Send 61 input messages rapidly
  for (let i = 0; i < 61; i++) {
    host.send(JSON.stringify({ 
      type: 'input', seq: i, yaw: 0, pitch: 0, keys: {}, fire: false 
    }));
  }
  
  // Host should receive error for exceeding rate limit
  const [errorMsg] = await once(host, 'message');
  const error = JSON.parse(errorMsg.toString());
  expect(error.type).toBe('error');
  expect(error.code).toBe('RATE_LIMIT_EXCEEDED');
  
  await server.close();
});

test('server rejects messages larger than 16KB', async () => {
  const server = await createServer({ port: 3007 });
  const host = new WebSocket('ws://localhost:3007?room=SIZE');
  await once(host, 'open');
  host.send(JSON.stringify({ type: 'join', name: 'Host' }));
  await once(host, 'message');
  
  // Create state with huge entities array (>16KB)
  const hugeEntities = Array(1000).fill({ id: 'x', x: 0, y: 0, z: 0, yaw: 0, pitch: 0, hp: 100 });
  const largeState = { type: 'state', tick: 0, entities: hugeEntities };
  
  host.send(JSON.stringify(largeState));
  
  // Should receive error (connection may close due to maxPayload)
  // WebSocket 'error' or 'close' event
  
  await server.close();
});
```

- [ ] **Step 2: Run tests to verify they fail**

- [ ] **Step 3: Implement rate limiting and size limits in `server.ts`**

- Set `maxPayload: 16 * 1024` (16KB) in WebSocketServer options
- Track input messages per client per second (sliding window or fixed window)
- On limit exceeded: send error with `code: 'RATE_LIMIT_EXCEEDED'`, don't relay

- [ ] **Step 4: Run tests to verify they pass**

- [ ] **Step 5: Commit**

```bash
git add server/server.ts server/server.test.ts
git commit -m "feat: add rate limiting (60/s) and 16KB message size limit"
```

---

### Task 8: Expand test coverage for all protocol paths

**Files:**
- Modify: `server/server.test.ts` (add comprehensive tests)

**Interfaces:**
- Consumes: All server functionality
- Produces: Tests covering input relay, state relay, host migration, leave, errors, malformed JSON, unknown types, concurrent rooms

- [ ] **Step 1: Add comprehensive test suite**

```typescript
// Input relay test
test('server relays input from client to all others in same room', async () => { ... });

// State relay test
test('server relays state from host to all other clients', async () => { ... });

// Host migration test
test('server promotes new host when host leaves', async () => { ... });

// Leave handling test
test('server broadcasts left when client disconnects', async () => { ... });

// Error messages test
test('server returns error for unknown message type', async () => { ... });
test('server returns error for malformed JSON', async () => { ... });

// Concurrent rooms test
test('rooms are isolated - messages dont cross rooms', async () => { ... });

// Room cleanup test
test('empty room is cleaned up', async () => { ... });
```

- [ ] **Step 2: Run all tests to verify they pass**

- [ ] **Step 3: Commit**

```bash
git add server/server.test.ts
git commit -m "test: expand coverage for all protocol paths and error cases"
```

---

### Task 9: Fix Jest cleanup warnings and ensure proper resource management

**Files:**
- Modify: `server/server.test.ts` (proper async cleanup)
- Modify: `server/server.ts` (ensure close() handles all resources)

**Interfaces:**
- Consumes: Server close() method
- Produces: Clean test runs without "asynchronous operations weren't stopped" warnings

- [ ] **Step 1: Fix server.close() to properly await all WebSocket closures**

- [ ] **Step 2: Fix tests to properly await server.close() and connection closes**

- [ ] **Step 3: Run tests and verify no Jest warnings**

- [ ] **Step 4: Commit**

```bash
git add server/server.ts server/server.test.ts
git commit -m "fix: resolve Jest cleanup warnings with proper async resource management"
```

---

### Task 10: Final verification - build and test

**Files:**
- All server files

**Interfaces:**
- Consumes: Complete implementation
- Produces: Passing build and test suite

- [ ] **Step 1: Run `npx tsc --noEmit` - must pass with no errors**

- [ ] **Step 2: Run `npm test` - all tests must pass**

- [ ] **Step 3: Verify fly.toml still correct**

- [ ] **Step 4: Update task-1-report.md with fix summary**

- [ ] **Step 5: Commit final changes**

```bash
git add server/
git commit -m "chore: final verification - TypeScript strict build and all tests pass"
```

---

## Self-Review Checklist

- [ ] Spec coverage: All 5 critical findings + 3 important findings addressed
- [ ] Type consistency: Types flow from types.ts through server.ts to tests
- [ ] Review Focus: Each failure mode has a test in the owning task
- [ ] Proportion: Plan is detailed but not a transcript
- [ ] Dependencies: Tasks ordered correctly (types → validation → features → tests)

## Execution

I'll implement this plan using the executing-plans skill, working through each task sequentially with verification at each step.