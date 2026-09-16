import test from 'node:test';
import assert from 'node:assert/strict';
import { connectGoogle } from '../../sidepanel/google-connect.js';

test('connectGoogle requests an interactive token without persisting it', async () => {
  const calls = [];
  const auth = {
    async getToken(options) {
      calls.push(options);
      return 'temporary-token';
    }
  };

  const result = await connectGoogle({ auth });

  assert.deepEqual(calls, [{ interactive: true }]);
  assert.deepEqual(result, { ok: true });
});
