import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('side panel exposes a Google connection check button', async () => {
  const html = await readFile(new URL('../../sidepanel/index.html', import.meta.url), 'utf8');
  const js = await readFile(new URL('../../sidepanel/sidepanel.js', import.meta.url), 'utf8');
  assert.match(html, /id="connect-google"/);
  assert.match(js, /connectGoogle/);
  assert.match(js, /Google connected/);
});
