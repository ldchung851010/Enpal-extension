import test from 'node:test';
import assert from 'node:assert/strict';
import { getGoogleAccessToken } from '../../storage/google-auth.js';

test('requests non-interactive token during normal runtime', async () => {
  let received;
  const chromeApi = {
    identity: {
      async getAuthToken(options) {
        received = options;
        return { token: 'abc' };
      }
    }
  };

  assert.equal(await getGoogleAccessToken(chromeApi, false), 'abc');
  assert.deepEqual(received, { interactive: false });
});

test('fails clearly when Chrome Identity returns no token', async () => {
  const chromeApi = {
    identity: {
      async getAuthToken() {
        return {};
      }
    }
  };

  await assert.rejects(
    getGoogleAccessToken(chromeApi, false),
    /Google OAuth token unavailable/
  );
});
