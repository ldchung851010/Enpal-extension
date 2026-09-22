import http from 'node:http';
import { createHash, randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';

const DEFAULT_SCOPE = 'https://www.googleapis.com/auth/spreadsheets';
const DEFAULT_AUTH_URI = 'https://accounts.google.com/o/oauth2/v2/auth';
const DEFAULT_TOKEN_URI = 'https://oauth2.googleapis.com/token';

function base64Url(buffer) {
  return buffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function pkceChallenge(verifier) {
  return base64Url(createHash('sha256').update(verifier).digest());
}

function normalizeClientConfig(raw) {
  const source = raw?.installed ?? raw?.web ?? raw;
  const clientId = String(source?.client_id ?? '').trim();
  const clientSecret = String(source?.client_secret ?? '').trim();

  if (!clientId) {
    throw new Error('Google OAuth client_id is missing');
  }

  return {
    clientId,
    clientSecret,
    authUri: String(source?.auth_uri || DEFAULT_AUTH_URI),
    tokenUri: String(source?.token_uri || DEFAULT_TOKEN_URI)
  };
}

async function readJson(filePath, { optional = false } = {}) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch (error) {
    if (optional && error?.code === 'ENOENT') return null;
    throw error;
  }
}

async function writeJsonAtomic(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = filePath + '.tmp-' + process.pid;
  await writeFile(tempPath, JSON.stringify(value, null, 2) + '\n', 'utf8');
  await rename(tempPath, filePath);
}

function defaultOpenBrowser(url) {
  let child;
  if (process.platform === 'win32') {
    child = spawn('cmd.exe', ['/c', 'start', '', url], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true
    });
  } else if (process.platform === 'darwin') {
    child = spawn('open', [url], {
      detached: true,
      stdio: 'ignore'
    });
  } else {
    child = spawn('xdg-open', [url], {
      detached: true,
      stdio: 'ignore'
    });
  }
  child.unref();
}

async function postToken(fetchImpl, tokenUri, fields) {
  const response = await fetchImpl(tokenUri, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams(fields)
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || typeof data?.access_token !== 'string') {
    const description = data?.error_description || data?.error || response.status;
    throw new Error('Google OAuth token exchange failed: ' + description);
  }
  return data;
}

function tokenWithExpiry(data, previous, nowMs) {
  const expiresIn = Number(data.expires_in);
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token || previous?.refresh_token || '',
    token_type: data.token_type || previous?.token_type || 'Bearer',
    scope: data.scope || previous?.scope || DEFAULT_SCOPE,
    expires_at: Number.isFinite(expiresIn)
      ? nowMs + Math.max(0, expiresIn) * 1000
      : nowMs + 3_000_000
  };
}

export function createGoogleOAuthTokenProvider({
  credentialsPath = '.enpal/google-oauth-client.json',
  tokenPath = '.enpal/google-token.json',
  fetchImpl = fetch,
  now = () => Date.now(),
  openBrowser = defaultOpenBrowser,
  callbackTimeoutMs = 180_000
} = {}) {
  const resolvedCredentialsPath = path.resolve(credentialsPath);
  const resolvedTokenPath = path.resolve(tokenPath);

  async function credentials() {
    return normalizeClientConfig(
      await readJson(resolvedCredentialsPath)
    );
  }

  async function refresh(existing) {
    const client = await credentials();
    if (!existing?.refresh_token) {
      throw new Error('Google OAuth refresh_token is unavailable');
    }

    const data = await postToken(fetchImpl, client.tokenUri, {
      client_id: client.clientId,
      client_secret: client.clientSecret,
      refresh_token: existing.refresh_token,
      grant_type: 'refresh_token'
    });

    const token = tokenWithExpiry(data, existing, now());
    await writeJsonAtomic(resolvedTokenPath, token);
    return token.access_token;
  }

  async function authorizeInteractive() {
    const client = await credentials();
    const verifier = base64Url(randomBytes(48));
    const challenge = pkceChallenge(verifier);
    const state = base64Url(randomBytes(24));

    let server;
    let timer;

    const codePromise = new Promise((resolve, reject) => {
      server = http.createServer((request, response) => {
        try {
          const callback = new URL(
            request.url || '/',
            'http://127.0.0.1'
          );

          if (callback.pathname !== '/oauth2/callback') {
            response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
            response.end('Not found');
            return;
          }

          if (callback.searchParams.get('state') !== state) {
            response.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
            response.end('OAuth state mismatch. You may close this window.');
            reject(new Error('Google OAuth state mismatch'));
            return;
          }

          const oauthError = callback.searchParams.get('error');
          if (oauthError) {
            response.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
            response.end('Google authorization was not completed. You may close this window.');
            reject(new Error('Google OAuth authorization failed: ' + oauthError));
            return;
          }

          const code = callback.searchParams.get('code');
          if (!code) {
            response.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
            response.end('Missing authorization code. You may close this window.');
            reject(new Error('Google OAuth callback did not contain an authorization code'));
            return;
          }

          response.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
          response.end('EnPal Google authorization completed. You may close this window.');
          resolve(code);
        } catch (error) {
          reject(error);
        }
      });

      server.on('error', reject);
    });

    await new Promise((resolve, reject) => {
      server.listen(0, '127.0.0.1', () => resolve());
      server.once('error', reject);
    });

    const address = server.address();
    if (!address || typeof address === 'string') {
      server.close();
      throw new Error('Could not allocate local OAuth callback port');
    }

    const redirectUri =
      'http://127.0.0.1:' + address.port + '/oauth2/callback';

    const authUrl = new URL(client.authUri);
    authUrl.searchParams.set('client_id', client.clientId);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', DEFAULT_SCOPE);
    authUrl.searchParams.set('access_type', 'offline');
    authUrl.searchParams.set('prompt', 'consent');
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('code_challenge', challenge);
    authUrl.searchParams.set('code_challenge_method', 'S256');

    timer = setTimeout(() => {
      server.close();
    }, callbackTimeoutMs);

    try {
      await Promise.resolve(openBrowser(authUrl.toString()));

      const code = await Promise.race([
        codePromise,
        new Promise((_, reject) => {
          setTimeout(
            () => reject(new Error('Google OAuth callback timed out')),
            callbackTimeoutMs
          );
        })
      ]);

      const data = await postToken(fetchImpl, client.tokenUri, {
        client_id: client.clientId,
        client_secret: client.clientSecret,
        code,
        code_verifier: verifier,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code'
      });

      const token = tokenWithExpiry(data, null, now());
      if (!token.refresh_token) {
        throw new Error(
          'Google authorization did not return a refresh_token; revoke the prior app grant and authorize again'
        );
      }

      await writeJsonAtomic(resolvedTokenPath, token);
      return token.access_token;
    } finally {
      clearTimeout(timer);
      await new Promise(resolve => server.close(() => resolve())).catch(() => {});
    }
  }

  return {
    credentialsPath: resolvedCredentialsPath,
    tokenPath: resolvedTokenPath,

    async getAccessToken({ interactive = false } = {}) {
      const existing = await readJson(resolvedTokenPath, { optional: true });
      const nowMs = now();

      if (
        typeof existing?.access_token === 'string' &&
        existing.access_token &&
        Number(existing.expires_at) > nowMs + 60_000
      ) {
        return existing.access_token;
      }

      if (existing?.refresh_token) {
        return refresh(existing);
      }

      if (interactive) {
        return authorizeInteractive();
      }

      throw new Error(
        'Google authorization is required. Run the EnPal Google auth command once.'
      );
    },

    authorizeInteractive
  };
}

export const GOOGLE_SHEETS_SCOPE = DEFAULT_SCOPE;
