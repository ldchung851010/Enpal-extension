import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';

import {
  createGoogleOAuthTokenProvider,
  GOOGLE_SHEETS_SCOPE
} from '../../playwright/google-oauth.js';

async function tempOAuth(t) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'enpal-oauth-'));
  t.after(async () => rm(dir, { recursive: true, force: true }));

  const credentialsPath = path.join(dir, 'client.json');
  const tokenPath = path.join(dir, 'token.json');

  await writeFile(
    credentialsPath,
    JSON.stringify({
      installed: {
        client_id: 'desktop-client.apps.googleusercontent.com',
        client_secret: 'desktop-secret',
        auth_uri: 'https://accounts.example.test/auth',
        token_uri: 'https://accounts.example.test/token'
      }
    }),
    'utf8'
  );

  return { dir, credentialsPath, tokenPath };
}

test('Google OAuth provider returns an unexpired cached access token without network access', async t => {
  const files = await tempOAuth(t);
  const now = 1_000_000;

  await writeFile(
    files.tokenPath,
    JSON.stringify({
      access_token: 'cached-access',
      refresh_token: 'refresh',
      expires_at: now + 120_000
    }),
    'utf8'
  );

  const provider = createGoogleOAuthTokenProvider({
    credentialsPath: files.credentialsPath,
    tokenPath: files.tokenPath,
    now: () => now,
    fetchImpl: async () => {
      throw new Error('network should not be used');
    }
  });

  assert.equal(
    await provider.getAccessToken(),
    'cached-access'
  );
});

test('Google OAuth provider refreshes an expired token and preserves refresh_token', async t => {
  const files = await tempOAuth(t);
  const now = 2_000_000;

  await writeFile(
    files.tokenPath,
    JSON.stringify({
      access_token: 'expired',
      refresh_token: 'refresh-123',
      expires_at: now - 1
    }),
    'utf8'
  );

  let request;
  const provider = createGoogleOAuthTokenProvider({
    credentialsPath: files.credentialsPath,
    tokenPath: files.tokenPath,
    now: () => now,
    fetchImpl: async (url, options) => {
      request = {
        url,
        body: Object.fromEntries(options.body.entries())
      };
      return {
        ok: true,
        async json() {
          return {
            access_token: 'refreshed-access',
            expires_in: 3600,
            token_type: 'Bearer'
          };
        }
      };
    }
  });

  assert.equal(
    await provider.getAccessToken(),
    'refreshed-access'
  );

  assert.equal(request.url, 'https://accounts.example.test/token');
  assert.deepEqual(request.body, {
    client_id: 'desktop-client.apps.googleusercontent.com',
    client_secret: 'desktop-secret',
    refresh_token: 'refresh-123',
    grant_type: 'refresh_token'
  });

  const stored = JSON.parse(await readFile(files.tokenPath, 'utf8'));
  assert.equal(stored.refresh_token, 'refresh-123');
  assert.equal(stored.access_token, 'refreshed-access');
  assert.equal(stored.expires_at, now + 3_600_000);
});

test('interactive Google OAuth uses loopback PKCE and stores refresh token', async t => {
  const files = await tempOAuth(t);
  const now = 3_000_000;
  let authorizationUrl;
  let tokenBody;

  const provider = createGoogleOAuthTokenProvider({
    credentialsPath: files.credentialsPath,
    tokenPath: files.tokenPath,
    now: () => now,
    callbackTimeoutMs: 5_000,
    openBrowser: async url => {
      authorizationUrl = new URL(url);
      const callback = new URL(
        authorizationUrl.searchParams.get('redirect_uri')
      );
      callback.searchParams.set(
        'state',
        authorizationUrl.searchParams.get('state')
      );
      callback.searchParams.set('code', 'authorization-code');

      const response = await fetch(callback);
      assert.equal(response.status, 200);
    },
    fetchImpl: async (url, options) => {
      assert.equal(url, 'https://accounts.example.test/token');
      tokenBody = Object.fromEntries(options.body.entries());
      return {
        ok: true,
        async json() {
          return {
            access_token: 'interactive-access',
            refresh_token: 'interactive-refresh',
            expires_in: 3600,
            token_type: 'Bearer',
            scope: GOOGLE_SHEETS_SCOPE
          };
        }
      };
    }
  });

  assert.equal(
    await provider.authorizeInteractive(),
    'interactive-access'
  );

  assert.equal(
    authorizationUrl.searchParams.get('scope'),
    GOOGLE_SHEETS_SCOPE
  );
  assert.equal(
    authorizationUrl.searchParams.get('code_challenge_method'),
    'S256'
  );
  assert.match(
    authorizationUrl.searchParams.get('redirect_uri'),
    /^http:\/\/127\.0\.0\.1:\d+\/oauth2\/callback$/
  );

  assert.equal(tokenBody.code, 'authorization-code');
  assert.equal(tokenBody.grant_type, 'authorization_code');
  assert.ok(tokenBody.code_verifier);

  const stored = JSON.parse(await readFile(files.tokenPath, 'utf8'));
  assert.equal(stored.access_token, 'interactive-access');
  assert.equal(stored.refresh_token, 'interactive-refresh');
});

test('non-interactive token request fails clearly before authorization exists', async t => {
  const files = await tempOAuth(t);
  const provider = createGoogleOAuthTokenProvider({
    credentialsPath: files.credentialsPath,
    tokenPath: files.tokenPath
  });

  await assert.rejects(
    provider.getAccessToken(),
    /Google authorization is required/
  );
});
