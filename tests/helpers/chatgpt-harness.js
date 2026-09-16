import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClassicContext, runClassicScript } from './load-classic-script.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

class FakeElement {
  constructor({ value = '', textContent = '', attributes = {}, contentEditable = false } = {}) {
    this.value = value;
    this.textContent = textContent;
    this.attributes = { ...attributes };
    this.isContentEditable = contentEditable;
    this.clicks = 0;
    this.focuses = 0;
    this.events = [];
    this.form = null;
  }
  click() { this.clicks += 1; }
  focus() { this.focuses += 1; }
  dispatchEvent(event) { this.events.push(event); return true; }
  getAttribute(name) { return this.attributes[name] ?? null; }
  setAttribute(name, value) { this.attributes[name] = String(value); }
}

export function makeChatPageFixture(options = {}) {
  const page = {
    href: options.href || 'https://chatgpt.com/g/g-p-enpal',
    composer: new FakeElement(),
    sendButton: new FakeElement(),
    voiceControl: new FakeElement({ attributes: { 'aria-pressed': options.voiceActive ? 'true' : 'false' } }),
    voiceActiveIndicator: options.voiceActive ? new FakeElement() : null,
    generatingIndicator: options.generating ? new FakeElement() : null,
    conversationRoot: new FakeElement(),
    chatMenu: new FakeElement(),
    renameAction: new FakeElement(),
    renameInput: new FakeElement(),
    rateLimitNotice: options.rateLimited ? new FakeElement({ textContent: 'Too many requests. Try again later.' }) : null,
    selectorMap: new Map(),
    mutationObservers: []
  };
  Object.defineProperty(page, 'sendClicks', { get: () => page.sendButton.clicks });
  page.document = {
    querySelector(selector) { return page.selectorMap.get(selector) || null; }
  };
  page.location = {
    get href() { return page.href; },
    set href(value) { page.href = value; }
  };
  return page;
}

function mapSelectors(page, selectors) {
  const categories = {
    composer: page.composer,
    sendButton: page.sendButton,
    voiceControl: page.voiceControl,
    voiceActive: page.voiceActiveIndicator,
    generating: page.generatingIndicator,
    conversationRoot: page.conversationRoot,
    chatMenu: page.chatMenu,
    renameAction: page.renameAction,
    renameInput: page.renameInput,
    rateLimitNotice: page.rateLimitNotice
  };
  for (const [category, element] of Object.entries(categories)) {
    if (!element) continue;
    for (const selector of selectors[category] || []) page.selectorMap.set(selector, element);
  }
}

export function loadChatgptAdapter(page) {
  const listeners = [];
  const chrome = {
    runtime: {
      onMessage: {
        addListener(listener) { listeners.push(listener); }
      }
    }
  };
  const EventClass = class {
    constructor(type, init = {}) { this.type = type; Object.assign(this, init); }
  };
  class FakeMutationObserver {
    constructor(callback) { this.callback = callback; this.observed = null; page.mutationObservers.push(this); }
    observe(target, options) { this.observed = { target, options }; }
    disconnect() { this.disconnected = true; }
  }
  const context = createClassicContext({
    document: page.document,
    location: page.location,
    chrome,
    Event: EventClass,
    InputEvent: EventClass,
    KeyboardEvent: EventClass,
    MutationObserver: FakeMutationObserver
  });
  runClassicScript(path.join(ROOT, 'config/selectors.js'), context);
  mapSelectors(page, context.ENPAL_SELECTORS);
  runClassicScript(path.join(ROOT, 'content/chatgpt-adapter.js'), context);
  return { ...context.EnPalChatGPTAdapter, listeners };
}

export function fakeDebuggerChrome(calls, options = {}) {
  return {
    debugger: {
      async attach(target, version) { calls.push({ name:'attach', target, version }); },
      async sendCommand(target, name, params) {
        calls.push({ name, target, params });
        if (options.throwOn === name) throw new Error('forced debugger failure');
        if (name === 'DOM.getDocument') return { root: { nodeId: 1 } };
        if (name === 'DOM.querySelector') {
          return { nodeId: options.missingSelectors?.includes(params.selector) ? 0 : 2 };
        }
        return {};
      },
      async detach(target) { calls.push({ name:'detach', target }); }
    }
  };
}
