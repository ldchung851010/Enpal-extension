import test from 'node:test';
import assert from 'node:assert/strict';
import { EnpalError, ERROR_CODES } from '../../core/errors.js';

test('exports the approved structured runtime error codes', () => {
  assert.deepEqual(ERROR_CODES, {
    SETUP_REQUIRED: 'SETUP_REQUIRED',
    CONSISTENCY_ERROR: 'CONSISTENCY_ERROR',
    WRONG_CHAT: 'WRONG_CHAT',
    MASK_REQUIRED: 'MASK_REQUIRED',
    SHEET_READ_FAILED: 'SHEET_READ_FAILED',
    SHEET_WRITE_UNVERIFIED: 'SHEET_WRITE_UNVERIFIED',
    VOICE_START_FAILED: 'VOICE_START_FAILED',
    VOICE_STOP_FAILED: 'VOICE_STOP_FAILED',
    CHAT_UI_UNAVAILABLE: 'CHAT_UI_UNAVAILABLE'
  });
});

test('structured errors preserve code and recoverability', () => {
  const error = new EnpalError(
    ERROR_CODES.SHEET_WRITE_UNVERIFIED,
    'write failed',
    true
  );
  assert.equal(error.name, 'EnpalError');
  assert.equal(error.message, 'write failed');
  assert.equal(error.code, 'SHEET_WRITE_UNVERIFIED');
  assert.equal(error.recoverable, true);
  assert.ok(error instanceof Error);
});
