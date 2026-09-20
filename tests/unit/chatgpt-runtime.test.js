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
      if (selector !== '[data-message-author-role]') return [];
      return turns.map(turn => new FakeElement({
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
  const context = loadClassicScript(path.join(ROOT, 'content/chatgpt-runtime.js'), {
    document,
    location: { href },
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

  return { context, composer, send, voice, dispatch };
}

test('SEND_CONTROL writes the composer and clicks Send', async () => {
  const page = loadRuntime();
  const result = await page.dispatch({
    target: 'ENPAL_CHATGPT',
    action: 'SEND_CONTROL',
    text: 'ENPAL_CONTROL\ntype=START'
  });
  assert.deepEqual(JSON.parse(JSON.stringify(result)), { ok: true, sent: true });
  assert.equal(page.composer.value, 'ENPAL_CONTROL\ntype=START');
  assert.equal(page.send.clicks, 1);
});

test('runtime returns structured URL and idle state without assistant prose', async () => {
  const page = loadRuntime({ href: 'https://chatgpt.com/g/g-p-enpal/c/abc' });
  const url = await page.dispatch({ target: 'ENPAL_CHATGPT', action: 'GET_CONVERSATION_URL' });
  const idle = await page.dispatch({ target: 'ENPAL_CHATGPT', action: 'WAIT_IDLE', timeoutMs: 1, pollMs: 1 });
  assert.deepEqual(JSON.parse(JSON.stringify(url)), {
    ok: true,
    url: 'https://chatgpt.com/g/g-p-enpal/c/abc'
  });
  assert.equal(idle.ok, true);
  assert.equal(idle.idle, true);
  assert.equal('assistantText' in idle, false);
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
