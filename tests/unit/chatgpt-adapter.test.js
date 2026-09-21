import test from 'node:test';
import assert from 'node:assert/strict';
import { createChatGptAdapter } from '../../adapters/chatgpt-adapter.js';

function makeChrome(responses = {}) {
  const calls = [];
  let nextTabId = 10;
  const chromeApi = {
    tabs: {
      async create(details) {
        calls.push({ kind: 'tabs.create', details });
        return { id: nextTabId++, url: details.url };
      },
      async sendMessage(tabId, message) {
        calls.push({ kind: 'tabs.sendMessage', tabId, message });
        const key = message.action;
        const value = responses[key];
        return typeof value === 'function' ? value(message, calls) : (value ?? { ok: true });
      }
    },
    runtime: {
      async sendMessage(message) {
        calls.push({ kind: 'runtime.sendMessage', message });
        const value = responses[message.type];
        return typeof value === 'function' ? value(message, calls) : (value ?? { ok: true });
      }
    }
  };
  return { chromeApi, calls };
}

test('openProject opens the exact configured Project URL in a new active tab', async () => {
  const h = makeChrome();
  const adapter = createChatGptAdapter(h.chromeApi);
  const tabId = await adapter.openProject('https://chatgpt.com/g/g-p-enpal/');
  assert.equal(tabId, 10);
  assert.deepEqual(h.calls[0], {
    kind: 'tabs.create',
    details: { url: 'https://chatgpt.com/g/g-p-enpal', active: true }
  });
});

test('waitForProjectReady delegates the configured Project root to the ChatGPT runtime', async () => {
  const h = makeChrome({
    WAIT_PROJECT_READY: { ok: true, projectReady: true }
  });
  const adapter = createChatGptAdapter(h.chromeApi);

  assert.deepEqual(
    await adapter.waitForProjectReady(7, 'https://chatgpt.com/g/g-p-enpal'),
    { ok: true, projectReady: true }
  );
  assert.deepEqual(h.calls[0], {
    kind: 'tabs.sendMessage',
    tabId: 7,
    message: {
      target: 'ENPAL_CHATGPT',
      action: 'WAIT_PROJECT_READY',
      projectUrl: 'https://chatgpt.com/g/g-p-enpal'
    }
  });
});

test('adapter sends named ENPAL_CHATGPT messages without exposing selectors', async () => {
  const h = makeChrome({
    CREATE_CONVERSATION: { ok: true, ready: true },
    SEND_CONTROL: { ok: true, sent: true },
    WAIT_IDLE: { ok: true, idle: true },
    GET_CONVERSATION_URL: { ok: true, url: 'https://chatgpt.com/g/g-p-enpal/c/abc' },
    GET_REALTIME_FEED: { ok: true, turns: [] }
  });
  const adapter = createChatGptAdapter(h.chromeApi);
  const control = 'ENPAL_CONTROL\ntype=START\nsession_id=S-001\nBEGIN_BODY\nstart\nEND_BODY\nEND_ENPAL_CONTROL';

  await adapter.createConversation(7);
  await adapter.sendControl(7, control);
  await adapter.waitUntilIdle(7);
  assert.equal(await adapter.getConversationUrl(7), 'https://chatgpt.com/g/g-p-enpal/c/abc');
  assert.deepEqual(await adapter.getRealtimeFeed(7), []);

  assert.deepEqual(
    h.calls.filter(call => call.kind === 'tabs.sendMessage').map(call => call.message),
    [
      { target: 'ENPAL_CHATGPT', action: 'CREATE_CONVERSATION' },
      { target: 'ENPAL_CHATGPT', action: 'SEND_CONTROL', text: control },
      { target: 'ENPAL_CHATGPT', action: 'WAIT_IDLE' },
      { target: 'ENPAL_CHATGPT', action: 'GET_CONVERSATION_URL' },
      { target: 'ENPAL_CHATGPT', action: 'GET_REALTIME_FEED' }
    ]
  );
});

test('sendControl rejects ordinary text so administrative traffic stays classifiable', async () => {
  const h = makeChrome();
  const adapter = createChatGptAdapter(h.chromeApi);
  await assert.rejects(() => adapter.sendControl(7, 'ordinary learner text'), /ENPAL_CONTROL/);
  assert.equal(h.calls.length, 0);
});

test('openConversation opens the exact authoritative chat URL', async () => {
  const h = makeChrome();
  const adapter = createChatGptAdapter(h.chromeApi);
  const tabId = await adapter.openConversation('https://chatgpt.com/g/g-p-enpal/c/abc/');
  assert.equal(tabId, 10);
  assert.deepEqual(h.calls[0].details, {
    url: 'https://chatgpt.com/g/g-p-enpal/c/abc',
    active: true
  });
});

test('rename failure is returned as metadata instead of throwing', async () => {
  const h = makeChrome({
    RENAME_CONVERSATION: { ok: false, code: 'CHAT_UI_UNAVAILABLE' }
  });
  const adapter = createChatGptAdapter(h.chromeApi);
  assert.deepEqual(await adapter.renameConversation(7, 'Lesson 001'), {
    ok: false,
    code: 'CHAT_UI_UNAVAILABLE'
  });
});

test('setListeningMask delegates only the requested armed state to content runtime', async () => {
  const h = makeChrome({ SET_LISTENING_MASK: { ok: true, armed: true } });
  const adapter = createChatGptAdapter(h.chromeApi);
  assert.deepEqual(await adapter.setListeningMask(7, true), { ok: true, armed: true });
  assert.deepEqual(h.calls[0], {
    kind: 'tabs.sendMessage',
    tabId: 7,
    message: { target: 'ENPAL_CHATGPT', action: 'SET_LISTENING_MASK', armed: true }
  });
});

test('Voice activation focuses the semantic control then uses trusted background activation', async () => {
  const states = [false, true];
  const h = makeChrome({
    GET_VOICE_STATE: () => ({ ok: true, active: states.shift() }),
    FOCUS_VOICE_CONTROL: { ok: true, focused: true },
    ENPAL_TRUSTED_ACTIVATE: { ok: true }
  });
  const adapter = createChatGptAdapter(h.chromeApi, { sleep: async () => {}, voiceTimeoutMs: 0 });

  assert.deepEqual(await adapter.startVoice(7), { ok: true, active: true, changed: true });
  assert.deepEqual(h.calls.map(call => call.kind), [
    'tabs.sendMessage',
    'tabs.sendMessage',
    'runtime.sendMessage',
    'tabs.sendMessage'
  ]);
  assert.deepEqual(h.calls[2].message, { type: 'ENPAL_TRUSTED_ACTIVATE', tabId: 7 });
});


test('adapter retries only transient missing-receiver errors until ChatGPT content runtime is ready', async () => {
  const calls = [];
  let attempts = 0;
  const chromeApi = {
    tabs: {
      async create(details) {
        calls.push({ kind: 'tabs.create', details });
        return { id: 10, url: details.url };
      },
      async sendMessage(tabId, message) {
        calls.push({ kind: 'tabs.sendMessage', tabId, message });
        attempts += 1;
        if (attempts < 3) {
          throw new Error('Could not establish connection. Receiving end does not exist.');
        }
        return { ok: true, ready: true };
      }
    },
    runtime: {
      async sendMessage() {
        return { ok: true };
      }
    }
  };

  const waits = [];
  const adapter = createChatGptAdapter(chromeApi, {
    sleep: async (ms) => waits.push(ms),
    messageRetryTimeoutMs: 1_000,
    messageRetryPollMs: 25
  });

  const result = await adapter.createConversation(10);

  assert.deepEqual(result, { ok: true, ready: true });
  assert.equal(attempts, 3);
  assert.deepEqual(waits, [25, 25]);
});

test('adapter does not retry non-transient tabs.sendMessage failures', async () => {
  let attempts = 0;
  const chromeApi = {
    tabs: {
      async create(details) {
        return { id: 10, url: details.url };
      },
      async sendMessage() {
        attempts += 1;
        throw new Error('Tab was closed');
      }
    },
    runtime: {
      async sendMessage() {
        return { ok: true };
      }
    }
  };

  const adapter = createChatGptAdapter(chromeApi, {
    sleep: async () => {
      throw new Error('unexpected retry');
    }
  });

  await assert.rejects(() => adapter.createConversation(10), /Tab was closed/);
  assert.equal(attempts, 1);
});
