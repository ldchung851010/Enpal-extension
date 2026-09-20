import { isEnpalControl } from '../core/control-envelope.js';
import { EnpalError, ERROR_CODES } from '../core/errors.js';

function normalizeUrl(value) {
  const url = new URL(value);
  url.hash = '';
  if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, '');
  return `${url.origin}${url.pathname}${url.search}`;
}

export function createChatGptAdapter(chromeApi = chrome, {
  sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
  voiceTimeoutMs = 8_000,
  voicePollMs = 200
} = {}) {
  async function sendToTab(tabId, action, payload = {}, { throwOnFailure = true } = {}) {
    const response = await chromeApi.tabs.sendMessage(tabId, {
      target: 'ENPAL_CHATGPT',
      action,
      ...payload
    });

    if (response?.ok === true || !throwOnFailure) return response ?? {
      ok: false,
      code: ERROR_CODES.CHAT_UI_UNAVAILABLE
    };

    throw new EnpalError(
      response?.code || ERROR_CODES.CHAT_UI_UNAVAILABLE,
      response?.message || `ChatGPT action failed: ${action}`,
      true
    );
  }

  async function openTab(url) {
    const tab = await chromeApi.tabs.create({ url: normalizeUrl(url), active: true });
    if (!Number.isInteger(tab?.id)) {
      throw new EnpalError(
        ERROR_CODES.CHAT_UI_UNAVAILABLE,
        'ChatGPT tab could not be opened',
        true
      );
    }
    return tab.id;
  }

  async function getVoiceState(tabId) {
    const response = await sendToTab(tabId, 'GET_VOICE_STATE');
    return response.active === true;
  }

  async function waitForVoiceState(tabId, desiredActive) {
    let elapsed = 0;
    while (elapsed <= voiceTimeoutMs) {
      if ((await getVoiceState(tabId)) === desiredActive) return true;
      if (elapsed === voiceTimeoutMs) break;
      const waitMs = Math.min(voicePollMs, voiceTimeoutMs - elapsed);
      await sleep(waitMs);
      elapsed += waitMs;
    }
    return false;
  }

  async function setVoice(tabId, desiredActive) {
    if ((await getVoiceState(tabId)) === desiredActive) {
      return { ok: true, active: desiredActive, changed: false };
    }

    await sendToTab(tabId, 'FOCUS_VOICE_CONTROL');
    const activation = await chromeApi.runtime.sendMessage({
      type: 'ENPAL_TRUSTED_ACTIVATE',
      tabId
    });

    const code = desiredActive ? ERROR_CODES.VOICE_START_FAILED : ERROR_CODES.VOICE_STOP_FAILED;
    if (activation?.ok !== true) {
      throw new EnpalError(code, activation?.error || 'Trusted Voice activation failed', true);
    }

    if (!(await waitForVoiceState(tabId, desiredActive))) {
      throw new EnpalError(
        code,
        `Voice did not become ${desiredActive ? 'active' : 'inactive'}`,
        true
      );
    }

    return { ok: true, active: desiredActive, changed: true };
  }

  return {
    async openProject(projectUrl) {
      return openTab(projectUrl);
    },

    async createConversation(tabId) {
      return sendToTab(tabId, 'CREATE_CONVERSATION');
    },

    async openConversation(url) {
      return openTab(url);
    },

    async sendControl(tabId, controlText) {
      if (!isEnpalControl(controlText)) {
        throw new TypeError('sendControl requires an ENPAL_CONTROL envelope');
      }
      return sendToTab(tabId, 'SEND_CONTROL', { text: controlText });
    },

    async waitUntilIdle(tabId) {
      return sendToTab(tabId, 'WAIT_IDLE');
    },

    async getConversationUrl(tabId) {
      const response = await sendToTab(tabId, 'GET_CONVERSATION_URL');
      return response.url;
    },

    async startVoice(tabId) {
      return setVoice(tabId, true);
    },

    async stopVoice(tabId) {
      return setVoice(tabId, false);
    },

    async renameConversation(tabId, title) {
      return sendToTab(
        tabId,
        'RENAME_CONVERSATION',
        { title },
        { throwOnFailure: false }
      );
    },

    async getRealtimeFeed(tabId) {
      const response = await sendToTab(tabId, 'GET_REALTIME_FEED');
      return Array.isArray(response.turns) ? response.turns : [];
    },

    async setListeningMask(tabId, armed) {
      return sendToTab(
        tabId,
        'SET_LISTENING_MASK',
        { armed: armed === true },
        { throwOnFailure: false }
      );
    }
  };
}
