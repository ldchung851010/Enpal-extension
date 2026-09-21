import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';

import { attachToChrome } from '../../playwright/browser-session.js';

async function waitForCdp(endpoint, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;

  do {
    try {
      const response = await fetch(endpoint + '/json/version');
      if (response.ok) return;
    } catch {
      // Browser is still starting.
    }

    await new Promise(resolve => setTimeout(resolve, 100));
  } while (Date.now() < deadline);

  throw new Error('Timed out waiting for external Chromium CDP endpoint');
}

test('attachToChrome opens an isolated tab and disconnects without killing external Chromium', async () => {
  const profileDir = await mkdtemp(
    path.join(os.tmpdir(), 'enpal-cdp-test-')
  );

  const port = 9231;
  const args = [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profileDir}`,
    'about:blank'
  ];

  if (process.platform !== 'win32') {
    args.unshift('--no-sandbox');
  }

  const bundled = chromium.executablePath();
  const executable = existsSync(bundled)
    ? bundled
    : process.env.ENPAL_TEST_CHROMIUM || '/usr/bin/chromium';

  const child = spawn(
    executable,
    args,
    { stdio: 'ignore' }
  );

  try {
    const endpoint = `http://127.0.0.1:${port}`;
    await waitForCdp(endpoint);

    const session = await attachToChrome({ endpoint });

    assert.equal(session.mode, 'attached');
    assert.equal(session.page.url(), 'about:blank');

    await session.close();

    assert.equal(
      child.exitCode,
      null,
      'disconnecting Playwright must not terminate externally owned Chrome'
    );
  } finally {
    if (child.exitCode === null) {
      child.kill();
      await Promise.race([
        once(child, 'exit'),
        new Promise(resolve => setTimeout(resolve, 3_000))
      ]);
    }
    await rm(profileDir, { recursive: true, force: true });
  }
});
