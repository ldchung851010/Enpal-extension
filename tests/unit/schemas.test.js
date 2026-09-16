import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SESSION_STATES, NEXT_SESSION_STATES, PIPELINE_PHASES
} from '../../core/state.js';
import {
  SESSION_COLUMNS, TARGET_BANK_COLUMNS, CURRICULUM_COLUMNS, NEXT_SESSION_KEYS
} from '../../core/schemas.js';

test('locks the three independent state machines', () => {
  assert.deepEqual(SESSION_STATES, [
    'STARTING','IN_PROGRESS','PAUSED','PROCESSING','COMPLETED','ERROR'
  ]);
  assert.deepEqual(NEXT_SESSION_STATES, ['READY','CONSUMED','PREPARING']);
  assert.equal(PIPELINE_PHASES.at(-1), 'DONE');
});

test('session schema separates lifecycle and analysis fields', () => {
  assert(SESSION_COLUMNS.includes('chat_url'));
  assert(SESSION_COLUMNS.includes('analysis_status'));
  assert(TARGET_BANK_COLUMNS.includes('target_id'));
  assert(CURRICULUM_COLUMNS.includes('sequence'));
  assert(NEXT_SESSION_KEYS.includes('mask_policy'));
});
