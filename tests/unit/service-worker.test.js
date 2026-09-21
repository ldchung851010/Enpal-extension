import test from 'node:test';
import assert from 'node:assert/strict';

function makeFakeChrome() {
  const installedListeners = [];
  const messageListeners = [];
  const panelCalls = [];
  const debuggerCalls = [];

  return {
    installedListeners,
    messageListeners,
    panelCalls,
    debuggerCalls,
    api: {
      sidePanel: {
        async setPanelBehavior(options) {
          panelCalls.push(options);
        }
      },
      runtime: {
        onInstalled: {
          addListener(listener) {
            installedListeners.push(listener);
          }
        },
        onMessage: {
          addListener(listener) {
            messageListeners.push(listener);
          }
        }
      },
      debugger: {
        async attach(target, version) {
          debuggerCalls.push({ kind: 'attach', target, version });
        },
        async sendCommand(target, method, params) {
          debuggerCalls.push({ kind: 'command', target, method, params });
        },
        async detach(target) {
          debuggerCalls.push({ kind: 'detach', target });
        }
      }
    }
  };
}

let workerModulePromise;

async function getWorkerModule() {
  if (!workerModulePromise) {
    const bootstrap = makeFakeChrome();
    globalThis.chrome = bootstrap.api;
    workerModulePromise = import('../../background/service-worker.js?task13-service-worker-test');
    await workerModulePromise;
    delete globalThis.chrome;
  }
  return workerModulePromise;
}

async function loadWorker() {
  const mod = await getWorkerModule();
  const fake = makeFakeChrome();
  mod.registerServiceWorker(fake.api);
  return { fake, mod };
}

test('service worker exposes only a stateless registrar and configures side-panel behavior on install', async () => {
  const { fake, mod } = await loadWorker();

  assert.equal(typeof mod.registerServiceWorker, 'function');
  assert.deepEqual(Object.keys(mod), ['registerServiceWorker']);
  assert.equal(fake.installedListeners.length, 1);

  fake.installedListeners[0]();
  await Promise.resolve();

  assert.deepEqual(fake.panelCalls, [{ openPanelOnActionClick: true }]);
  delete globalThis.chrome;
});

test('ENPAL_TRUSTED_ACTIVATE remains a short privileged debugger route', async () => {
  const { fake } = await loadWorker();
  const listener = fake.messageListeners[0];

  const response = await new Promise((resolve) => {
    assert.equal(
      listener({ type: 'ENPAL_TRUSTED_ACTIVATE', tabId: 31 }, {}, resolve),
      true
    );
  });

  assert.deepEqual(response, { ok: true });
  assert.deepEqual(
    fake.debuggerCalls.map((call) => call.kind),
    ['attach', 'command', 'command', 'detach']
  );
  delete globalThis.chrome;
});


test('ENPAL_TRUSTED_SEND types and submits through the short debugger route', async () => {
  const { fake } = await loadWorker();
  const listener = fake.messageListeners[0];
  const text = 'ENPAL_CONTROL\ntype=START';
  const response = await new Promise((resolve) => {
    assert.equal(listener({ type: 'ENPAL_TRUSTED_SEND', tabId: 31, text }, {}, resolve), true);
  });
  assert.deepEqual(response, { ok: true, sent: true });
  const commands = fake.debuggerCalls.filter(call => call.kind === 'command');
  assert.equal(commands[0].method, 'Input.insertText');
  assert.equal(commands[0].params.text, text);
  assert.equal(commands[1].method, 'Input.dispatchKeyEvent');
  assert.equal(commands[2].method, 'Input.dispatchKeyEvent');
});

test('service worker does not own START PAUSE END workflow messages or pipeline state', async () => {
  const { fake, mod } = await loadWorker();
  const listener = fake.messageListeners[0];

  for (const type of ['START', 'PAUSE', 'END', 'RETRY', 'ENPAL_WORKFLOW_ACTION']) {
    let responded = false;
    const handled = listener({ type }, {}, () => {
      responded = true;
    });
    assert.equal(handled, false, type);
    assert.equal(responded, false, type);
  }

  assert.equal('workflow' in mod, false);
  assert.equal('state' in mod, false);
  assert.equal('session' in mod, false);
  delete globalThis.chrome;
});
