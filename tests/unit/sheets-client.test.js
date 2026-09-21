import test from 'node:test';
import assert from 'node:assert/strict';
import { createSheetsClient } from '../../storage/sheets-client.js';

test('reads an exact spreadsheet range with bearer auth', async () => {
  const calls = [];
  const client = createSheetsClient({
    getToken: async () => 'token-1',
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return { ok: true, json: async () => ({ values: [['READY']] }) };
    }
  });

  const result = await client.getValues('sheet-1', 'ACTIVE!A1:B2');

  assert.deepEqual(result, [['READY']]);
  assert.match(calls[0].url, /spreadsheets\/sheet-1\/values\/ACTIVE/);
  assert.equal(calls[0].options.headers.Authorization, 'Bearer token-1');
});

test('updates an exact range with RAW values', async () => {
  const calls = [];
  const client = createSheetsClient({
    getToken: async () => 'token-2',
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return { ok: true, json: async () => ({ updatedRows: 1 }) };
    }
  });

  await client.updateValues(
    'sheet/with space',
    'ACTIVE!A1:B1',
    [['READY', '1']]
  );

  assert.match(
    calls[0].url,
    /sheet%2Fwith%20space\/values\/ACTIVE!A1%3AB1\?valueInputOption=RAW$/
  );
  assert.equal(calls[0].options.method, 'PUT');
  assert.equal(
    calls[0].options.body,
    JSON.stringify({ values: [['READY', '1']] })
  );
});

test('sends atomic spreadsheet batchUpdate requests', async () => {
  const calls = [];
  const requests = [{ updateCells: { fields: 'userEnteredValue' } }];
  const client = createSheetsClient({
    getToken: async () => 'token-3',
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return { ok: true, json: async () => ({ replies: [] }) };
    }
  });

  await client.batchUpdate('sheet-3', requests);

  assert.match(calls[0].url, /spreadsheets\/sheet-3:batchUpdate$/);
  assert.equal(calls[0].options.method, 'POST');
  assert.equal(calls[0].options.body, JSON.stringify({ requests }));
});

test('throws a status-bearing error when Sheets request fails', async () => {
  const client = createSheetsClient({
    getToken: async () => 'token-4',
    fetchImpl: async () => ({ ok: false, status: 403 })
  });

  await assert.rejects(
    client.getValues('sheet-4', 'ACTIVE!A1'),
    /Google Sheets request failed: 403/
  );
});

test('rejects missing exact spreadsheet ids, ranges, and empty batch requests', async () => {
  const client = createSheetsClient({
    getToken: async () => 'token',
    fetchImpl: async () => ({ ok: true, json: async () => ({}) })
  });

  await assert.rejects(client.getValues('', 'A1'), /spreadsheetId/);
  await assert.rejects(client.getValues('sheet', ''), /range/);
  await assert.rejects(client.batchUpdate('sheet', []), /non-empty array/);
});
