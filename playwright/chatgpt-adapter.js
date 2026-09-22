import { isEnpalControl } from '../core/control-envelope.js';
import { EnpalError, ERROR_CODES } from '../core/errors.js';
import { createChatGptPage } from './chatgpt-page.js';

const VOICE_CONTROL_SELECTORS = Object.freeze([
  'button[data-testid="voice-mode-button"]',
  'button[aria-label="Start voice mode"]',
  'button[aria-label*="Voice" i]'
]);

const VOICE_ACTIVE_SELECTORS = Object.freeze([
  '[data-testid="voice-mode-active"]',
  '[data-voice-state="active"]'
]);

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function firstVisible(page, selectors) {
  for (const selector of selectors) {
    const locator = page.locator(selector);
    const count = await locator.count().catch(() => 0);
    for (let index = 0; index < count; index += 1) {
      const candidate = locator.nth(index);
      if (await candidate.isVisible().catch(() => false)) return candidate;
    }
  }
  return null;
}

async function voiceState(page) {
  for (const selector of VOICE_ACTIVE_SELECTORS) {
    if (await page.locator(selector).first().isVisible().catch(() => false)) {
      return true;
    }
  }

  const control = await firstVisible(page, VOICE_CONTROL_SELECTORS);
  if (!control) return false;

  return control.evaluate(element =>
    element.getAttribute('aria-pressed') === 'true'
  ).catch(() => false);
}

async function setVoice(page, desiredActive, {
  timeoutMs = 8_000,
  pollMs = 100
} = {}) {
  const before = await voiceState(page);
  if (before === desiredActive) {
    return { ok: true, active: desiredActive, changed: false };
  }

  const control = await firstVisible(page, VOICE_CONTROL_SELECTORS);
  if (!control) {
    throw new EnpalError(
      desiredActive ? ERROR_CODES.VOICE_START_FAILED : ERROR_CODES.VOICE_STOP_FAILED,
      'ChatGPT Voice control is unavailable',
      true
    );
  }

  await control.focus();
  const focused = await control.evaluate(element =>
    document.activeElement === element
  ).catch(() => false);

  if (!focused) {
    throw new EnpalError(
      desiredActive ? ERROR_CODES.VOICE_START_FAILED : ERROR_CODES.VOICE_STOP_FAILED,
      'ChatGPT Voice control could not receive keyboard focus',
      true
    );
  }

  await page.keyboard.press('Enter');

  const deadline = Date.now() + timeoutMs;
  do {
    const current = await voiceState(page);
    if (current === desiredActive) {
      return { ok: true, active: desiredActive, changed: true };
    }
    if (Date.now() >= deadline) break;
    await sleep(pollMs);
  } while (true);

  throw new EnpalError(
    desiredActive ? ERROR_CODES.VOICE_START_FAILED : ERROR_CODES.VOICE_STOP_FAILED,
    'ChatGPT Voice did not become ' + (desiredActive ? 'active' : 'inactive'),
    true
  );
}

export function createPlaywrightChatGptAdapter({
  context,
  initialPage = null,
  chatgptPageOptions = {},
  voiceOptions = {}
} = {}) {
  if (!context) throw new TypeError('Playwright BrowserContext is required');

  let nextTabId = 1;
  let reusableInitialPage = initialPage;
  const tabs = new Map();

  function register(page, metadata = {}) {
    const tabId = nextTabId++;
    tabs.set(tabId, {
      page,
      projectUrl: metadata.projectUrl ?? null,
      chatgpt: createChatGptPage(page, chatgptPageOptions)
    });
    return tabId;
  }

  function requireTab(tabId) {
    const entry = tabs.get(tabId);
    if (!entry) {
      throw new EnpalError(
        ERROR_CODES.CHAT_UI_UNAVAILABLE,
        'Unknown Playwright ChatGPT tab: ' + tabId,
        true
      );
    }
    return entry;
  }

  async function allocatePage() {
    if (reusableInitialPage && !reusableInitialPage.isClosed()) {
      const page = reusableInitialPage;
      reusableInitialPage = null;
      return page;
    }
    return context.newPage();
  }

  async function open(url, metadata = {}) {
    const page = await allocatePage();
    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: 120_000
    });
    return register(page, metadata);
  }

  return {
    async openProject(projectUrl) {
      return open(projectUrl, { projectUrl });
    },

    async waitForProjectReady(tabId, projectUrl) {
      const entry = requireTab(tabId);
      entry.projectUrl = projectUrl;
      return entry.chatgpt.waitForProjectReady(projectUrl);
    },

    async createConversation(tabId) {
      const entry = requireTab(tabId);
      if (!entry.projectUrl) {
        throw new EnpalError(
          ERROR_CODES.CHAT_UI_UNAVAILABLE,
          'Project identity is unavailable before conversation creation',
          true
        );
      }

      // ChatGPT's current Project route is itself the new-chat surface.
      // The physical conversation is created by the first submitted user turn.
      return { ok: true, ready: true, deferredUntilFirstTurn: true };
    },

    async openConversation(url) {
      return open(url);
    },

    async sendControl(tabId, controlText) {
      if (!isEnpalControl(controlText)) {
        throw new TypeError('sendControl requires an ENPAL_CONTROL envelope');
      }

      const entry = requireTab(tabId);
      if (!entry.projectUrl) {
        // For an already-bound conversation, derive the Project root from /c/.
        const current = new URL(entry.page.url());
        const match = current.pathname.match(/^(.*)\/c\/[^/]+/);
        if (match) entry.projectUrl = current.origin + match[1];
      }

      if (!entry.projectUrl) {
        throw new EnpalError(
          ERROR_CODES.CHAT_UI_UNAVAILABLE,
          'Configured Project URL is unavailable for control submission',
          true
        );
      }

      return entry.chatgpt.sendMessage(controlText, entry.projectUrl);
    },

    async waitForConversationUrl(tabId, projectUrl) {
      const entry = requireTab(tabId);
      entry.projectUrl = projectUrl;
      return entry.chatgpt.waitForConversationUrl(projectUrl);
    },

    async waitUntilIdle(tabId) {
      return requireTab(tabId).chatgpt.waitUntilIdle();
    },

    async getConversationUrl(tabId) {
      return requireTab(tabId).page.url();
    },

    async startVoice(tabId) {
      return setVoice(requireTab(tabId).page, true, voiceOptions);
    },

    async stopVoice(tabId) {
      return setVoice(requireTab(tabId).page, false, voiceOptions);
    },

    async renameConversation() {
      return { ok: false, unsupported: true };
    },

    async getRealtimeFeed() {
      return [];
    },

    async setListeningMask(_tabId, armed) {
      if (armed === true) {
        throw new EnpalError(
          ERROR_CODES.MASK_REQUIRED,
          'Playwright Listening Mask is not implemented yet',
          true
        );
      }
      return { ok: true, armed: false };
    },

    async closeTab(tabId) {
      const entry = requireTab(tabId);
      tabs.delete(tabId);
      await entry.page.close().catch(() => {});
    }
  };
}
