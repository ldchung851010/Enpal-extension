import test from 'node:test';
import assert from 'node:assert/strict';
import { makeChatPageFixture, loadChatgptAdapter } from '../helpers/chatgpt-harness.js';

test('sendText fills the semantic composer and activates Send', async () => {
  const page = makeChatPageFixture();
  const adapter = loadChatgptAdapter(page);
  await adapter.sendText('hello');
  assert.equal(page.composer.value, 'hello');
  assert.equal(page.sendClicks, 1);
});

test('verifyCurrentChat rejects a different conversation', async () => {
  const adapter = loadChatgptAdapter(makeChatPageFixture({
    href:'https://chatgpt.com/g/g-p-enpal/c/OTHER'
  }));
  assert.equal(
    adapter.verifyCurrentChat('https://chatgpt.com/g/g-p-enpal/c/EXPECTED'), false
  );
});

test('adapter returns operational state but never assistant text', async () => {
  const page = makeChatPageFixture({ voiceActive:true, generating:true });
  const adapter = loadChatgptAdapter(page);
  assert.equal(adapter.isVoiceActive(), true);
  assert.equal(adapter.isAssistantGenerating(), true);
  assert.deepEqual(Object.keys(adapter).includes('getAssistantText'), false);
});

test('rate-limit detection reports boolean from system notice', () => {
  const adapter = loadChatgptAdapter(makeChatPageFixture({ rateLimited:true }));
  assert.equal(adapter.detectConversationRateLimit(), true);
});

test('post-Voice settle observes structure only and disconnects after quiet window', async () => {
  const page = makeChatPageFixture({ voiceActive:false });
  const adapter = loadChatgptAdapter(page);
  await adapter.waitForPostVoiceSettle({ quietMs:0, totalTimeoutMs:20, pollMs:1 });
  assert.equal(page.mutationObservers.length, 1);
  assert.equal(page.mutationObservers[0].observed.options.childList, true);
  assert.equal(page.mutationObservers[0].observed.options.subtree, true);
  assert.equal(page.mutationObservers[0].disconnected, true);
});
