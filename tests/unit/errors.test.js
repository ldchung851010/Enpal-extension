import test from 'node:test';
import assert from 'node:assert/strict';
import { EnpalError, ERROR_CODES } from '../../core/errors.js';

test('exports structured runtime and workspace error codes', () => {
  assert.deepEqual(ERROR_CODES, {
    SETUP_REQUIRED: 'SETUP_REQUIRED',
    CONSISTENCY_ERROR: 'CONSISTENCY_ERROR',
    WRONG_CHAT: 'WRONG_CHAT',
    MASK_REQUIRED: 'MASK_REQUIRED',
    SHEET_READ_FAILED: 'SHEET_READ_FAILED',
    SHEET_WRITE_UNVERIFIED: 'SHEET_WRITE_UNVERIFIED',
    VOICE_START_FAILED: 'VOICE_START_FAILED',
    VOICE_STOP_FAILED: 'VOICE_STOP_FAILED',
    CHAT_UI_UNAVAILABLE: 'CHAT_UI_UNAVAILABLE',
    WORKSPACE_NOT_FOUND: 'WORKSPACE_NOT_FOUND',
    WORKSPACE_NOT_READY: 'WORKSPACE_NOT_READY',
    WORKSPACE_LOCKED: 'WORKSPACE_LOCKED',
    WORKSPACE_SOURCE_CONFLICT: 'WORKSPACE_SOURCE_CONFLICT'
  });
});

test('structured errors preserve code and recoverability', () => {
  const error = new EnpalError(
    ERROR_CODES.WORKSPACE_NOT_READY,
    'workspace is still a draft',
    true
  );
  assert.equal(error.name, 'EnpalError');
  assert.equal(error.message, 'workspace is still a draft');
  assert.equal(error.code, 'WORKSPACE_NOT_READY');
  assert.equal(error.recoverable, true);
  assert.ok(error instanceof Error);
});
