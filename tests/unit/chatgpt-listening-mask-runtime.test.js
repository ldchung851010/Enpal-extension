import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadClassicScript } from '../helpers/load-classic-script.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

class FakeElement {
  constructor() {
    this.attributes = {};
    this.children = [];
    this.textContent = '';
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }

  getAttribute(name) {
    return this.attributes[name] ?? null;
  }

  removeAttribute(name) {
    delete this.attributes[name];
  }

  appendChild(child) {
    this.children.push(child);
    return child;
  }
}

test('content runtime arms a preemptive listening veil and disarms explicitly', async () => {
  const listeners = [];
  const documentElement = new FakeElement();
  const head = new FakeElement();
  let style = null;

  const document = {
    documentElement,
    head,
    createElement() {
      return new FakeElement();
    },
    querySelector(selector) {
      if (selector === 'style[data-enpal-listening-mask-style]') return style;
      return null;
    },
    querySelectorAll() {
      return [];
    }
  };

  const originalAppend = head.appendChild.bind(head);
  head.appendChild = (child) => {
    style = child;
    return originalAppend(child);
  };

  const chrome = {
    runtime: {
      onMessage: {
        addListener(listener) {
          listeners.push(listener);
        }
      }
    }
  };

  loadClassicScript(path.join(ROOT, 'content/chatgpt-runtime.js'), {
    document,
    location: { href: 'https://chatgpt.com/g/g-p-enpal' },
    chrome,
    Event,
    InputEvent: Event,
    KeyboardEvent: Event,
    setTimeout,
    clearTimeout,
    URL
  });

  const dispatch = (message) => new Promise((resolve) => {
    listeners[0](message, {}, resolve);
  });

  assert.deepEqual(
    JSON.parse(JSON.stringify(await dispatch({
      target: 'ENPAL_CHATGPT',
      action: 'SET_LISTENING_MASK',
      armed: true
    }))),
    { ok: true, armed: true }
  );
  assert.equal(
    documentElement.getAttribute('data-enpal-listening-mask'),
    '1'
  );
  assert.match(style.textContent, /data-message-author-role/);
  assert.doesNotMatch(style.textContent, /#prompt-textarea/);

  assert.deepEqual(
    JSON.parse(JSON.stringify(await dispatch({
      target: 'ENPAL_CHATGPT',
      action: 'SET_LISTENING_MASK',
      armed: false
    }))),
    { ok: true, armed: false }
  );
  assert.equal(
    documentElement.getAttribute('data-enpal-listening-mask'),
    null
  );
});
