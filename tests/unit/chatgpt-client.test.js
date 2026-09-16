import test from 'node:test';
import assert from 'node:assert/strict';
import { createChatGPTClient } from '../../core/chatgpt-client.js';

function makeChrome(responses = {}) {
  const calls = [];
  let nextTabId = 7;
  const chromeApi = {
    runtime: {
      async sendMessage(message) {
        calls.push({ name:'runtime.sendMessage', message });
        const handler = responses[message.type];
        return typeof handler === 'function' ? handler(message, calls) : (handler ?? { ok:true });
      }
    },
    tabs: {
      async create(details) {
        calls.push({ name:'create', details });
        return { id: nextTabId++, url: details.url };
      },
      async sendMessage(tabId, message) {
        calls.push({ name:'sendMessage', tabId, message });
        const handler = responses[message.type];
        return typeof handler === 'function' ? handler(message, calls) : (handler ?? { ok:true });
      }
    }
  };
  return { chromeApi, calls };
}

test('openProject and sendText use explicit tab identity', async () => {
  const h = makeChrome({ ENPAL_SEND_TEXT: { ok:true } });
  const client = createChatGPTClient(h.chromeApi);
  const tabId = await client.openProject('https://chatgpt.com/g/g-p-enpal');
  await client.sendText(tabId, 'hello');
  assert.equal(tabId, 7);
  assert.deepEqual(h.calls[1], {
    name:'sendMessage', tabId:7, message:{ type:'ENPAL_SEND_TEXT', text:'hello' }
  });
});

test('waitForConversationUrl requires chat URL inside configured Project', async () => {
  const urls = [
    'https://chatgpt.com/g/g-p-enpal',
    'https://chatgpt.com/g/g-p-enpal/c/ABC'
  ];
  const h = makeChrome({
    ENPAL_GET_CHAT_URL: () => ({ ok:true, url: urls.shift() })
  });
  const client = createChatGPTClient(h.chromeApi, { sleep: async () => {} });
  const url = await client.waitForConversationUrl(7, 'https://chatgpt.com/g/g-p-enpal', {
    timeoutMs: 10, pollMs: 1
  });
  assert.equal(url, 'https://chatgpt.com/g/g-p-enpal/c/ABC');
});

test('renameCurrentChat is non-throwing when assistant is not idle', async () => {
  const h = makeChrome({ ENPAL_IS_GENERATING: { ok:true, generating:true } });
  const client = createChatGPTClient(h.chromeApi);
  assert.deepEqual(await client.renameCurrentChat(7, '025 - Speaking - X'), {
    ok:false, reason:'not-idle'
  });
});

test('renameCurrentChat converts rate-limit signal into metadata result', async () => {
  const h = makeChrome({
    ENPAL_IS_GENERATING: { ok:true, generating:false },
    ENPAL_DETECT_RATE_LIMIT: { ok:true, rateLimited:true }
  });
  const client = createChatGPTClient(h.chromeApi);
  assert.deepEqual(await client.renameCurrentChat(7, '025 - Speaking - X'), {
    ok:false, reason:'rate-limited'
  });
});

test('startVoice is idempotent when Voice is already active', async () => {
  const h = makeChrome({ ENPAL_IS_VOICE_ACTIVE: { ok:true, active:true } });
  const client = createChatGPTClient(h.chromeApi, { voiceWaitMs:0, voicePollMs:1 });
  await client.startVoice(7);
  assert.equal(h.calls.some(call => call.name === 'runtime.sendMessage'), false);
});

test('startVoice uses trusted activation and verifies active state', async () => {
  const states = [false, true];
  const h = makeChrome({
    ENPAL_IS_VOICE_ACTIVE: () => ({ ok:true, active: states.shift() }),
    ENPAL_TRUSTED_ACTIVATE: { ok:true }
  });
  const client = createChatGPTClient(h.chromeApi, { voiceWaitMs:0, voicePollMs:1 });
  await client.startVoice(7);
  assert.equal(h.calls.filter(call => call.name === 'runtime.sendMessage').length, 1);
});

test('stopVoice retries trusted activation once before failing', async () => {
  const states = [true, true, false];
  const h = makeChrome({
    ENPAL_IS_VOICE_ACTIVE: () => ({ ok:true, active: states.shift() }),
    ENPAL_TRUSTED_ACTIVATE: { ok:true }
  });
  const client = createChatGPTClient(h.chromeApi, { voiceWaitMs:0, voicePollMs:1 });
  await client.stopVoice(7);
  assert.equal(h.calls.filter(call => call.name === 'runtime.sendMessage').length, 2);
});

test('preemptive listening mask fails closed when conversation is not covered', async () => {
  const h = makeChrome({ ENPAL_MASK_ARM: { ok:true, covered:false } });
  const client = createChatGPTClient(h.chromeApi);
  await assert.rejects(() => client.armPreemptiveListeningMask(7), /not covered/i);
});

test('processing veil actions stay scoped to explicit tab', async () => {
  const h = makeChrome({
    ENPAL_PROCESSING_VEIL_ON: { ok:true, covered:true },
    ENPAL_VEIL_OFF: { ok:true }
  });
  const client = createChatGPTClient(h.chromeApi);
  await client.applyProcessingVeil(7);
  await client.removeConversationVeil(7);
  const messages = h.calls.filter(call => call.name === 'sendMessage').map(call => call.message.type);
  assert.deepEqual(messages, ['ENPAL_PROCESSING_VEIL_ON','ENPAL_VEIL_OFF']);
});
