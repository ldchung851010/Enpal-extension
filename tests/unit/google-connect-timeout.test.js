import test from 'node:test';
import assert from 'node:assert/strict';
import { connectGoogle } from '../../sidepanel/google-connect.js';

test('connectGoogle fails with a clear timeout instead of hanging forever', async () => {
  const auth = {
    getToken() {
      return new Promise(() => {});
    }
  };

  await assert.rejects(
    () => connectGoogle({ auth, timeoutMs: 10 }),
    /Google authorization did not return to EnPal/
  );
});
