import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const manifest = JSON.parse(
  await readFile(new URL('../../manifest.json', import.meta.url), 'utf8')
);

test('manifest configures the EnPal Chrome OAuth client with only the V1 scopes', () => {
  assert.equal(
    manifest.oauth2?.client_id,
    '776717534717-6mi5nl2m2ldhlqnmai578r3405ku1f35.apps.googleusercontent.com'
  );
  assert.deepEqual(manifest.oauth2?.scopes, [
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/drive.file'
  ]);
});
