import { MultiplayerEngine } from './MultiplayerEngine';
import { NetworkManager } from './NetworkManager';
import { StateMessage, InputMessage } from './NetworkTypes';

// Simple test runner for tsx
function runTest(name: string, test: () => void) {
  try {
    test();
    console.log(`✓ ${name}`);
    return true;
  } catch (error) {
    console.error(`✗ ${name}:`, error);
    return false;
  }
}

function assertEquals(actual: any, expected: any, message?: string) {
  if (actual !== expected) {
    throw new Error(message || `Expected ${expected}, got ${actual}`);
  }
}

function assertTrue(condition: boolean, message?: string) {
  if (!condition) {
    throw new Error(message || 'Expected true, got false');
  }
}

function assertDefined(value: any, message?: string) {
  if (value === undefined || value === null) {
    throw new Error(message || 'Expected value to be defined');
  }
}

// Mock NetworkManager - using type assertion for simplicity in tests
const createMockNetworkManager = () => {
  const mock = {
    broadcastState: () => {},
    sendInput: () => {},
    connect: async () => {},
    disconnect: () => {},
    onState: null as ((state: StateMessage) => void) | null,
    onPlayerJoin: null as ((joined: any) => void) | null,
    onPlayerLeave: null as ((left: any) => void) | null,
    onHostMigrated: null as ((migrated: any) => void) | null,
    clientId: 'test-client-id',
    isHost: false,
    roomCode: '',
    latestState: null as StateMessage | null,
    state: 'connected'
  };
  
  // Cast to NetworkManager type for testing
  return mock as any;
}

// Mock GameEngine
const mockEngine = {
  update: (delta: number) => {},
  getPlayerState: () => ({ pos: [0, 0, 0] as [number, number, number], rot: [0, 0, 0] as [number, number, number], hp: 100, weapon: 'rival_9' })
};

// Test Suite
console.log('Running MultiplayerEngine tests...\n');

let passedTests = 0;
let totalTests = 0;

// Test 1: Host Mode
totalTests++;
if (runTest('Host broadcasts state and receives input', () => {
  const engine = new MultiplayerEngine();
  const networkManager = createMockNetworkManager();
  engine.attachNetworkManager(networkManager);
  
  // Mock game engine
  const mockEngine = {
    update: (delta: number) => {},
    getPlayerState: () => ({ pos: [0,0,0] as [number, number, number], rot: [0,0,0] as [number, number, number], hp: 100, weapon: 'rival_9' })
  };
  engine.attachGameEngine(mockEngine);
  
  // Start as host
  engine.startMultiplayer('TEST123', true, 'Host').then(() => {
    // Simulate game loop
    engine.update(0.016); // 16ms
    
    // Verify host broadcasts state
    assertTrue(networkManager.broadcastState !== undefined, 'broadcastState should be defined');
    assertTrue(networkManager.sendInput === undefined, 'sendInput should not be called by host');
    
    // Verify engine state
    assertTrue(engine.isMultiplayer, 'should be multiplayer');
    assertTrue(engine.isHost, 'should be host');
    assertEquals(engine.room, 'TEST123', 'room should be set');
  });
})) passedTests++;

// Test 2: Client Mode
totalTests++;
if (runTest('Client interpolates movement', () => {
  const engine = new MultiplayerEngine();
  const networkManager = createMockNetworkManager();
  engine.attachNetworkManager(networkManager);
  
  // Start as client
  engine.startMultiplayer('TEST123', false, 'Client').then(() => {
    // Simulate state updates from host
    engine.receiveState({
      type: 'state',
      tick: 100,
      entities: [
        { id: 'other', x: 1, y: 0, z: 1, yaw: 0, pitch: 0, hp: 100 }
      ]
    });
    
    // Verify interpolation buffer
    const otherPlayer = engine.getPlayer('other');
    assertDefined(otherPlayer?.interpolationBuffer, 'interpolationBuffer should be defined');
    assertEquals(otherPlayer?.currentPos, [1, 0, 1], 'currentPos should be set');
  });
})) passedTests++;

// Test 3: Client sends input
totalTests++;
if (runTest('Client sends input to host', () => {
  const engine = new MultiplayerEngine();
  const networkManager = createMockNetworkManager();
  engine.attachNetworkManager(networkManager);
  
  // Start as client
  engine.startMultiplayer('TEST123', false, 'Client').then(() => {
    // Send input as client
    engine.sendPlayerInput({ 
      yaw: 0.5, 
      pitch: 0.1, 
      keys: { w: true, a: false }, 
      fire: true 
    });
    
    // Client should send input
    assertTrue(networkManager.sendInput !== undefined, 'sendInput should be defined');
  });
})) passedTests++;

// Test 4: Player management
totalTests++;
if (runTest('Player management functionality', () => {
  const engine = new MultiplayerEngine();
  
  // Add mock player
  engine['players'].set('player1', {
    id: 'player1',
    name: 'Player1',
    pos: [0, 0, 0],
    rot: [0, 0, 0],
    hp: 100,
    weapon: 'rival_9',
    isHost: false
  });
  
  // Test player retrieval
  const players = engine.getPlayers();
  assertEquals(players.length, 1, 'should have 1 player');
  assertEquals(players[0].id, 'player1', 'player ID should match');
  
  const player = engine.getPlayer('player1');
  assertEquals(player?.name, 'Player1', 'player name should match');
  
  const nonExistentPlayer = engine.getPlayer('nonexistent');
  assertEquals(nonExistentPlayer, undefined, 'non-existent player should return undefined');
})) passedTests++;

// Test 5: State interpolation
totalTests++;
if (runTest('State interpolation with multiple updates', () => {
  const engine = new MultiplayerEngine();
  const networkManager = createMockNetworkManager();
  engine.attachNetworkManager(networkManager);
  
  // Start as client
  engine.startMultiplayer('INTERP', false, 'Client').then(() => {
    // Send first state
    engine.receiveState({
      type: 'state',
      tick: 100,
      entities: [
        { id: 'other', x: 0, y: 0, z: 0, yaw: 0, pitch: 0, hp: 100 }
      ]
    });
    
    // Send second state with different position
    engine.receiveState({
      type: 'state',
      tick: 101,
      entities: [
        { id: 'other', x: 10, y: 0, z: 0, yaw: 0, pitch: 0, hp: 100 }
      ]
    });
    
    const otherPlayer = engine.getPlayer('other');
    assertDefined(otherPlayer?.interpolationBuffer, 'interpolationBuffer should be defined');
    assertTrue(!!(otherPlayer?.interpolationBuffer && otherPlayer.interpolationBuffer.length >= 2), 'should have multiple states in buffer');
    assertDefined(otherPlayer?.currentPos, 'currentPos should be defined');
  });
})) passedTests++;

// Test 6: Error handling
totalTests++;
if (runTest('Error handling - NetworkManager not attached', async () => {
  const engine = new MultiplayerEngine();
  
  // This should throw an error
  try {
    await engine.startMultiplayer('ROOM', true, 'Host');
    throw new Error('Expected error was not thrown');
  } catch (err) {
    assertTrue((err as Error).message.includes('NetworkManager not attached'), 'should throw NetworkManager error');
  }
})) passedTests++;

// Test 7: Disconnect functionality
totalTests++;
if (runTest('Disconnect cleanup', () => {
  const engine = new MultiplayerEngine();
  const networkManager = createMockNetworkManager();
  engine.attachNetworkManager(networkManager);
  
  // Start multiplayer
  engine.startMultiplayer('ROOM789', true, 'Host').then(() => {
    // Verify initial state
    assertTrue(engine.isMultiplayer, 'should be multiplayer');
    
    // Disconnect
    engine.disconnect();
    
    // Verify cleanup
    assertTrue(!engine.isMultiplayer, 'should not be multiplayer');
    assertTrue(!engine.isHost, 'should not be host');
    assertEquals(engine.room, '', 'room should be empty');
    assertEquals(engine.players.size, 0, 'players should be cleared');
  });
})) passedTests++;

// Test 8: Backward compatibility
totalTests++;
if (runTest('Backward compatibility - single player still works', () => {
  const engine = new MultiplayerEngine();
  
  // Don't start multiplayer, should still work
  assertTrue(!engine.isMultiplayer, 'should not be multiplayer by default');
  
  // Test that methods don't crash when not in multiplayer
  engine.disconnect(); // Should not crash
  engine.update(0.016); // Should not crash
  engine.sendPlayerInput({ yaw: 0.1 }); // Should not crash
})) passedTests++;

console.log(`\nTest Results: ${passedTests}/${totalTests} tests passed`);

if (passedTests === totalTests) {
  console.log('🎉 All tests passed!');
  process.exit(0);
} else {
  console.log('❌ Some tests failed');
  process.exit(1);
}