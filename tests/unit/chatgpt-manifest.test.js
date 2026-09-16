import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const manifest = JSON.parse(await readFile(new URL('../../manifest.json', import.meta.url), 'utf8'));

test('ChatGPT semantic adapter scripts run at document_start', () => {
  const entry = manifest.content_scripts?.find(item => item.matches?.includes('https://chatgpt.com/*'));
  assert.ok(entry);
  assert.deepEqual(entry.js, ['config/selectors.js', 'content/listening-mask.js', 'content/chatgpt-adapter.js']);
  assert.equal(entry.run_at, 'document_start');
});
