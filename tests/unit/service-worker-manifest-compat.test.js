import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('service worker manifest mode matches importScripts usage', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
  const serviceWorker = fs.readFileSync(path.join(ROOT, manifest.background.service_worker), 'utf8');

  if (serviceWorker.includes('importScripts(')) {
    assert.notEqual(
      manifest.background.type,
      'module',
      'classic importScripts service worker must not be declared as type=module'
    );
  }
});
