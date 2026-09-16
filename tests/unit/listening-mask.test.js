import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadClassicScript } from '../helpers/load-classic-script.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PAUSED_URL = 'https://chatgpt.com/g/g-p-enpal/c/1';

class Element {
  constructor() { this.attributes = {}; this.children = []; this.textContent = ''; }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes[name] ?? null; }
  removeAttribute(name) { delete this.attributes[name]; }
  appendChild(child) { this.children.push(child); return child; }
}

function makeMaskHarness({ href = PAUSED_URL, maskedPausedChatUrl = null } = {}) {
  const conversation = new Element();
  const composer = new Element();
  const documentElement = new Element();
  documentElement.dataset = {};
  const head = new Element();
  const selectorMap = new Map();
  const selectors = {
    conversationRoot: ['main [data-testid="conversation-turns"]'],
    composer: ['#prompt-textarea']
  };
  selectorMap.set(selectors.conversationRoot[0], conversation);
  selectorMap.set(selectors.composer[0], composer);
  const document = {
    documentElement,
    head,
    createElement() { return new Element(); },
    querySelector(selector) { return selectorMap.get(selector) || null; }
  };
  const chrome = {
    storage: {
      local: {
        async get() {
          return {
            enpal_journal_v1: { masked_paused_chat_url: maskedPausedChatUrl }
          };
        }
      }
    }
  };
  const context = loadClassicScript(path.join(ROOT, 'content/listening-mask.js'), {
    document,
    location: { href },
    chrome,
    ENPAL_SELECTORS: selectors
  });
  const api = context.EnPalListeningMask;
  return {
    api,
    conversation,
    composer,
    documentElement,
    isConversationReadable() {
      return !conversation.getAttribute('data-enpal-conversation-veil') &&
        documentElement.dataset.enpalBootVeil !== '1';
    },
    conversationHidden() {
      return Boolean(conversation.getAttribute('data-enpal-conversation-veil')) ||
        documentElement.dataset.enpalBootVeil === '1';
    },
    composerUsable() {
      return composer.getAttribute('data-enpal-conversation-veil') === null;
    }
  };
}

test('FULL_VOICE paused chat is masked again at document_start', async () => {
  const mask = makeMaskHarness({ maskedPausedChatUrl: PAUSED_URL });
  await mask.api.ready;
  assert.equal(mask.isConversationReadable(), false);
});

test('non-paused chat removes only the boot veil after journal check', async () => {
  const mask = makeMaskHarness({ maskedPausedChatUrl: null });
  await mask.api.ready;
  assert.equal(mask.isConversationReadable(), true);
});

test('processing veil hides conversation but not composer controls', async () => {
  const mask = makeMaskHarness();
  await mask.api.ready;
  const result = mask.api.applyProcessingVeil();
  assert.equal(result.covered, true);
  assert.equal(mask.conversationHidden(), true);
  assert.equal(mask.composerUsable(), true);
});

test('removing veil makes conversation readable again', async () => {
  const mask = makeMaskHarness();
  await mask.api.ready;
  mask.api.applyListeningMask();
  mask.api.removeConversationVeil();
  assert.equal(mask.isConversationReadable(), true);
});
