import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isJoinMessage,
  isInputMessage,
  isStateMessage,
  isJoinedMessage,
  isLeftMessage,
  isHostMigratedMessage,
  isErrorMessage,
  isClientMessage,
  isServerMessage,
} from './NetworkTypes';
import type {
  JoinMessage,
  InputMessage,
  StateMessage,
  JoinedMessage,
  LeftMessage,
  HostMigratedMessage,
  ErrorMessage,
  NetworkEntity,
  ClientMessage,
  ServerMessage,
  Message,
  ErrorCode,
} from './NetworkTypes';

test('message types compile and discriminate by type field', () => {
  const join: JoinMessage = { type: 'join', room: 'ABC123', name: 'Player', id: '1' };
  const input: InputMessage = { type: 'input', seq: 1, yaw: 0, pitch: 0, keys: {}, fire: false };
  const state: StateMessage = { type: 'state', tick: 100, entities: [] };

  const messages: Message[] = [join, input, state];
  messages.forEach(m => {
    if (m.type === 'join') {
      // TypeScript narrows to JoinMessage here
      console.log(m.room);
    }
  });
});

test('all client message types are assignable to ClientMessage', () => {
  const join: ClientMessage = { type: 'join', room: 'ABC123', name: 'Player', id: '1' };
  const input: ClientMessage = { type: 'input', seq: 1, yaw: 0, pitch: 0, keys: {}, fire: false };
  const state: ClientMessage = { type: 'state', tick: 100, entities: [] };

  // Should not error
  assert.ok(join.type === 'join');
  assert.ok(input.type === 'input');
  assert.ok(state.type === 'state');
});

test('all server message types are assignable to ServerMessage', () => {
  const joined: ServerMessage = { type: 'joined', id: '1', name: 'Player' };
  const left: ServerMessage = { type: 'left', id: '1' };
  const hostMigrated: ServerMessage = { type: 'host-migrated', newHost: '2' };
  const error: ServerMessage = { type: 'error', code: 'MISSING_ROOM', message: 'Room required' };
  const relayedInput: ServerMessage = { type: 'input', seq: 1, yaw: 0, pitch: 0, keys: {}, fire: false, id: '1' };
  const relayedState: ServerMessage = { type: 'state', tick: 100, entities: [], id: '1' };

  assert.ok(joined.type === 'joined');
  assert.ok(left.type === 'left');
  assert.ok(hostMigrated.type === 'host-migrated');
  assert.ok(error.type === 'error');
  assert.ok(relayedInput.type === 'input');
  assert.ok(relayedState.type === 'state');
});

test('NetworkEntity has correct structure', () => {
  const entity: NetworkEntity = {
    id: 'player1',
    x: 10,
    y: 5,
    z: -20,
    yaw: 1.57,
    pitch: 0.3,
    hp: 100,
  };

  assert.equal(entity.id, 'player1');
  assert.equal(entity.x, 10);
  assert.equal(entity.y, 5);
  assert.equal(entity.z, -20);
  assert.equal(entity.yaw, 1.57);
  assert.equal(entity.pitch, 0.3);
  assert.equal(entity.hp, 100);
});

test('NetworkEntity hp is optional', () => {
  const entity: NetworkEntity = {
    id: 'player1',
    x: 0,
    y: 0,
    z: 0,
    yaw: 0,
    pitch: 0,
  };

  assert.equal(entity.hp, undefined);
});

test('ErrorCode type includes all required codes', () => {
  const codes: ErrorCode[] = [
    'MISSING_ROOM',
    'NOT_JOINED',
    'NOT_HOST',
    'VALIDATION_ERROR',
    'INVALID_JSON',
    'RATE_LIMIT_EXCEEDED',
    'INTERNAL_ERROR',
  ];

  assert.equal(codes.length, 7);
  codes.forEach(code => {
    const error: ErrorMessage = { type: 'error', code, message: 'test' };
    assert.equal(error.code, code);
  });
});

test('optional fields in JoinMessage are truly optional', () => {
  const minimal: JoinMessage = { type: 'join' };
  const withRoom: JoinMessage = { type: 'join', room: 'ABC123' };
  const withName: JoinMessage = { type: 'join', name: 'Player' };
  const withId: JoinMessage = { type: 'join', id: 'client-123' };

  assert.equal(minimal.type, 'join');
  assert.equal(withRoom.room, 'ABC123');
  assert.equal(withName.name, 'Player');
  assert.equal(withId.id, 'client-123');
});

test('optional id in relayed InputMessage and StateMessage', () => {
  const inputNoId: InputMessage = { type: 'input', seq: 1, yaw: 0, pitch: 0, keys: {}, fire: false };
  const inputWithId: InputMessage = { type: 'input', seq: 1, yaw: 0, pitch: 0, keys: {}, fire: false, id: 'player1' };
  const stateNoId: StateMessage = { type: 'state', tick: 100, entities: [] };
  const stateWithId: StateMessage = { type: 'state', tick: 100, entities: [], id: 'host1' };

  assert.equal(inputNoId.id, undefined);
  assert.equal(inputWithId.id, 'player1');
  assert.equal(stateNoId.id, undefined);
  assert.equal(stateWithId.id, 'host1');
});

test('type guards work correctly', () => {

  const join: Message = { type: 'join', room: 'ABC123' };
  const input: Message = { type: 'input', seq: 1, yaw: 0, pitch: 0, keys: {}, fire: false };
  const state: Message = { type: 'state', tick: 100, entities: [] };
  const joined: Message = { type: 'joined', id: '1', name: 'Player' };
  const left: Message = { type: 'left', id: '1' };
  const hostMigrated: Message = { type: 'host-migrated', newHost: '2' };
  const error: Message = { type: 'error', code: 'MISSING_ROOM', message: 'test' };

  assert.ok(isClientMessage(join));
  assert.ok(isClientMessage(input));
  assert.ok(isClientMessage(state));
  assert.ok(!isClientMessage(joined));
  assert.ok(!isClientMessage(left));
  assert.ok(!isClientMessage(hostMigrated));
  assert.ok(!isClientMessage(error));

  assert.ok(isServerMessage(joined));
  assert.ok(isServerMessage(left));
  assert.ok(isServerMessage(hostMigrated));
  assert.ok(isServerMessage(error));
  assert.ok(!isServerMessage(join));
  assert.ok(!isServerMessage(input));
  assert.ok(!isServerMessage(state));

  assert.ok(isJoinMessage(join));
  assert.ok(isInputMessage(input));
  assert.ok(isStateMessage(state));
  assert.ok(isJoinedMessage(joined));
  assert.ok(isLeftMessage(left));
  assert.ok(isHostMigratedMessage(hostMigrated));
  assert.ok(isErrorMessage(error));
});