import test from 'node:test';
import assert from 'node:assert/strict';
import { formatKillfeed } from './killfeed';

test('killfeed reads killer killed victim', () => {
  assert.equal(formatKillfeed({ killer: 'Viper', victim: 'You' }), 'Viper killed You');
});
