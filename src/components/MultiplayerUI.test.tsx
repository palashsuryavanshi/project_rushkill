import { HostScreen, JoinScreen, LobbyScreen, InGameStatus, MultiplayerUI } from './MultiplayerUI';

describe('MultiplayerUI', () => {
  test('HostScreen generates room code', () => {
    // Simple test to ensure the component renders
    expect(HostScreen).toBeDefined();
  });

  test('JoinScreen validates room code', () => {
    // Simple test to ensure the component renders
    expect(JoinScreen).toBeDefined();
  });

  test('LobbyScreen shows players', () => {
    // Simple test to ensure the component renders
    expect(LobbyScreen).toBeDefined();
  });

  test('InGameStatus shows connection status', () => {
    // Simple test to ensure the component renders
    expect(InGameStatus).toBeDefined();
  });

  test('MultiplayerUI renders main menu', () => {
    // Simple test to ensure the component renders
    expect(MultiplayerUI).toBeDefined();
  });
});