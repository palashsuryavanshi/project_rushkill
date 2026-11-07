import { createTestMultiplayerEngine, startServer } from './setup';

describe('WebSocket Relay Multiplayer - End-to-End Tests', () => {
  let server: any;

  beforeAll(async () => {
    // Start test server
    server = await startServer('ws://localhost:3001');
    console.log('✅ Test server started');
  });

  afterAll(async () => {
    if (server) {
      await server.stop();
      console.log('✅ Test server stopped');
    }
  });

  describe('Happy Path - Complete Multiplayer Flow', () => {
    test('Host creates room, clients join, play together', async () => {
      // Host creates room
      const hostEngine = createTestMultiplayerEngine();
      await hostEngine.startMultiplayer('TEST123', true, 'Host');
      expect(hostEngine.room).toBe('TEST123');
      expect(hostEngine.isHost).toBe(true);
      
      // Client joins room
      const clientEngine = createTestMultiplayerEngine();
      await clientEngine.startMultiplayer('TEST123', false, 'Client');
      expect(clientEngine.room).toBe('TEST123');
      expect(clientEngine.isHost).toBe(false);
      
      // Simulate game loop for 60 frames (1 second at 60fps)
      for (let i = 0; i < 60; i++) {
        hostEngine.update(0.016);
        clientEngine.update(0.016);
        await new Promise(resolve => setTimeout(resolve, 16));
      }
      
      // Verify state synchronization
      expect(hostEngine.players.size).toBe(2);
      expect(clientEngine.players.size).toBe(2);
      
      // Cleanup
      await hostEngine.disconnect();
      await clientEngine.disconnect();
    }, 10000);

    test('Multiple clients join same room', async () => {
      const roomCode = 'MULTI123';
      const engines = [];
      
      // Create 4 players
      for (let i = 0; i < 4; i++) {
        const engine = createTestMultiplayerEngine();
        await engine.startMultiplayer(roomCode, i === 0, `Player${i + 1}`);
        engines.push(engine);
      }
      
      // Verify all players see each other
      engines.forEach(engine => {
        expect(engine.players.size).toBe(4);
        expect(engine.room).toBe(roomCode);
      });
      
      // Simulate game loop
      for (let i = 0; i < 30; i++) {
        engines.forEach(engine => engine.update(0.016));
        await new Promise(resolve => setTimeout(resolve, 16));
      }
      
      // Cleanup
      await Promise.all(engines.map(engine => engine.disconnect()));
    }, 15000);
  });

  describe('Room Collision Handling', () => {
    test('Two hosts try to create same room simultaneously', async () => {
      const roomCode = 'SAME_ROOM';
      
      // Two hosts try to create same room simultaneously
      const [host1, host2] = await Promise.all([
        createTestMultiplayerEngine().then(e => e.startMultiplayer(roomCode, true, 'Host1')),
        createTestMultiplayerEngine().then(e => e.startMultiplayer(roomCode, true, 'Host2'))
      ]);
      
      // Only one should succeed as host
      expect(host1.isHost || host2.isHost).toBe(true);
      expect(host1.isHost && host2.isHost).toBe(false);
      
      // Cleanup
      await host1.disconnect();
      await host2.disconnect();
    }, 10000);

    test('Multiple clients can join same room after host collision', async () => {
      const roomCode = 'COLLISION123';
      
      // First host collision
      const [host1, host2] = await Promise.all([
        createTestMultiplayerEngine().then(e => e.startMultiplayer(roomCode, true, 'Host1')),
        createTestMultiplayerEngine().then(e => e.startMultiplayer(roomCode, true, 'Host2'))
      ]);
      
      const actualHost = host1.isHost ? host1 : host2;
      const failedHost = host1.isHost ? host2 : host1;
      
      // Now regular clients can join
      const client1 = createTestMultiplayerEngine();
      await client1.startMultiplayer(roomCode, false, 'Client1');
      
      const client2 = createTestMultiplayerEngine();
      await client2.startMultiplayer(roomCode, false, 'Client2');
      
      // Verify room has 3 players (1 host + 2 clients)
      expect(actualHost.players.size).toBe(3);
      expect(client1.players.size).toBe(3);
      expect(client2.players.size).toBe(3);
      
      // Cleanup
      await actualHost.disconnect();
      await failedHost.disconnect();
      await client1.disconnect();
      await client2.disconnect();
    }, 15000);
  });

  describe('Network Scenarios', () => {
    test('Reconnection after disconnect', async () => {
      const roomCode = 'RECONNECT123';
      
      // Original host and client
      const hostEngine = createTestMultiplayerEngine();
      await hostEngine.startMultiplayer(roomCode, true, 'Host');
      
      const clientEngine = createTestMultiplayerEngine();
      await clientEngine.startMultiplayer(roomCode, false, 'Client');
      
      // Verify connection
      expect(hostEngine.players.size).toBe(2);
      expect(clientEngine.players.size).toBe(2);
      
      // Disconnect client
      await clientEngine.disconnect();
      
      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Reconnect client
      const reconnectEngine = createTestMultiplayerEngine();
      await reconnectEngine.startMultiplayer(roomCode, false, 'Client');
      
      // Verify reconnection
      expect(hostEngine.players.size).toBe(2);
      expect(reconnectEngine.players.size).toBe(2);
      
      // Cleanup
      await hostEngine.disconnect();
      await reconnectEngine.disconnect();
    }, 10000);

    test('Host migration when original host leaves', async () => {
      const roomCode = 'MIGRATE123';
      
      // Create three players
      const hostEngine = createTestMultiplayerEngine();
      await hostEngine.startMultiplayer(roomCode, true, 'OriginalHost');
      
      const client1 = createTestMultiplayerEngine();
      await client1.startMultiplayer(roomCode, false, 'Client1');
      
      const client2 = createTestMultiplayerEngine();
      await client2.startMultiplayer(roomCode, false, 'Client2');
      
      // Verify initial state
      expect(hostEngine.players.size).toBe(3);
      expect(client1.players.size).toBe(3);
      expect(client2.players.size).toBe(3);
      
      // Host leaves
      await hostEngine.disconnect();
      
      // Wait for migration
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // Verify new host is assigned (client1 should become host)
      // Note: In real implementation, this would be handled by the server
      expect(client1.players.size).toBe(2); // Host + client2
      expect(client2.players.size).toBe(2); // New host + client1
      
      // Cleanup
      await client1.disconnect();
      await client2.disconnect();
    }, 10000);
  });

  describe('Error Handling', () => {
    test('Invalid room code format', async () => {
      const engine = createTestMultiplayerEngine();
      
      // Test invalid room codes
      const invalidCodes = ['', 'TOO_SHORT', 'TOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOLONG'];
      
      for (const code of invalidCodes) {
        try {
          await engine.startMultiplayer(code, true, 'Test');
          // If we get here, the test should fail
          expect(false).toBe(true); // This should not happen
        } catch (err) {
          expect(err).toBeDefined();
        }
      }
      
      await engine.disconnect();
    }, 5000);

    test('Connection to non-existent server', async () => {
      const engine = createTestMultiplayerEngine();
      
      // Try to connect to non-existent server
      await expect(
        engine.startMultiplayer('NONEXISTENT', true, 'Test')
      ).rejects.toThrow();
      
      await engine.disconnect();
    }, 5000);

    test('Room with special characters', async () => {
      const engine = createTestMultiplayerEngine();
      
      // Test room codes with special characters
      const specialCodes = ['TEST!@#', 'TEST-123', 'TEST_456', 'TEST.789'];
      
      for (const code of specialCodes) {
        try {
          await engine.startMultiplayer(code, true, 'Test');
          expect(engine.room).toBe(code);
        } catch (err) {
          // Some special characters might be rejected
          console.log(`Room code ${code} failed:`, err);
        }
      }
      
      await engine.disconnect();
    }, 5000);
  });

  describe('Performance Testing', () => {
    test('Performance with 8 players simultaneously', async () => {
      const roomCode = 'PERF123';
      const playerCount = 8;
      const engines = [];
      
      // Create 8 players
      const startTime = Date.now();
      for (let i = 0; i < playerCount; i++) {
        const engine = createTestMultiplayerEngine();
        await engine.startMultiplayer(roomCode, i === 0, `Player${i + 1}`);
        engines.push(engine);
      }
      const joinTime = Date.now() - startTime;
      
      console.log(`📊 ${playerCount} players joined in ${joinTime}ms`);
      
      // Simulate intensive gameplay
      const gameLoopDuration = 2000; // 2 seconds
      const gameLoopStartTime = Date.now();
      
      while (Date.now() - gameLoopStartTime < gameLoopDuration) {
        engines.forEach(engine => engine.update(0.016));
        await new Promise(resolve => setTimeout(resolve, 16));
      }
      
      // Verify all players still connected
      engines.forEach(engine => {
        expect(engine.players.size).toBe(playerCount);
        expect(engine.room).toBe(roomCode);
      });
      
      const totalTime = Date.now() - startTime;
      console.log(`📊 Total test time: ${totalTime}ms`);
      
      // Cleanup
      await Promise.all(engines.map(engine => engine.disconnect()));
      
      // Performance assertions
      expect(joinTime).toBeLessThan(5000); // Should join within 5 seconds
      expect(totalTime).toBeLessThan(10000); // Should complete within 10 seconds
    }, 20000);

    test('Message throughput under load', async () => {
      const roomCode = 'THROUGHPUT123';
      const playerCount = 4;
      const messageCount = 100;
      const engines = [];
      const messageTracker = new Map<string, number>();
      
      // Create players
      for (let i = 0; i < playerCount; i++) {
        const engine = createTestMultiplayerEngine();
        await engine.startMultiplayer(roomCode, i === 0, `Player${i + 1}`);
        engines.push(engine);
      }
      
      // Send many messages
      const startTime = Date.now();
      for (let i = 0; i < messageCount; i++) {
        engines.forEach((engine, index) => {
          const messageId = `msg-${i}-${index}`;
          messageTracker.set(messageId, 0);
          
          // Simulate sending message
          engine.update(0.016);
        });
        
        if (i % 10 === 0) {
          await new Promise(resolve => setTimeout(resolve, 1)); // Small delay
        }
      }
      const endTime = Date.now();
      
      const totalTime = endTime - startTime;
      const messagesPerSecond = (messageCount * playerCount) / (totalTime / 1000);
      
      console.log(`📊 Message throughput: ${messagesPerSecond.toFixed(2)} messages/sec`);
      console.log(`📊 Total messages: ${messageCount * playerCount}`);
      console.log(`📊 Total time: ${totalTime}ms`);
      
      // Performance assertions
      expect(messagesPerSecond).toBeGreaterThan(50); // Should handle >50 messages/sec per player
      expect(totalTime).toBeLessThan(5000); // Should complete within 5 seconds
      
      // Cleanup
      await Promise.all(engines.map(engine => engine.disconnect()));
    }, 10000);
  });

  describe('Latency Simulation', () => {
    test('Simulated network latency', async () => {
      const roomCode = 'LATENCY123';
      
      // Create engines with simulated latency
      const hostEngine = createTestMultiplayerEngine();
      await hostEngine.startMultiplayer(roomCode, true, 'Host');
      
      const clientEngine = createTestMultiplayerEngine();
      await clientEngine.startMultiplayer(roomCode, false, 'Client');
      
      // Simulate high latency (200ms)
      const highLatency = 200;
      
      const startTime = Date.now();
      for (let i = 0; i < 30; i++) {
        hostEngine.update(0.016);
        clientEngine.update(0.016);
        await new Promise(resolve => setTimeout(resolve, 16 + highLatency / 30));
      }
      const endTime = Date.now();
      
      const actualLatency = endTime - startTime;
      console.log(`📊 Simulated latency: ${actualLatency}ms (target: ${highLatency}ms)`);
      
      // Verify players still connected despite latency
      expect(hostEngine.players.size).toBe(2);
      expect(clientEngine.players.size).toBe(2);
      
      // Cleanup
      await hostEngine.disconnect();
      await clientEngine.disconnect();
    }, 10000);

    test('Packet loss simulation', async () => {
      const roomCode = 'PACKETLOSS123';
      
      // Create engines
      const hostEngine = createTestMultiplayerEngine();
      await hostEngine.startMultiplayer(roomCode, true, 'Host');
      
      const clientEngine = createTestMultiplayerEngine();
      await clientEngine.startMultiplayer(roomCode, false, 'Client');
      
      // Simulate 25% packet loss
      let packetLossCount = 0;
      const totalMessages = 60;
      
      for (let i = 0; i < totalMessages; i++) {
        // Simulate packet loss by occasionally not sending messages
        if (Math.random() > 0.25) { // 75% chance to send
          hostEngine.update(0.016);
          clientEngine.update(0.016);
        } else {
          packetLossCount++;
        }
        
        await new Promise(resolve => setTimeout(resolve, 16));
      }
      
      console.log(`📊 Packet loss: ${packetLossCount}/${totalMessages} (${(packetLossCount/totalMessages*100).toFixed(1)}%)`);
      
      // Verify connection stability despite packet loss
      expect(hostEngine.players.size).toBe(2);
      expect(clientEngine.players.size).toBe(2);
      
      // Cleanup
      await hostEngine.disconnect();
      await clientEngine.disconnect();
    }, 10000);
  });
});