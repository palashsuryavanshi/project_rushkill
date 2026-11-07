import { GameEngine } from './engine';
import { MultiplayerEngine } from './MultiplayerEngine';
import { NetworkManager } from './NetworkManager';
import { GameSettings } from './types';

// Mock DOM element for testing
const createMockContainer = () => {
  const container = document.createElement('div');
  document.body.appendChild(container);
  return container;
};

// Mock settings
const mockSettings: GameSettings = {
  mouseSensitivity: 1.8,
  fov: 90,
  masterVolume: 0.7,
  showMinimap: true,
  showDamageNumbers: true,
  crosshairColor: '#00ffcc',
  showFps: true,
  graphicsPreset: 'auto',
};

describe('Game Engine Integration', () => {
  let container: HTMLDivElement;
  let engine: GameEngine;
  let multiplayerEngine: MultiplayerEngine;
  let networkManager: NetworkManager;

  beforeEach(() => {
    container = createMockContainer();
    multiplayerEngine = new MultiplayerEngine();
    networkManager = new NetworkManager();
  });

  afterEach(() => {
    if (engine) {
      engine.destroy();
    }
    document.body.innerHTML = '';
  });

  describe('Multiplayer Integration', () => {
    test('Game engine supports both single-player and multiplayer', () => {
      // Create engine
      engine = new GameEngine(container, mockSettings, {
        onStatsUpdate: () => {},
        onKillfeed: () => {},
        onStreakBanner: () => {},
        onHitmarker: () => {},
        onFloatingDamage: () => {},
        onMatchEnd: () => {},
        onMinimapUpdate: () => {},
        onScoreboardUpdate: () => {},
      });

      // Single-player mode
      expect(engine.isMultiplayer).toBe(false);
      expect(engine.update).toBeDefined();

      // Attach multiplayer
      engine.attachMultiplayer(multiplayerEngine, networkManager);
      
      // Switch to multiplayer
      const startSpy = jest.spyOn(multiplayerEngine, 'startMultiplayer');
      engine.startMultiplayer('TEST123', true, 'Host');
      
      expect(engine.isMultiplayer).toBe(true);
      expect(startSpy).toHaveBeenCalledWith('TEST123', true, 'Host');
      expect(engine.update).toBeDefined();

      // Switch back to single-player
      const stopSpy = jest.spyOn(multiplayerEngine, 'disconnect');
      engine.stopMultiplayer();
      
      expect(engine.isMultiplayer).toBe(false);
      expect(stopSpy).toHaveBeenCalled();
    });

    test('Multiplayer engine calls update when attached', () => {
      engine = new GameEngine(container, mockSettings, {
        onStatsUpdate: () => {},
        onKillfeed: () => {},
        onStreakBanner: () => {},
        onHitmarker: () => {},
        onFloatingDamage: () => {},
        onMatchEnd: () => {},
        onMinimapUpdate: () => {},
        onScoreboardUpdate: () => {},
      });

      const mockUpdate = jest.fn();
      multiplayerEngine.attachGameEngine({ update: mockUpdate });
      
      engine.attachMultiplayer(multiplayerEngine, networkManager);
      
      // Simulate game loop
      engine.update(0.016); // 60 FPS
      
      expect(mockUpdate).toHaveBeenCalledWith(0.016);
    });

    test('Bots do not spawn in multiplayer mode', () => {
      engine = new GameEngine(container, mockSettings, {
        onStatsUpdate: () => {},
        onKillfeed: () => {},
        onStreakBanner: () => {},
        onHitmarker: () => {},
        onFloatingDamage: () => {},
        onMatchEnd: () => {},
        onMinimapUpdate: () => {},
        onScoreboardUpdate: () => {},
      });

      // Initially in single-player mode, bots should spawn
      expect(engine.botsList.length).toBeGreaterThan(0);

      // Switch to multiplayer
      engine.attachMultiplayer(multiplayerEngine, networkManager);
      engine.startMultiplayer('TEST123', true, 'Host');
      
      // Bots should be cleared in multiplayer
      expect(engine.botsList.length).toBe(0);
    });

    test('Input buffering works in multiplayer', () => {
      engine = new GameEngine(container, mockSettings, {
        onStatsUpdate: () => {},
        onKillfeed: () => {},
        onStreakBanner: () => {},
        onHitmarker: () => {},
        onFloatingDamage: () => {},
        onMatchEnd: () => {},
        onMinimapUpdate: () => {},
        onScoreboardUpdate: () => {},
      });

      engine.attachMultiplayer(multiplayerEngine, networkManager);
      engine.startMultiplayer('TEST123', false, 'Client'); // Client mode

      const mockSendInput = jest.spyOn(multiplayerEngine, 'sendPlayerInput');
      
      // Simulate input using private properties for testing
      (engine as any).keysHeld.add('KeyW');
      (engine as any).mouseButtonsHeld.add(0);
      
      // Update should send input for clients
      engine.update(0.016);
      
      expect(mockSendInput).toHaveBeenCalledWith({
        yaw: expect.any(Number),
        pitch: expect.any(Number),
        keys: { 'KeyW': true },
        fire: true,
      });
    });

    test('Host does not send input in multiplayer', () => {
      engine = new GameEngine(container, mockSettings, {
        onStatsUpdate: () => {},
        onKillfeed: () => {},
        onStreakBanner: () => {},
        onHitmarker: () => {},
        onFloatingDamage: () => {},
        onMatchEnd: () => {},
        onMinimapUpdate: () => {},
        onScoreboardUpdate: () => {},
      });

      engine.attachMultiplayer(multiplayerEngine, networkManager);
      engine.startMultiplayer('TEST123', true, 'Host'); // Host mode

      const mockSendInput = jest.spyOn(multiplayerEngine, 'sendPlayerInput');
      
      // Simulate input using private properties for testing
      (engine as any).keysHeld.add('KeyW');
      (engine as any).mouseButtonsHeld.add(0);
      
      // Update should not send input for hosts
      engine.update(0.016);
      
      expect(mockSendInput).not.toHaveBeenCalled();
    });
  });

  describe('State Management', () => {
    test('Engine state is preserved when switching modes', () => {
      engine = new GameEngine(container, mockSettings, {
        onStatsUpdate: () => {},
        onKillfeed: () => {},
        onStreakBanner: () => {},
        onHitmarker: () => {},
        onFloatingDamage: () => {},
        onMatchEnd: () => {},
        onMinimapUpdate: () => {},
        onScoreboardUpdate: () => {},
      });

      // Set initial state
      engine.setWeapon(require('./weapons').RUSH_WEAPONS[0]);
      expect(engine.activeWeapon).toBeDefined();

      // Switch to multiplayer
      engine.attachMultiplayer(multiplayerEngine, networkManager);
      engine.startMultiplayer('TEST123', true, 'Host');
      
      // State should be preserved
      expect(engine.activeWeapon).toBeDefined();
      expect(engine.ammoCount).toBe(engine.activeWeapon.magSize);
    });

    test('Multiplayer state is properly cleaned up', () => {
      engine = new GameEngine(container, mockSettings, {
        onStatsUpdate: () => {},
        onKillfeed: () => {},
        onStreakBanner: () => {},
        onHitmarker: () => {},
        onFloatingDamage: () => {},
        onMatchEnd: () => {},
        onMinimapUpdate: () => {},
        onScoreboardUpdate: () => {},
      });

      engine.attachMultiplayer(multiplayerEngine, networkManager);
      engine.startMultiplayer('TEST123', true, 'Host');
      
      expect(engine.isMultiplayer).toBe(true);
      expect(engine.multiplayerRoomCode).toBe('TEST123');
      
      // Stop multiplayer
      engine.stopMultiplayer();
      
      expect(engine.isMultiplayer).toBe(false);
      expect(engine.multiplayerRoomCode).toBe('');
      expect(engine.botsList.length).toBeGreaterThan(0); // Bots should respawn
    });
  });

  describe('Error Handling', () => {
    test('Gracefully handles multiplayer system not attached', () => {
      engine = new GameEngine(container, mockSettings, {
        onStatsUpdate: () => {},
        onKillfeed: () => {},
        onStreakBanner: () => {},
        onHitmarker: () => {},
        onFloatingDamage: () => {},
        onMatchEnd: () => {},
        onMinimapUpdate: () => {},
        onScoreboardUpdate: () => {},
      });

      // Should not throw when trying to start multiplayer without attaching
      expect(() => {
        engine.startMultiplayer('TEST123', true, 'Host');
      }).toThrow('Multiplayer system not attached');
    });

    test('Handles network manager null gracefully', () => {
      engine = new GameEngine(container, mockSettings, {
        onStatsUpdate: () => {},
        onKillfeed: () => {},
        onStreakBanner: () => {},
        onHitmarker: () => {},
        onFloatingDamage: () => {},
        onMatchEnd: () => {},
        onMinimapUpdate: () => {},
        onScoreboardUpdate: () => {},
      });

      // Should not crash when network manager is null
      expect(() => {
        engine.sendMultiplayerInput();
      }).not.toThrow();
    });
  });
});