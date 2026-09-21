import test from 'node:test';
import assert from 'node:assert/strict';
import {
  APP_STATES,
  WORKSPACE_CONFIG_STATES,
  SESSION_STATES,
  PIPELINE_PHASES,
  ACTIVE_SESSION_STATES,
  WORKSPACE_SWITCH_BLOCKING_APP_STATES,
  WORKSPACE_RUNTIME_IDENTITY_LOCKING_SESSION_STATES
} from '../../core/state.js';

test('exports approved app states', () => {
  assert.deepEqual(APP_STATES, [
    'SETUP_REQUIRED', 'READY', 'LEARNING', 'PAUSED', 'PROCESSING', 'ERROR'
  ]);
});

test('exports workspace configuration states separately from learner app state', () => {
  assert.deepEqual(WORKSPACE_CONFIG_STATES, ['DRAFT', 'COMPLETE']);
});

test('exports approved session lifecycle states', () => {
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

test('one-active-session invariant is evaluated from the non-terminal states per workspace', () => {
  assert.deepEqual(ACTIVE_SESSION_STATES, [
    'STARTING', 'IN_PROGRESS', 'PAUSED', 'PROCESSING'
  ]);
});

test('workspace switching is blocked only while the selected workspace is learning or processing', () => {
  assert.deepEqual(WORKSPACE_SWITCH_BLOCKING_APP_STATES, [
    'LEARNING', 'PROCESSING'
  ]);
});

test('runtime identity cannot be edited while a workspace owns a non-terminal session', () => {
  assert.deepEqual(WORKSPACE_RUNTIME_IDENTITY_LOCKING_SESSION_STATES, [
    'STARTING', 'IN_PROGRESS', 'PAUSED', 'PROCESSING'
  ]);
});
