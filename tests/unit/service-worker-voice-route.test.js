import test from 'node:test';
import assert from 'node:assert/strict';

test('service worker routes ENPAL_TRUSTED_ACTIVATE to debugger activation', async () => {
  const listeners = [];
  const calls = [];

  globalThis.chrome = {
    sidePanel: {
      async setPanelBehavior() {}
    },
    runtime: {
      onInstalled: {
        addListener() {}
      },
      onMessage: {
        addListener(listener) {
          listeners.push(listener);
        }
      }
    },
    debugger: {
      async attach(target, version) {
        calls.push({ kind: 'attach', target, version });
      },
      async sendCommand(target, method, params) {
        calls.push({ kind: 'command', target, method, params });
      },
      async detach(target) {
        calls.push({ kind: 'detach', target });
      }
    }
  };

  await import('../../background/service-worker.js');
  const listener = listeners[0];
  const response = await new Promise((resolve) => {
    assert.equal(
      listener({ type: 'ENPAL_TRUSTED_ACTIVATE', tabId: 12 }, {}, resolve),
      true
    );
  });

  assert.deepEqual(response, { ok: true });
  assert.deepEqual(
    calls.map((call) => call.kind),
    ['attach', 'command', 'command', 'detach']
  );

  delete globalThis.chrome;
});
