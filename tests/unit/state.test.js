import test from 'node:test';
import assert from 'node:assert/strict';
import { APP_STATES } from '../../core/state.js';

test('exports the five locked app states', () => {
  assert.deepEqual(APP_STATES, [
    'READY', 'LEARNING', 'PAUSED', 'PROCESSING', 'ERROR'
  ]);
});
