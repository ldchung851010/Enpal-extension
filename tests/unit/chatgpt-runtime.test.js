import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { loadClassicScript } from '../helpers/load-classic-script.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

class FakeElement {
  constructor({ value = '', textContent = '', attributes = {}, disabled = false } = {}) {
    this.value = value;
    this.textContent = textContent;
    this.attributes = { ...attributes };
    this.disabled = disabled;
    this.clicks = 0;
    this.focuses = 0;
    this.events = [];
  }
  click() { this.clicks += 1; }
  focus() { this.focuses += 1; }
  dispatchEvent(event) { this.events.push(event); return true; }
  getAttribute(name) { return this.attributes[name] ?? null; }
  setAttribute(name, value) { this.attributes[name] = String(value); }
}

function loadRuntime({ href = 'https://chatgpt.com/g/g-p-enpal', generating = false, turns = [] } = {}) {
  const listeners = [];
  const composer = new FakeElement();
  const send = new FakeElement();
  const generatingButton = generating ? new FakeElement() : null;
  const voice = new FakeElement({ attributes: { 'aria-pressed': 'false' } });
  const map = new Map([
    ['#prompt-textarea', composer],
    ['button[data-testid="send-button"]', send],
    ['button[data-testid="voice-mode-button"]', voice]
  ]);
  if (generatingButton) map.set('button[data-testid="stop-button"]', generatingButton);

  const document = {
    querySelector(selector) { return map.get(selector) || null; },
    querySelectorAll(selector) {
      if (!['[data-message-author-role]', '[data-message-author-role="user"]'].includes(selector)) return [];
      return turns
        .filter(turn => selector === '[data-message-author-role]' || turn.role === 'user')
        .map(turn => new FakeElement({
          textContent: turn.text,
          attributes: { 'data-message-author-role': turn.role }
        }));
    }
  };
  const chrome = {
    runtime: {
      onMessage: { addListener(listener) { listeners.push(listener); } }
    }
  };
  const EventClass = class {
    constructor(type, init = {}) { this.type = type; Object.assign(this, init); }
  };
  const location = { href };
  const context = loadClassicScript(path.join(ROOT, 'content/chatgpt-runtime.js'), {
    document,
    location,
    chrome,
    Event: EventClass,
    InputEvent: EventClass,
    KeyboardEvent: EventClass,
    setTimeout,
    clearTimeout,
    URL
  });

  async function dispatch(message) {
    return new Promise((resolve, reject) => {
      const listener = listeners[0];
      if (!listener) return reject(new Error('listener missing'));
      const keepAlive = listener(message, {}, resolve);
      if (keepAlive !== true) resolve(undefined);
    });
  }

  return { context, composer, send, voice, location, turns, dispatch };
}

test('FOCUS_COMPOSER reports the existing EnPal control-turn baseline', async () => {
  const page = loadRuntime({
    turns: [
      { role: 'user', text: 'ordinary learner text' },
      { role: 'user', text: 'ENPAL_CONTROL\ntype=RESUME' }
    ]
  });
  const result = await page.dispatch({ target: 'ENPAL_CHATGPT', action: 'FOCUS_COMPOSER' });
  assert.deepEqual(JSON.parse(JSON.stringify(result)), {
    ok: true,
    focused: true,
    controlTurns: 1
  });
});

test('WAIT_CONTROL_SUBMITTED confirms only after a new EnPal control user turn appears', async () => {
  const page = loadRuntime({ turns: [] });
  setTimeout(() => {
    page.turns.push({ role: 'user', text: 'ENPAL_CONTROL\ntype=START' });
  }, 2);
  const result = await page.context.EnPalChatGptRuntime.waitForControlSubmitted(0, {
    timeoutMs: 20,
    pollMs: 1
  });
  assert.deepEqual(JSON.parse(JSON.stringify(result)), {
    ok: true,
    submitted: true,
    controlTurns: 1
  });
});

test('runtime returns structured URL and idle state without assistant prose', async () => {
  const page = loadRuntime({ href: 'https://chatgpt.com/g/g-p-enpal/c/abc' });
  const url = await page.dispatch({ target: 'ENPAL_CHATGPT', action: 'GET_CONVERSATION_URL' });
  const idle = await page.dispatch({
    target: 'ENPAL_CHATGPT', action: 'WAIT_IDLE', timeoutMs: 1, pollMs: 1,
    activityGraceMs: 0, idleStabilityMs: 0
  });
  assert.deepEqual(JSON.parse(JSON.stringify(url)), {
    ok: true,
    url: 'https://chatgpt.com/g/g-p-enpal/c/abc'
  });
  assert.equal(idle.ok, true);
  assert.equal(idle.idle, true);
  assert.equal('assistantText' in idle, false);
});


test('WAIT_IDLE does not report success immediately before ChatGPT has had a chance to become active', async () => {
  const page = loadRuntime({ href: 'https://chatgpt.com/g/g-p-enpal/c/abc' });
  const result = await page.context.EnPalChatGptRuntime.waitUntilIdle({
    timeoutMs: 5,
    pollMs: 1,
    activityGraceMs: 2,
    idleStabilityMs: 1
  });
  assert.equal(result.ok, true);
  assert.equal(result.idle, true);
  assert.equal(result.activityObserved, false);
});

test('WAIT_PROJECT_READY accepts a configured Project new-chat subroute with a composer', async () => {
  const page = loadRuntime({ href: 'https://chatgpt.com/g/g-p-enpal/project' });
  const result = await page.context.EnPalChatGptRuntime.waitForProjectReady(
    'https://chatgpt.com/g/g-p-enpal',
    { timeoutMs: 1, pollMs: 1 }
  );
  assert.deepEqual(JSON.parse(JSON.stringify(result)), {
    ok: true,
    projectReady: true,
    url: 'https://chatgpt.com/g/g-p-enpal/project'
  });
});

test('WAIT_PROJECT_READY rejects a global chat even when the composer is already visible', async () => {
  const page = loadRuntime({ href: 'https://chatgpt.com/c/outside-project' });
  const result = await page.context.EnPalChatGptRuntime.waitForProjectReady(
    'https://chatgpt.com/g/g-p-enpal',
    { timeoutMs: 0, pollMs: 1, stabilityMs: 0 }
  );
  assert.equal(result.ok, false);
  assert.match(result.message, /Project.*new conversation/i);
});

test('WAIT_PROJECT_READY rejects an existing conversation because START must create a new chat', async () => {
  const page = loadRuntime({ href: 'https://chatgpt.com/g/g-p-enpal/c/existing' });
  const result = await page.context.EnPalChatGptRuntime.waitForProjectReady(
    'https://chatgpt.com/g/g-p-enpal',
    { timeoutMs: 0, pollMs: 1 }
  );
  assert.equal(result.ok, false);
  assert.match(result.message, /new conversation/i);
});

test('FOCUS_COMPOSER focuses the semantic ChatGPT composer without writing text', async () => {
  const page = loadRuntime();
  const result = await page.dispatch({ target: 'ENPAL_CHATGPT', action: 'FOCUS_COMPOSER' });
  assert.deepEqual(JSON.parse(JSON.stringify(result)), { ok: true, focused: true, controlTurns: 0 });
  assert.equal(page.composer.focuses, 1);
  assert.equal(page.composer.value, '');
});

test('WAIT_CONVERSATION_URL waits for a conversation inside the configured Project', async () => {
  const page = loadRuntime({ href: 'https://chatgpt.com/g/g-p-enpal/project' });
  setTimeout(() => {
    page.location.href = 'https://chatgpt.com/g/g-p-enpal/c/new-123';
  }, 2);
  const result = await page.context.EnPalChatGptRuntime.waitForConversationUrl(
    'https://chatgpt.com/g/g-p-enpal',
    { timeoutMs: 20, pollMs: 1 }
  );
  assert.deepEqual(JSON.parse(JSON.stringify(result)), {
    ok: true,
    url: 'https://chatgpt.com/g/g-p-enpal/c/new-123'
  });
});

test('WAIT_CONVERSATION_URL rejects a conversation created outside the configured Project', async () => {
  const page = loadRuntime({ href: 'https://chatgpt.com/c/outside-project' });
  const result = await page.context.EnPalChatGptRuntime.waitForConversationUrl(
    'https://chatgpt.com/g/g-p-enpal',
    { timeoutMs: 0, pollMs: 1 }
  );
  assert.equal(result.ok, false);
  assert.equal(result.code, 'WRONG_CHAT');
});

test('CREATE_CONVERSATION confirms project composer readiness without inventing a chat URL', async () => {
  const page = loadRuntime();
  const result = await page.dispatch({ target: 'ENPAL_CHATGPT', action: 'CREATE_CONVERSATION' });
  assert.deepEqual(JSON.parse(JSON.stringify(result)), { ok: true, ready: true });
});

test('GET_REALTIME_FEED returns only structured role/text turn objects', async () => {
  const page = loadRuntime({
    turns: [
      { role: 'user', text: 'ENPAL_CONTROL\ntype=START' },
      { role: 'assistant', text: 'Hello.' }
    ]
  });
  const result = await page.dispatch({ target: 'ENPAL_CHATGPT', action: 'GET_REALTIME_FEED' });
  assert.deepEqual(JSON.parse(JSON.stringify(result)), {
    ok: true,
    turns: [
      { role: 'user', text: 'ENPAL_CONTROL\ntype=START' },
      { role: 'assistant', text: 'Hello.' }
    ]
  });
});

test('messages outside the ENPAL_CHATGPT boundary are ignored', async () => {
  const page = loadRuntime();
  assert.equal(await page.dispatch({ target: 'OTHER', action: 'GET_CONVERSATION_URL' }), undefined);
});

const manifest = JSON.parse(await readFile(new URL('../../manifest.json', import.meta.url), 'utf8'));

test('manifest loads ChatGPT runtime at document_start', () => {
  const entry = manifest.content_scripts?.find(item => item.matches?.includes('https://chatgpt.com/*'));
  assert.ok(entry);
  assert.deepEqual(entry.js, ['content/chatgpt-runtime.js']);
  assert.equal(entry.run_at, 'document_start');
});
