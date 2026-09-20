import test from 'node:test';
import assert from 'node:assert/strict';
import {
  APP_STATES,
  SESSION_STATES,
  PIPELINE_PHASES
} from '../../core/state.js';

test('exports approved app states', () => {
  assert.deepEqual(APP_STATES, [
    'SETUP_REQUIRED', 'READY', 'LEARNING', 'PAUSED', 'PROCESSING', 'ERROR'
  ]);
});

test('exports non-terminal session states used by one-active-session invariant', () => {
  assert.deepEqual(SESSION_STATES, [
    'STARTING', 'IN_PROGRESS', 'PAUSED', 'PROCESSING', 'COMPLETED', 'ERROR'
  ]);
});

test('exports durable pipeline phases in approved order', () => {
  assert.deepEqual(PIPELINE_PHASES, [
    'SESSION_STUB_CREATED',
    'CHAT_BOUND',
    'PAUSE_COMMITTED',
    'ANALYZE_COMMITTED',
    'UPDATE_COMMITTED',
    'BRIEF_STAGED',
    'BRIEF_PROMOTED',
    'SESSION_COMPLETED'
  ]);
});
