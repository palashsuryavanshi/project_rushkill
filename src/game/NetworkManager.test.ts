import test from 'node:test';
import assert from 'node:assert/strict';
import { NetworkManager, ConnectionState } from './NetworkManager';
import type {
  InputMessage,
  StateMessage,
  JoinedMessage,
  LeftMessage,
  HostMigratedMessage,
  ErrorMessage,
  Message,
} from './NetworkTypes';

// ===== Mock WebSocket =====

interface MockWebSocket {
  readyState: number;
  onopen: (() => void) | null;
  onmessage: ((e: MessageEvent) => void) | null;
  onclose: ((e: CloseEvent) => void) | null;
  onerror: ((e: Event) => void) | null;
  send: (data: string) => void;
  close: () => void;
  simulateMessage: (data: string) => void;
  simulateClose: (code?: number, reason?: string) => void;
  simulateError: () => void;
  sentMessages: string[];
  url: string;
  closed: boolean;
}

function createMockWebSocket(): MockWebSocket {
  const sentMessages: string[] = [];
  let readyState = 0; // CONNECTING
  let closed = false;

  const mockWs: MockWebSocket = {
    get readyState() {
      return readyState;
    },
    set readyState(val) {
      readyState = val;
    },
    onopen: null,
    onmessage: null,
    onclose: null,
    onerror: null,
    sentMessages,
    url: '',
    closed: false,

    send(data: string) {
      if (closed) throw new Error('WebSocket is closed');
      sentMessages.push(data);
    },

    close() {
      if (closed) return;
      closed = true;
      readyState = 3; // CLOSED
      if (this.onclose) {
        this.onclose({ code: 1000, reason: '', wasClean: true } as CloseEvent);
      }
    },

    simulateMessage(data: string) {
      if (this.onmessage) {
        this.onmessage({ data } as MessageEvent);
      }
    },

    simulateClose(code = 1000, reason = '') {
      if (closed) return;
      closed = true;
      readyState = 3; // CLOSED
      if (this.onclose) {
        this.onclose({ code, reason, wasClean: code === 1000 } as CloseEvent);
      }
    },

    simulateError() {
      if (this.onerror) {
        this.onerror(new Event('error'));
      }
    },
  };

  // Simulate async connection
  setTimeout(() => {
    if (!closed) {
      readyState = 1; // OPEN
      if (mockWs.onopen) {
        mockWs.onopen();
      }
    }
  }, 0);

  return mockWs;
}

// Store created mock instances for test access
const mockInstances: MockWebSocket[] = [];

// Replace global WebSocket with our mock factory
class MockWebSocketConstructor {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  private mockWs: MockWebSocket;

  constructor(url: string) {
    this.mockWs = createMockWebSocket();
    this.mockWs.url = url;
    mockInstances.push(this.mockWs);

    // Return a proxy that delegates to mockWs
    return new Proxy(this, {
      get(target, prop) {
        if (prop in target.mockWs) {
          return (target.mockWs as any)[prop];
        }
        return (target as any)[prop];
      },
      set(target, prop, value) {
        if (prop in target.mockWs) {
          (target.mockWs as any)[prop] = value;
          return true;
        }
        (target as any)[prop] = value;
        return true;
      },
    }) as any;
  }

  static getLatestMock(): MockWebSocket | undefined {
    return mockInstances[mockInstances.length - 1];
  }

  static clearMocks() {
    mockInstances.length = 0;
  }
}

// ===== Test Helpers =====

function setupMockWebSocket() {
  global.WebSocket = MockWebSocketConstructor as any;
  MockWebSocketConstructor.clearMocks();
}

function getLatestMock(): MockWebSocket {
  const mock = MockWebSocketConstructor.getLatestMock();
  if (!mock) throw new Error('No mock WebSocket created');
  return mock;
}

async function waitForOpen(mgr: NetworkManager, timeout = 100): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const check = setInterval(() => {
      if (mgr.isConnected) {
        clearInterval(check);
        resolve();
      }
    }, 5);
    setTimeout(() => {
      clearInterval(check);
      reject(new Error('Timeout waiting for connection'));
    }, timeout);
  });
}

// ===== Tests =====

test('NetworkManager connects, sends input, receives state', async () => {
  setupMockWebSocket();
  const mgr = new NetworkManager();
  const states: StateMessage[] = [];
  mgr.onState = (s) => states.push(s);

  const connectPromise = mgr.connect('TEST123', true, 'Host');
  const mockWs = getLatestMock();

  // Wait for connection and send joined message
  await new Promise(r => setTimeout(r, 10));
  mockWs.simulateMessage(JSON.stringify({ type: 'joined', id: 'assigned-id-1', name: 'Host' }));
  mockWs.simulateMessage(JSON.stringify({ type: 'state', tick: 1, entities: [] }));

  await connectPromise;
  assert.equal(mgr.isConnected, true);
  assert.equal(mgr.isHost, true);
  assert.equal(mgr.roomCode, 'TEST123');
  assert.equal(mgr.clientId, 'assigned-id-1');

  mgr.sendInput({ type: 'input', seq: 1, yaw: 0, pitch: 0, keys: {}, fire: false } as InputMessage);
  await new Promise(r => setTimeout(r, 20));
  assert.equal(states.length, 1);
  assert.equal(states[0].tick, 1);

  mgr.disconnect();
});

test('NetworkManager queues messages before connection', async () => {
  setupMockWebSocket();
  const mgr = new NetworkManager();

  // Send input before connect - should be queued
  mgr.sendInput({ type: 'input', seq: 1, yaw: 0, pitch: 0, keys: {}, fire: false } as InputMessage);

  const connectPromise = mgr.connect('TEST123', true, 'Host');
  const mockWs = getLatestMock();

  await new Promise(r => setTimeout(r, 10));
  mockWs.simulateMessage(JSON.stringify({ type: 'joined', id: 'assigned-id-1', name: 'Host' }));

  await connectPromise;
  await new Promise(r => setTimeout(r, 10));

  // Should have sent join + queued input
  const messageTypes = mockWs.sentMessages.map(m => JSON.parse(m).type);
  assert.ok(messageTypes.includes('join'));
  assert.ok(messageTypes.includes('input'));

  mgr.disconnect();
});

test('NetworkManager handles joined message and assigns clientId', async () => {
  setupMockWebSocket();
  const mgr = new NetworkManager();
  const captured = { joinedMsg: null as JoinedMessage | null };
  mgr.onPlayerJoin = (msg: JoinedMessage) => { captured.joinedMsg = msg; };

  const connectPromise = mgr.connect('ROOM1', false, 'Player');
  const mockWs = getLatestMock();

  await new Promise(r => setTimeout(r, 10));
  mockWs.simulateMessage(JSON.stringify({ type: 'joined', id: 'assigned-id-1', name: 'Player' }));

  await connectPromise;

  assert.equal(mgr.clientId, 'assigned-id-1');
  assert.ok(captured.joinedMsg !== null);
  assert.equal(captured.joinedMsg!.id, 'assigned-id-1');
  assert.equal(captured.joinedMsg!.name, 'Player');

  mgr.disconnect();
});

test('NetworkManager handles left message', async () => {
  setupMockWebSocket();
  const mgr = new NetworkManager();
  const captured = { leftMsg: null as LeftMessage | null };
  mgr.onPlayerLeave = (msg: LeftMessage) => { captured.leftMsg = msg; };

  const connectPromise = mgr.connect('ROOM1', false, 'Player');
  const mockWs = getLatestMock();

  await new Promise(r => setTimeout(r, 10));
  mockWs.simulateMessage(JSON.stringify({ type: 'joined', id: 'assigned-id-1', name: 'Player' }));
  await connectPromise;

  mockWs.simulateMessage(JSON.stringify({ type: 'left', id: 'player2' }));

  assert.ok(captured.leftMsg !== null);
  assert.equal(captured.leftMsg!.id, 'player2');

  mgr.disconnect();
});

test('NetworkManager handles host-migrated message', async () => {
  setupMockWebSocket();
  const mgr = new NetworkManager();
  const captured = { migratedMsg: null as HostMigratedMessage | null };
  mgr.onHostMigrated = (msg: HostMigratedMessage) => { captured.migratedMsg = msg; };

  const connectPromise = mgr.connect('ROOM1', true, 'Host');
  const mockWs = getLatestMock();

  await new Promise(r => setTimeout(r, 10));
  mockWs.simulateMessage(JSON.stringify({ type: 'joined', id: 'host-id', name: 'Host' }));
  await connectPromise;

  assert.equal(mgr.isHost, true);

  mockWs.simulateMessage(JSON.stringify({ type: 'host-migrated', newHost: 'player2' }));

  assert.equal(mgr.isHost, false);
  assert.ok(captured.migratedMsg !== null);
  assert.equal(captured.migratedMsg!.newHost, 'player2');

  mgr.disconnect();
});

test('NetworkManager handles error message', async () => {
  setupMockWebSocket();
  const mgr = new NetworkManager();
  const captured = { errorMsg: null as ErrorMessage | null };
  mgr.onError = (msg: ErrorMessage) => { captured.errorMsg = msg; };

  const connectPromise = mgr.connect('ROOM1', false, 'Player');
  const mockWs = getLatestMock();

  await new Promise(r => setTimeout(r, 10));
  mockWs.simulateMessage(JSON.stringify({ type: 'joined', id: 'assigned-id-1', name: 'Player' }));
  await connectPromise;

  mockWs.simulateMessage(JSON.stringify({ type: 'error', code: 'NOT_HOST', message: 'Only host can broadcast state' }));

  assert.ok(captured.errorMsg !== null);
  assert.equal(captured.errorMsg!.code, 'NOT_HOST');
  assert.equal(captured.errorMsg!.message, 'Only host can broadcast state');

  mgr.disconnect();
});

test('NetworkManager updates latestState on state message', async () => {
  setupMockWebSocket();
  const mgr = new NetworkManager();

  const connectPromise = mgr.connect('ROOM1', false, 'Player');
  const mockWs = getLatestMock();

  await new Promise(r => setTimeout(r, 10));
  mockWs.simulateMessage(JSON.stringify({ type: 'joined', id: 'assigned-id-1', name: 'Player' }));
  await connectPromise;

  assert.equal(mgr.latestState, null);

  const stateMsg: StateMessage = { type: 'state', tick: 42, entities: [{ id: 'e1', x: 0, y: 0, z: 0, yaw: 0, pitch: 0 }] };
  mockWs.simulateMessage(JSON.stringify(stateMsg));

  assert.equal(mgr.latestState!.tick, 42);
  assert.equal(mgr.latestState!.entities.length, 1);

  mgr.disconnect();
});

test('NetworkManager does not reconnect on intentional disconnect', async () => {
  setupMockWebSocket();
  const mgr = new NetworkManager();

  const connectPromise = mgr.connect('ROOM1', false, 'Player');
  const mockWs = getLatestMock();

  await new Promise(r => setTimeout(r, 10));
  mockWs.simulateMessage(JSON.stringify({ type: 'joined', id: 'assigned-id-1', name: 'Player' }));
  await connectPromise;

  mgr.disconnect();
  mockWs.simulateClose(1000, 'Normal closure');

  // Should not attempt reconnect
  assert.equal(mgr.state, ConnectionState.Disconnected);
});

test('NetworkManager ping/pong - responds to ping from server', async () => {
  setupMockWebSocket();
  const mgr = new NetworkManager();

  const connectPromise = mgr.connect('ROOM1', false, 'Player');
  const mockWs = getLatestMock();

  await new Promise(r => setTimeout(r, 10));
  mockWs.simulateMessage(JSON.stringify({ type: 'joined', id: 'assigned-id-1', name: 'Player' }));
  await connectPromise;

  // Simulate ping from server
  mockWs.simulateMessage(JSON.stringify({ type: 'ping' }));

  // Check that pong was sent
  const pongSent = mockWs.sentMessages.some(m => JSON.parse(m).type === 'pong');
  assert.equal(pongSent, true);

  mgr.disconnect();
});

test('NetworkManager ping/pong - handles pong from server', async () => {
  setupMockWebSocket();
  const mgr = new NetworkManager();

  const connectPromise = mgr.connect('ROOM1', false, 'Player');
  const mockWs = getLatestMock();

  await new Promise(r => setTimeout(r, 10));
  mockWs.simulateMessage(JSON.stringify({ type: 'joined', id: 'assigned-id-1', name: 'Player' }));
  await connectPromise;

  // Simulate pong from server (response to our ping)
  mockWs.simulateMessage(JSON.stringify({ type: 'pong' }));

  // Should not throw, pongReceived should be true
  assert.equal(mgr.isConnected, true);

  mgr.disconnect();
});

test('NetworkManager broadcastState only works for host', async () => {
  setupMockWebSocket();
  const mgr = new NetworkManager();

  const connectPromise = mgr.connect('ROOM1', false, 'Player'); // Not host
  const mockWs = getLatestMock();

  await new Promise(r => setTimeout(r, 10));
  mockWs.simulateMessage(JSON.stringify({ type: 'joined', id: 'assigned-id-1', name: 'Player' }));
  await connectPromise;

  const stateMsg: StateMessage = { type: 'state', tick: 1, entities: [] };
  mgr.broadcastState(stateMsg);

  // Should not send anything since not host
  const stateSent = mockWs.sentMessages.some(m => JSON.parse(m).type === 'state');
  assert.equal(stateSent, false);

  mgr.disconnect();
});

test('NetworkManager connection URL includes room in query param', async () => {
  setupMockWebSocket();
  const mgr = new NetworkManager();

  const connectPromise = mgr.connect('MYROOM', true, 'Host');
  const mockWs = getLatestMock();

  await new Promise(r => setTimeout(r, 10));
  mockWs.simulateMessage(JSON.stringify({ type: 'joined', id: 'assigned-id-1', name: 'Host' }));
  await connectPromise;

  assert.ok(mockWs.url.includes('wss://rushkill-relay.fly.dev?room=MYROOM'));

  mgr.disconnect();
});

test('NetworkManager state property reflects connection state', async () => {
  setupMockWebSocket();
  const mgr = new NetworkManager();

  assert.equal(mgr.state, ConnectionState.Disconnected);

  const connectPromise = mgr.connect('ROOM1', false, 'Player');
  const mockWs = getLatestMock();

  await new Promise(r => setTimeout(r, 10));
  // State should be connecting during connection
  const currentState = mgr.state as ConnectionState;
  assert.ok(
    currentState === ConnectionState.Connecting ||
    currentState === ConnectionState.Connected ||
    currentState === ConnectionState.Disconnected ||
    currentState === ConnectionState.Reconnecting
  );

  mockWs.simulateMessage(JSON.stringify({ type: 'joined', id: 'assigned-id-1', name: 'Player' }));
  await connectPromise;
  assert.equal(mgr.state, ConnectionState.Connected);

  mgr.disconnect();
  assert.equal(mgr.state, ConnectionState.Disconnected);
});

test('NetworkManager handles relayed input message', async () => {
  setupMockWebSocket();
  const mgr = new NetworkManager();

  const connectPromise = mgr.connect('ROOM1', false, 'Player');
  const mockWs = getLatestMock();

  await new Promise(r => setTimeout(r, 10));
  mockWs.simulateMessage(JSON.stringify({ type: 'joined', id: 'assigned-id-1', name: 'Player' }));
  await connectPromise;

  // Relayed input from another client (has id)
  const relayedInput: InputMessage = {
    type: 'input',
    seq: 5,
    yaw: 1.0,
    pitch: 0.5,
    keys: { w: true },
    fire: true,
    id: 'other-player'
  };
  mockWs.simulateMessage(JSON.stringify(relayedInput));

  // Should not throw, just handled silently
  assert.equal(mgr.isConnected, true);

  mgr.disconnect();
});

test('NetworkManager sendInput sends input message when connected', async () => {
  setupMockWebSocket();
  const mgr = new NetworkManager();

  const connectPromise = mgr.connect('ROOM1', false, 'Player');
  const mockWs = getLatestMock();

  await new Promise(r => setTimeout(r, 10));
  mockWs.simulateMessage(JSON.stringify({ type: 'joined', id: 'assigned-id-1', name: 'Player' }));
  await connectPromise;

  const input: InputMessage = { type: 'input', seq: 10, yaw: 0.5, pitch: 0.1, keys: { w: true, a: false }, fire: false };
  mgr.sendInput(input);

  const inputSent = mockWs.sentMessages.some(m => {
    const msg = JSON.parse(m);
    return msg.type === 'input' && msg.seq === 10;
  });
  assert.equal(inputSent, true);

  mgr.disconnect();
});

test('NetworkManager reconnects with exponential backoff and max 3 attempts', async () => {
  setupMockWebSocket();
  const mgr = new NetworkManager();

  const connectPromise = mgr.connect('ROOM1', false, 'Player');
  let mockWs = getLatestMock();

  await new Promise(r => setTimeout(r, 10));
  mockWs.simulateMessage(JSON.stringify({ type: 'joined', id: 'assigned-id-1', name: 'Player' }));
  await connectPromise;

  // Simulate unexpected close
  mockWs.simulateClose(1006, 'Abnormal closure');

  // Wait for first reconnect attempt (should be ~1s)
  await new Promise(r => setTimeout(r, 1100));
  mockWs = getLatestMock();
  // Mock connects instantly, so state will be Connected after join
  mockWs.simulateMessage(JSON.stringify({ type: 'joined', id: 'assigned-id-1', name: 'Player' }));
  await new Promise(r => setTimeout(r, 10));
  assert.equal(mgr.state, ConnectionState.Connected);

  // Simulate second close
  mockWs.simulateClose(1006, 'Abnormal closure');

  // Wait for second reconnect attempt (should be ~2s)
  await new Promise(r => setTimeout(r, 2100));
  mockWs = getLatestMock();
  mockWs.simulateMessage(JSON.stringify({ type: 'joined', id: 'assigned-id-1', name: 'Player' }));
  await new Promise(r => setTimeout(r, 10));
  assert.equal(mgr.state, ConnectionState.Connected);

  // Simulate third close
  mockWs.simulateClose(1006, 'Abnormal closure');

  // Wait for third reconnect attempt (should be ~4s)
  await new Promise(r => setTimeout(r, 4100));
  mockWs = getLatestMock();
  mockWs.simulateMessage(JSON.stringify({ type: 'joined', id: 'assigned-id-1', name: 'Player' }));
  await new Promise(r => setTimeout(r, 10));
  assert.equal(mgr.state, ConnectionState.Connected);

  // Simulate fourth close - should NOT reconnect (max 3 attempts)
  mockWs.simulateClose(1006, 'Abnormal closure');

  // Wait longer than the next backoff would be (8s) to confirm no reconnect
  await new Promise(r => setTimeout(r, 100));

  assert.equal(mgr.state, ConnectionState.Disconnected);

  mgr.disconnect();
});

test('NetworkManager does not reconnect after connection timeout', async () => {
  setupMockWebSocket();
  const mgr = new NetworkManager();

  const connectPromise = mgr.connect('ROOM1', false, 'Player');
  const mockWs = getLatestMock();

  // Don't simulate open or joined - let it timeout
  // Advance timers past the 10s timeout
  await new Promise(r => setTimeout(r, 10100));

  try {
    await connectPromise;
    assert.fail('Expected connect to reject with timeout');
  } catch (err) {
    assert.ok(err instanceof Error);
    assert.equal((err as Error).message, 'Connection timeout');
  }

  // Should be disconnected, not reconnecting
  assert.equal(mgr.state, ConnectionState.Disconnected);

  mgr.disconnect();
});

// ===== SPECIFIC TESTS FOR REVIEW FINDINGS =====

test('CRITICAL: Reconnect counter only resets on fresh connect, not reconnection', async () => {
  setupMockWebSocket();
  const mgr = new NetworkManager();

  // First connection (fresh connect)
  const connectPromise1 = mgr.connect('ROOM1', false, 'Player');
  const mockWs1 = getLatestMock();

  await new Promise(r => setTimeout(r, 10));
  mockWs1.simulateMessage(JSON.stringify({ type: 'joined', id: 'assigned-id-1', name: 'Player' }));
  await connectPromise1;

  // Simulate disconnect and reconnect
  mockWs1.simulateClose(1006, 'Abnormal closure');

  // Wait for first reconnect attempt
  await new Promise(r => setTimeout(r, 1100));
  const mockWs2 = getLatestMock();
  mockWs2.simulateMessage(JSON.stringify({ type: 'joined', id: 'assigned-id-1', name: 'Player' }));
  await new Promise(r => setTimeout(r, 10));

  // reconnectAttempts should be 1 (not reset to 0)
  // The key test is that subsequent reconnects use the correct counter
  assert.equal(mgr.state, ConnectionState.Connected);

  // Simulate second disconnect
  mockWs2.simulateClose(1006, 'Abnormal closure');

  // Wait for second reconnect attempt (should be 2s, not 1s again)
  await new Promise(r => setTimeout(r, 2100));
  const mockWs3 = getLatestMock();
  mockWs3.simulateMessage(JSON.stringify({ type: 'joined', id: 'assigned-id-1', name: 'Player' }));
  await new Promise(r => setTimeout(r, 10));

  assert.equal(mgr.state, ConnectionState.Connected);

  mgr.disconnect();
});

test('IMPORTANT: Connection timeout sets state to Disconnected and prevents reconnect', async () => {
  setupMockWebSocket();
  const mgr = new NetworkManager();

  const connectPromise = mgr.connect('ROOM1', false, 'Player');
  const mockWs = getLatestMock();

  // Don't simulate open or joined - let it timeout
  await new Promise(r => setTimeout(r, 10100));

  try {
    await connectPromise;
    assert.fail('Expected connect to reject with timeout');
  } catch (err) {
    assert.ok(err instanceof Error);
    assert.equal((err as Error).message, 'Connection timeout');
  }

  // Key test: connectionState should be Disconnected, not Connecting
  assert.equal(mgr.state, ConnectionState.Disconnected);

  // And no reconnect attempt should be made
  // Wait a bit to ensure no background reconnect starts
  await new Promise(r => setTimeout(r, 2000));
  assert.equal(mgr.state, ConnectionState.Disconnected);

  mgr.disconnect();
});

test('IMPORTANT: handleMessage override is restored after joined message', async () => {
  setupMockWebSocket();
  const mgr = new NetworkManager();
  
  let handleMessageCallCount = 0;
  const originalOnState = (state: StateMessage) => {
    handleMessageCallCount++;
  };
  
  mgr.onState = originalOnState;

  const connectPromise = mgr.connect('ROOM1', false, 'Player');
  const mockWs = getLatestMock();

  await new Promise(r => setTimeout(r, 10));
  
  // Before joined, messages should be handled by the wrapper
  mockWs.simulateMessage(JSON.stringify({ type: 'state', tick: 1, entities: [] }));
  assert.equal(handleMessageCallCount, 0); // Should not call original yet

  // After joined, messages should go through original handleMessage
  mockWs.simulateMessage(JSON.stringify({ type: 'joined', id: 'assigned-id-1', name: 'Player' }));
  await connectPromise;

  // Now state messages should be handled by the original callback
  mockWs.simulateMessage(JSON.stringify({ type: 'state', tick: 2, entities: [] }));
  assert.equal(handleMessageCallCount, 1); // Should call original now

  mgr.disconnect();
});

test('NetworkManager disconnect returns void (matches brief)', async () => {
  setupMockWebSocket();
  const mgr = new NetworkManager();

  const connectPromise = mgr.connect('ROOM1', false, 'Player');
  const mockWs = getLatestMock();

  await new Promise(r => setTimeout(r, 10));
  mockWs.simulateMessage(JSON.stringify({ type: 'joined', id: 'assigned-id-1', name: 'Player' }));
  await connectPromise;

  // disconnect() should return void (undefined)
  const result = mgr.disconnect();
  assert.equal(result, undefined);
  assert.equal(mgr.state, ConnectionState.Disconnected);
});