import test from 'node:test';
import assert from 'node:assert/strict';
import {
  runTask3LiveProbe,
  TASK3_LIVE_TARGET
} from '../live/task3-live-probe.js';

test('Task 3 live probe verifies OAuth, read, write/read-back, and cleanup without exposing token', async () => {
  const calls = [];
  const markerStore = new Map();
  let nextSheetId = 987;

  const chromeApi = {
    runtime: { id: TASK3_LIVE_TARGET.extensionId },
    identity: {
      async getAuthToken(options) {
        assert.deepEqual(options, { interactive: true });
        return { token: 'secret-token' };
      }
    }
  };

  const fetchImpl = async (url, options = {}) => {
    const method = options.method ?? 'GET';
    calls.push({ url, method, body: options.body ?? null, headers: options.headers });

    if (url.includes(TASK3_LIVE_TARGET.curriculumSpreadsheetId)) {
      return { ok: true, json: async () => ({ values: [['header', 'value']] }) };
    }

    if (url.endsWith(':batchUpdate')) {
      const body = JSON.parse(options.body);
      if (body.requests?.[0]?.addSheet) {
        return {
          ok: true,
          json: async () => ({
            replies: [{
              addSheet: { properties: { sheetId: nextSheetId++ } }
            }]
          })
        };
      }
      if (body.requests?.[0]?.deleteSheet) {
        return { ok: true, json: async () => ({ replies: [{}] }) };
      }
    }

    if (method === 'PUT') {
      const value = JSON.parse(options.body).values?.[0]?.[0];
      markerStore.set(url.split('/values/')[1].split('?')[0], value);
      return { ok: true, json: async () => ({ updatedCells: 1 }) };
    }

    const range = url.split('/values/')[1];
    return {
      ok: true,
      json: async () => ({ values: [[markerStore.get(range)]] })
    };
  };

  const evidence = await runTask3LiveProbe({
    chromeApi,
    fetchImpl,
    now: (() => {
      let n = 1000;
      return () => n++;
    })()
  });

  assert.deepEqual(evidence, {
    ok: true,
    extensionId: TASK3_LIVE_TARGET.extensionId,
    oauth: true,
    curriculumRead: true,
    databaseWriteRead: true,
    cleanup: true
  });
  assert.equal(JSON.stringify(evidence).includes('secret-token'), false);
  assert.equal(calls.filter(call => call.url.endsWith(':batchUpdate')).length, 2);
  assert.equal(calls.some(call => call.method === 'PUT'), true);
});
