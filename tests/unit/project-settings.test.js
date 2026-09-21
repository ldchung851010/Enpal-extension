import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PROJECT_URL_KEY,
  normalizeProjectUrl,
  createProjectSettings
} from '../../sidepanel/project-settings.js';

test('normalizes a ChatGPT Project root URL before saving', () => {
  assert.equal(
    normalizeProjectUrl('  https://chatgpt.com/g/g-p-example-project/?utm_source=test#top  '),
    'https://chatgpt.com/g/g-p-example-project'
  );
});

test('rejects URLs that are not ChatGPT Project roots', () => {
  for (const value of [
    '',
    'https://example.com/g/g-p-example-project',
    'https://chatgpt.com/',
    'https://chatgpt.com/c/abc',
    'https://chatgpt.com/g/g-p-example-project/c/abc'
  ]) {
    assert.throws(
      () => normalizeProjectUrl(value),
      /ChatGPT Project URL/
    );
  }
});

test('saved Project URL persists in chrome.storage.local and is read back later', async () => {
  const storage = {};
  const chromeApi = {
    storage: {
      local: {
        async get(key) {
          return { [key]: storage[key] };
        },
        async set(patch) {
          Object.assign(storage, patch);
        }
      }
    }
  };

  const settings = createProjectSettings(chromeApi);
  assert.equal(await settings.read(), '');

  const saved = await settings.save(
    'https://chatgpt.com/g/g-p-example-project/?utm_source=test'
  );

  assert.equal(saved, 'https://chatgpt.com/g/g-p-example-project');
  assert.equal(
    storage[PROJECT_URL_KEY],
    'https://chatgpt.com/g/g-p-example-project'
  );

  const reopened = createProjectSettings(chromeApi);
  assert.equal(
    await reopened.read(),
    'https://chatgpt.com/g/g-p-example-project'
  );
});
