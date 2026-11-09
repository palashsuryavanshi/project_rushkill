import React, { useState, useEffect, useCallback } from 'react';
import { Copy, Users, Play, LogOut, Wifi, WifiOff, Crown } from 'lucide-react';
import { MultiplayerEngine } from '../game/MultiplayerEngine';
import { NetworkManager, ConnectionState } from '../game/NetworkManager';
import { Player } from '../game/MultiplayerEngine';
import { startWebSocketServer } from '../utils/webSocketServer';
import { MatchConfig, WeaponCategory, BotDifficulty } from '../game/types';
import { GameSetupScreen } from './GameSetupScreen';

interface MultiplayerUIProps {
  multiplayerEngine: MultiplayerEngine;
  networkManager: NetworkManager;
  onBackToMenu?: () => void;
  onStartGame?: () => void;
  matchConfig?: MatchConfig;
  onUpdateMatchConfig?: (cfg: MatchConfig) => void;
}

// Room code generation utility
const generateRoomCode = (): string => {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
};

// Room code validation utility
const isValidRoomCode = (code: string): boolean => {
  return /^[A-Z0-9]{6}$/i.test(code);
};

export const HostScreen: React.FC<{
  multiplayerEngine: MultiplayerEngine;
  networkManager: NetworkManager;
  playerName: string;
  onNameChange?: (name: string) => void;
  onRoomCreated: (roomCode: string) => void;
}> = ({ multiplayerEngine, networkManager, playerName, onNameChange, onRoomCreated }) => {
  const [roomCode, setRoomCode] = useState<string>('');
  const [isCreating, setIsCreating] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [serverPort, setServerPort] = useState<number | null>(null);

  const createRoom = useCallback(async () => {
    if (!playerName.trim()) {
      setError('Player name is required');
      return;
    }

    setIsCreating(true);
    setError('');

    try {
      const newRoomCode = generateRoomCode();
      setRoomCode(newRoomCode);
      
      // Server starts ONLY after Host click (main-menu Multiplayer → Host)
      const server = await startWebSocketServer();
      setServerPort(server.port);
      console.log('WebSocket server started:', server.url);
      
      // Start multiplayer with a timeout fallback - if connection fails, show error
      const multiplayerPromise = multiplayerEngine.startMultiplayer(newRoomCode, true, playerName.trim(), server.url);
      console.log('Starting multiplayer with:', { room: newRoomCode, isHost: true, name: playerName.trim(), serverUrl: server.url });
      
      // Wait for multiplayer to start, but not hang indefinitely
      await Promise.race([
        multiplayerPromise,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Connection timeout - unable to join room')), 15000)
        )
      ]);
      
      onRoomCreated(newRoomCode);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create room');
    } finally {
      setIsCreating(false);
    }
  }, [multiplayerEngine, playerName, onRoomCreated]);

  const copyRoomCode = useCallback(async () => {
    if (roomCode) {
      try {
        await navigator.clipboard.writeText(roomCode);
      } catch (err) {
        console.error('Failed to copy room code:', err);
      }
    }
  }, [roomCode]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-slate-800/95 border border-slate-700 rounded-2xl shadow-2xl p-8 backdrop-blur-sm">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-black text-white mb-2 tracking-wider">HOST GAME</h1>
          <p className="text-slate-400 text-sm">Create a room and invite friends to join</p>
        </div>

        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Your Name</label>
            <input
              type="text"
              value={playerName}
              onChange={(e) => onNameChange?.(e.target.value)}
              placeholder="Enter your name"
              className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            />
          </div>

          <div className="text-center">
            <div className="mb-4">
              <p className="text-sm text-slate-400 mb-2">Your Room Code</p>
              <div className="flex items-center justify-center gap-3">
                <div className="px-6 py-4 bg-slate-700/50 border border-slate-600 rounded-lg">
                  <span className="text-2xl font-mono font-bold text-amber-400 tracking-widest">
                    {roomCode || '------'}
                  </span>
                </div>
                {roomCode && (
                  <button
                    onClick={copyRoomCode}
                    className="p-3 bg-slate-700/50 border border-slate-600 rounded-lg hover:bg-slate-600 transition-colors group"
                    title="Copy room code"
                  >
                    <Copy className="w-5 h-5 text-slate-300 group-hover:text-white" />
                  </button>
                )}
              </div>
            </div>
          </div>

          {error && (
            <div className="p-3 bg-red-500/20 border border-red-500/50 rounded-lg">
              <p className="text-red-300 text-sm text-center">{error}</p>
            </div>
          )}

          <button
            onClick={createRoom}
            disabled={isCreating}
            className="w-full py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-black tracking-wider rounded-lg hover:from-purple-700 hover:to-pink-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isCreating ? 'CREATING...' : 'CREATE ROOM'}
          </button>
        </div>
      </div>
    </div>
  );
};

export const JoinScreen: React.FC<{
  multiplayerEngine: MultiplayerEngine;
  networkManager: NetworkManager;
  playerName: string;
  onNameChange?: (name: string) => void;
  onJoined: (roomCode: string) => void;
  onBack: () => void;
}> = ({ multiplayerEngine, networkManager, playerName, onNameChange, onJoined, onBack }) => {
  const [roomCode, setRoomCode] = useState<string>('');
  const [isJoining, setIsJoining] = useState<boolean>(false);
  const [error, setError] = useState<string>('');

  const joinRoom = useCallback(async () => {
    const trimmedCode = roomCode.trim();
    
    if (!isValidRoomCode(trimmedCode)) {
      setError('Room code must be 6 uppercase letters');
      return;
    }

    if (!playerName.trim()) {
      setError('Player name is required');
      return;
    }

    setIsJoining(true);
    setError('');

    try {
      // Server starts ONLY after Join click (main-menu Multiplayer → Join)
      const server = await startWebSocketServer();
      await multiplayerEngine.startMultiplayer(trimmedCode, false, playerName.trim(), server.url);
      onJoined(trimmedCode);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join room');
    } finally {
      setIsJoining(false);
    }
  }, [multiplayerEngine, roomCode, playerName, onJoined]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.toUpperCase();
    if (value.length <= 6) {
      setRoomCode(value);
      if (error && isValidRoomCode(value)) {
        setError('');
      }
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-slate-800/95 border border-slate-700 rounded-2xl shadow-2xl p-8 backdrop-blur-sm">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-black text-white mb-2 tracking-wider">JOIN GAME</h1>
          <p className="text-slate-400 text-sm">Enter a room code to join a game</p>
        </div>

        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Your Name</label>
            <input
              type="text"
              value={playerName}
              onChange={(e) => onNameChange?.(e.target.value)}
              placeholder="Enter your name"
              className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Room Code</label>
            <input
              type="text"
              value={roomCode}
              onChange={handleInputChange}
              placeholder="Enter 6-letter code"
              className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-lg text-white placeholder-slate-500 font-mono text-center tracking-widest text-xl focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              maxLength={6}
            />
            {error && (
              <p className="text-red-300 text-sm mt-1 text-center">{error}</p>
            )}
          </div>

          <div className="flex gap-3">
            <button
              onClick={onBack}
              className="flex-1 py-3 bg-slate-700/50 border border-slate-600 text-slate-300 font-medium rounded-lg hover:bg-slate-600 transition-colors"
            >
              BACK
            </button>
            <button
              onClick={joinRoom}
              disabled={isJoining}
              className="flex-1 py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-black tracking-wider rounded-lg hover:from-purple-700 hover:to-pink-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isJoining ? 'JOINING...' : 'JOIN'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export const LobbyScreen: React.FC<{
  multiplayerEngine: MultiplayerEngine;
  networkManager: NetworkManager;
  roomCode: string;
  playerName: string;
  onStartGame: () => void;
  onLeave: () => void;
  onOpenSetup?: () => void;
}> = ({ multiplayerEngine, networkManager, roomCode, playerName, onStartGame, onLeave, onOpenSetup }) => {
  const [players, setPlayers] = useState<Player[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionState>(ConnectionState.Disconnected);
  const [error, setError] = useState<string>('');

  // Set up event listeners
  useEffect(() => {
    // Update players when they join/leave
    const handlePlayerJoin = (player: Player) => {
      setPlayers(prev => [...prev, player]);
    };

    const handlePlayerLeave = (playerId: string) => {
      setPlayers(prev => prev.filter(p => p.id !== playerId));
    };

    const handleError = (err: any) => {
      setError(err.message || 'Connection error');
    };

    const updateConnectionStatus = () => {
      setConnectionStatus(networkManager.state);
    };

    multiplayerEngine.onPlayerJoinHandler(handlePlayerJoin);
    multiplayerEngine.onPlayerLeaveHandler(handlePlayerLeave);
    if (networkManager.onError) {
      networkManager.onError = handleError;
    }
    
    // Initial player list
    setPlayers(multiplayerEngine.getPlayers());
    updateConnectionStatus();

    // Listen for connection state changes
    const interval = setInterval(updateConnectionStatus, 1000);

    return () => {
      multiplayerEngine.onPlayerJoinHandler = (() => {}) as any;
      multiplayerEngine.onPlayerLeaveHandler = (() => {}) as any;
      networkManager.onError = null;
      clearInterval(interval);
    };
  }, [multiplayerEngine, networkManager]);

  const isHost = multiplayerEngine.isHost;
  const canStartGame = isHost && players.length >= 1;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-slate-800/95 border border-slate-700 rounded-2xl shadow-2xl p-8 backdrop-blur-sm">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-black text-white mb-2 tracking-wider">LOBBY</h1>
          <p className="text-slate-400 text-sm">Room Code: {roomCode}</p>
          <div className="flex items-center justify-center gap-2 mt-2">
            {connectionStatus === ConnectionState.Connected ? (
              <>
                <Wifi className="w-4 h-4 text-emerald-400" />
                <span className="text-emerald-400 text-sm">Connected</span>
              </>
            ) : (
              <>
                <WifiOff className="w-4 h-4 text-red-400" />
                <span className="text-red-400 text-sm">Connecting...</span>
              </>
            )}
          </div>
        </div>

        {error && (
          <div className="mb-6 p-3 bg-red-500/20 border border-red-500/50 rounded-lg">
            <p className="text-red-300 text-sm text-center">{error}</p>
          </div>
        )}

        <div className="mb-8">
          <h2 className="text-lg font-semibold text-slate-300 mb-4 flex items-center gap-2">
            <Users className="w-5 h-5" />
            Players ({players.length}/6)
          </h2>
          <div className="space-y-2">
            {players.map((player) => (
              <div
                key={player.id}
                className="flex items-center justify-between p-3 bg-slate-700/50 border border-slate-600 rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <span className={`font-medium ${player.id === networkManager.clientId ? 'text-amber-400' : 'text-white'}`}>
                    {player.name}
                  </span>
                  {player.isHost && (
                    <Crown className="w-4 h-4 text-amber-400" />
                  )}
                </div>
                <span className="text-sm text-slate-400">
                  {player.hp}HP
                </span>
              </div>
            ))}
            {players.length === 0 && (
              <div className="text-center py-4 text-slate-500">
                Waiting for players to join...
              </div>
            )}
          </div>
        </div>

        <div className="space-y-3">
          <button
            onClick={onLeave}
            className="w-full py-3 bg-slate-700/50 border border-slate-600 text-slate-300 font-medium rounded-lg hover:bg-slate-600 transition-colors"
          >
            <LogOut className="w-4 h-4 inline mr-2" />
            LEAVE LOBBY
          </button>
          
          {isHost && (
            <button
              onClick={onStartGame}
              disabled={!canStartGame}
              className="w-full py-3 bg-gradient-to-r from-green-600 to-emerald-600 text-white font-black tracking-wider rounded-lg hover:from-green-700 hover:to-emerald-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Play className="w-4 h-4 inline mr-2" />
              START GAME ({players.length} players)
            </button>
          )}
          {isHost && onOpenSetup && (
            <button
              onClick={onOpenSetup}
              className="w-full py-3 bg-slate-700/50 border border-slate-600 text-slate-300 font-medium rounded-lg hover:bg-slate-600 transition-colors"
            >
              MATCH SETUP (host only)
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export const InGameStatus: React.FC<{
  multiplayerEngine: MultiplayerEngine;
  networkManager: NetworkManager;
}> = ({ multiplayerEngine, networkManager }) => {
  const [players, setPlayers] = useState<Player[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionState>(ConnectionState.Disconnected);
  const [ping, setPing] = useState<number>(0);

  // Set up event listeners
  useEffect(() => {
    const handlePlayerJoin = (player: Player) => {
      setPlayers(prev => [...prev, player]);
    };

    const handlePlayerLeave = (playerId: string) => {
      setPlayers(prev => prev.filter(p => p.id !== playerId));
    };

    const handleError = (err: any) => {
      console.error('Network error:', err);
    };

    const updateConnectionStatus = () => {
      setConnectionStatus(networkManager.state);
    };

    multiplayerEngine.onPlayerJoinHandler(handlePlayerJoin);
    multiplayerEngine.onPlayerLeaveHandler(handlePlayerLeave);
    if (networkManager.onError) {
      networkManager.onError = handleError;
    }

    // Initial player list
    setPlayers(multiplayerEngine.getPlayers());
    updateConnectionStatus();

    // Simulate ping calculation (in real implementation, this would use actual ping times)
    const pingInterval = setInterval(() => {
      setPing(Math.floor(Math.random() * 50) + 20); // Random ping between 20-70ms
    }, 2000);

    const statusInterval = setInterval(updateConnectionStatus, 1000);

    return () => {
      multiplayerEngine.onPlayerJoinHandler = (() => {}) as any;
      multiplayerEngine.onPlayerLeaveHandler = (() => {}) as any;
      networkManager.onError = null;
      clearInterval(pingInterval);
      clearInterval(statusInterval);
    };
  }, [multiplayerEngine, networkManager]);

  const isHost = multiplayerEngine.isHost;

  return (
    <div className="absolute top-4 right-4 z-50 bg-slate-800/95 border border-slate-700 rounded-xl shadow-2xl p-4 backdrop-blur-sm max-w-xs">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">Players</h3>
        <div className="flex items-center gap-1">
          {connectionStatus === ConnectionState.Connected ? (
            <Wifi className="w-3 h-3 text-emerald-400" />
          ) : (
            <WifiOff className="w-3 h-3 text-red-400" />
          )}
          <span className="text-xs text-slate-400">{ping}ms</span>
        </div>
      </div>

      <div className="space-y-2">
        {players.map((player) => (
          <div
            key={player.id}
            className="flex items-center justify-between text-xs"
          >
            <div className="flex items-center gap-2">
              <span className={`font-medium ${player.id === networkManager.clientId ? 'text-amber-400' : 'text-white'}`}>
                {player.name}
              </span>
              {player.isHost && (
                <Crown className="w-3 h-3 text-amber-400" />
              )}
            </div>
            <span className="text-slate-400">
              {Math.floor(player.hp)}HP
            </span>
          </div>
        ))}
      </div>

      {players.length === 0 && (
        <div className="text-center py-2 text-slate-500 text-xs">
          No players connected
        </div>
      )}
    </div>
  );
};

// Main MultiplayerUI component that manages state and renders appropriate screens
export const MultiplayerUI: React.FC<MultiplayerUIProps> = ({
  multiplayerEngine,
  networkManager,
  onBackToMenu,
  onStartGame,
  matchConfig,
  onUpdateMatchConfig,
}) => {
  const [screen, setScreen] = useState<'menu' | 'host' | 'join' | 'lobby' | 'setup' | 'game'>('menu');
  const [roomCode, setRoomCode] = useState<string>('');
  const [playerName, setPlayerName] = useState<string>('Player');
  const [error, setError] = useState<string>('');

  const handleRoomCreated = useCallback((code: string) => {
    setRoomCode(code);
    setScreen('lobby');
  }, []);

  const handleJoined = useCallback((code: string) => {
    setRoomCode(code);
    setScreen('lobby');
  }, []);

  const handleStartGame = useCallback(() => {
    if (onStartGame) {
      onStartGame();
    }
    setScreen('game');
  }, [onStartGame]);

  const handleLeave = useCallback(() => {
    multiplayerEngine.disconnect();
    setScreen('menu');
    if (onBackToMenu) {
      onBackToMenu();
    }
  }, [multiplayerEngine, onBackToMenu]);

  const renderScreen = () => {
    switch (screen) {
      case 'host':
        return (
          <HostScreen
            multiplayerEngine={multiplayerEngine}
            networkManager={networkManager}
            playerName={playerName}
            onNameChange={setPlayerName}
            onRoomCreated={handleRoomCreated}
          />
        );
      case 'join':
        return (
          <JoinScreen
            multiplayerEngine={multiplayerEngine}
            networkManager={networkManager}
            playerName={playerName}
            onNameChange={setPlayerName}
            onJoined={handleJoined}
            onBack={() => setScreen('menu')}
          />
        );
      case 'lobby':
        return (
          <LobbyScreen
            multiplayerEngine={multiplayerEngine}
            networkManager={networkManager}
            roomCode={roomCode}
            playerName={playerName}
            onStartGame={handleStartGame}
            onLeave={handleLeave}
            onOpenSetup={() => setScreen('setup')}
          />
        );
      case 'setup':
        if (!matchConfig) return null;
        return (
          <GameSetupScreen
            config={matchConfig}
            onUpdateConfig={(cfg) => onUpdateMatchConfig?.(cfg)}
            onContinueToLoadout={() => setScreen('lobby')}
            onBackToMenu={() => setScreen('lobby')}
          />
        );
      case 'game':
        return <InGameStatus multiplayerEngine={multiplayerEngine} networkManager={networkManager} />;
      default:
        return (
          <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center p-4">
            <div className="w-full max-w-md bg-slate-800/95 border border-slate-700 rounded-2xl shadow-2xl p-8 backdrop-blur-sm">
              <div className="text-center mb-8">
                <h1 className="text-3xl font-black text-white mb-2 tracking-wider">MULTIPLAYER</h1>
                <p className="text-slate-400 text-sm">Choose game mode</p>
              </div>

              <div className="space-y-4">
                <button
                  onClick={() => setScreen('host')}
                  className="w-full py-4 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-black tracking-wider rounded-lg hover:from-purple-700 hover:to-pink-700 transition-all"
                >
                  HOST GAME
                </button>
                <button
                  onClick={() => setScreen('join')}
                  className="w-full py-4 bg-gradient-to-r from-blue-600 to-cyan-600 text-white font-black tracking-wider rounded-lg hover:from-blue-700 hover:to-cyan-700 transition-all"
                >
                  JOIN GAME
                </button>
                <button
                  onClick={onBackToMenu}
                  className="w-full py-4 bg-slate-700/50 border border-slate-600 text-slate-300 font-medium rounded-lg hover:bg-slate-600 transition-colors"
                >
                  BACK TO MENU
                </button>
              </div>
            </div>
          </div>
        );
    }
  };

  return renderScreen();
};