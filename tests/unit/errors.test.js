import test from 'node:test';
import assert from 'node:assert/strict';
import { EnpalError, ERROR_CODES } from '../../core/errors.js';

test('structured errors preserve code and recoverability', () => {
  const error = new EnpalError(ERROR_CODES.SHEET_WRITE_UNVERIFIED, 'write failed', true);
  assert.equal(error.code, 'SHEET_WRITE_UNVERIFIED');
  assert.equal(error.recoverable, true);
});
