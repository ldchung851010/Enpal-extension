import test from 'node:test';
import assert from 'node:assert/strict';
import { createGoogleAuth } from '../../storage/google-auth.js';

test('authorizedFetch attaches bearer token', async () => {
  const calls = [];
  const chromeApi = {
    identity: { getAuthToken: async () => ({token:'abc'}) }
  };
  const auth = createGoogleAuth({
    chromeApi,
    fetchImpl: async (url, opts) => {
      calls.push(opts.headers.Authorization);
      return new Response('{}', {status:200});
    }
  });
  await auth.authorizedFetch('https://www.googleapis.com/drive/v3/files');
  assert.deepEqual(calls, ['Bearer abc']);
});

test('authorizedFetch invalidates a 401 token and retries exactly once', async () => {
  const tokenRequests = [];
  const invalidated = [];
  const authHeaders = [];
  const responses = [
    new Response('{}', {status:401}),
    new Response('{}', {status:200})
  ];
  const chromeApi = {
    identity: {
      async getAuthToken(details) {
        tokenRequests.push(details);
        return {token: tokenRequests.length === 1 ? 'old-token' : 'new-token'};
      },
      async removeCachedAuthToken(details) {
        invalidated.push(details.token);
      }
    }
  };
  const auth = createGoogleAuth({
    chromeApi,
    fetchImpl: async (_url, opts) => {
      authHeaders.push(opts.headers.Authorization);
      return responses.shift();
    }
  });

  const response = await auth.authorizedFetch('https://sheets.googleapis.com/v4/spreadsheets/x');
  assert.equal(response.status, 200);
  assert.deepEqual(authHeaders, ['Bearer old-token', 'Bearer new-token']);
  assert.deepEqual(invalidated, ['old-token']);
  assert.equal(tokenRequests.length, 2);
});
