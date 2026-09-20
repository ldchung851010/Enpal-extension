import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const manifest = JSON.parse(fs.readFileSync(new URL('../../manifest.json', import.meta.url), 'utf8'));

test('pins the stable EnPal extension identity', () => {
  assert.equal(
    manifest.key,
    'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAqzU70t5OgxfFD6XXwpKYfArStpmqJmHG5kos07rXb/AHoRHF+OO06o/K4LlmE0vFJpH4iJjqQelcHi3M5IR9fmydtCXOzQcKVol+rzPf/mZvi7WWG5ono7ojZzvU4FjWdE9vUZYzBOf/4YivAGCgJYPRNIvKNDEwf1pshUBro9pnvwm4xTOlaeHXjnKeP47z12NK9mdFDwAsn8aq5e1B/9s4vJl6kJkEydSNIWylu3neb+eiDIiiJHDWgAwYqi3h44jwm6iWHjBE8n/zgCf7QOYPeytU+OT6X4ZXuwJHdNBPGf4eMeoua/WyQRL1+PiH7n5SGfVpO/GiM7e2DVdq8QIDAQAB'
  );
});

test('configures the production Chrome OAuth client for Sheets', () => {
  assert.equal(
    manifest.oauth2?.client_id,
    '75024264025-jfk5jl6gip980b1fubg5jvmsnsdbqcf5.apps.googleusercontent.com'
  );
  assert.deepEqual(
    manifest.oauth2?.scopes,
    ['https://www.googleapis.com/auth/spreadsheets']
  );
});

test('keeps only required Google host permission', () => {
  assert.ok(manifest.host_permissions.includes('https://sheets.googleapis.com/*'));
  assert.ok(!manifest.host_permissions.includes('https://www.googleapis.com/*'));
});
