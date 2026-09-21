import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const manifest = JSON.parse(
  await readFile(new URL('../../manifest.json', import.meta.url), 'utf8')
);

test('Task 3 pins the production Chrome OAuth identity and Sheets scope', () => {
  assert.equal(
    manifest.oauth2?.client_id,
    '75024264025-jfk5jl6gip980b1fubg5jvmsnsdbqcf5.apps.googleusercontent.com'
  );
  assert.deepEqual(manifest.oauth2?.scopes, [
    'https://www.googleapis.com/auth/spreadsheets'
  ]);
  assert.equal(typeof manifest.key, 'string');
  assert.ok(manifest.key.length > 100);
});

test('Task 3 keeps only the exact Sheets API host permission for Google data access', () => {
  assert.ok(manifest.host_permissions.includes('https://sheets.googleapis.com/*'));
  assert.equal(manifest.host_permissions.includes('https://www.googleapis.com/*'), false);
});
