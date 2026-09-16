function normalizeUrl(value) {
  const url = new URL(value);
  return `${url.origin}${url.pathname.replace(/\/$/, '')}`;
}

function belongsToProjectChat(chatUrl, projectUrl) {
  try {
    const chat = new URL(chatUrl);
    const project = new URL(projectUrl);
    const projectPath = project.pathname.replace(/\/$/, '');
    return chat.origin === project.origin &&
      chat.pathname.startsWith(`${projectPath}/c/`);
  } catch {
    return false;
  }
}

export function createChatGPTClient(chromeApi = chrome, {
  sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
  defaultWaitMs = 20_000,
  defaultPollMs = 100,
  voiceWaitMs = 8_000,
  voicePollMs = 250
} = {}) {
  async function message(tabId, payload) {
    const response = await chromeApi.tabs.sendMessage(tabId, payload);
    if (!response?.ok) {
      const error = new Error(response?.error || response?.reason || 'ChatGPT adapter failed');
      error.reason = response?.reason || 'unknown';
      throw error;
    }
    return response;
  }

  async function openProject(projectUrl) {
    const tab = await chromeApi.tabs.create({ url: normalizeUrl(projectUrl), active: true });
    return tab.id;
  }

  async function openChat(chatUrl) {
    const tab = await chromeApi.tabs.create({ url: normalizeUrl(chatUrl), active: true });
    return tab.id;
  }

  async function sendText(tabId, text) {
    await message(tabId, { type: 'ENPAL_SEND_TEXT', text });
  }

  async function getCurrentChatUrl(tabId) {
    return (await message(tabId, { type: 'ENPAL_GET_CHAT_URL' })).url;
  }

  async function verifyCurrentChat(tabId, chatUrl) {
    return (await message(tabId, { type: 'ENPAL_VERIFY_CHAT', chatUrl })).matches === true;
  }

  async function isVoiceActive(tabId) {
    return (await message(tabId, { type: 'ENPAL_IS_VOICE_ACTIVE' })).active === true;
  }

  async function isAssistantGenerating(tabId) {
    return (await message(tabId, { type: 'ENPAL_IS_GENERATING' })).generating === true;
  }

  async function detectConversationRateLimit(tabId) {
    return (await message(tabId, { type: 'ENPAL_DETECT_RATE_LIMIT' })).rateLimited === true;
  }

  async function waitForConversationUrl(tabId, projectUrl, options = {}) {
    const timeoutMs = options.timeoutMs ?? defaultWaitMs;
    const pollMs = options.pollMs ?? defaultPollMs;
    let elapsed = 0;
    while (elapsed <= timeoutMs) {
      const url = await getCurrentChatUrl(tabId);
      if (belongsToProjectChat(url, projectUrl)) return normalizeUrl(url);
      if (elapsed === timeoutMs) break;
      const waitMs = Math.min(pollMs, timeoutMs - elapsed);
      await sleep(waitMs);
      elapsed += waitMs;
    }
    throw new Error('Timed out waiting for Project conversation URL');
  }

  async function trustedActivate(tabId) {
    const response = await chromeApi.runtime.sendMessage({
      type: 'ENPAL_TRUSTED_ACTIVATE',
      tabId
    });
    if (!response?.ok) {
      throw new Error(response?.error || 'Trusted Voice activation failed');
    }
  }

  async function waitForVoiceState(tabId, desiredActive) {
    let elapsed = 0;
    while (elapsed <= voiceWaitMs) {
      if ((await isVoiceActive(tabId)) === desiredActive) return;
      if (elapsed === voiceWaitMs) break;
      const waitMs = Math.min(voicePollMs, voiceWaitMs - elapsed);
      await sleep(waitMs);
      elapsed += waitMs;
    }
    throw new Error(`Voice state did not become ${desiredActive ? 'active' : 'inactive'}`);
  }

  async function startVoice(tabId) {
    if (await isVoiceActive(tabId)) return { ok: true, alreadyActive: true };
    await trustedActivate(tabId);
    try {
      await waitForVoiceState(tabId, true);
    } catch (cause) {
      const error = new Error('Voice failed to start');
      error.name = 'VoiceStartError';
      error.cause = cause;
      throw error;
    }
    return { ok: true, alreadyActive: false };
  }

  async function stopVoice(tabId) {
    if (!(await isVoiceActive(tabId))) return { ok: true, alreadyInactive: true };
    await trustedActivate(tabId);
    try {
      await waitForVoiceState(tabId, false);
      return { ok: true, alreadyInactive: false, attempts: 1 };
    } catch {
      await trustedActivate(tabId);
      try {
        await waitForVoiceState(tabId, false);
        return { ok: true, alreadyInactive: false, attempts: 2 };
      } catch (cause) {
        const error = new Error('Voice failed to stop');
        error.name = 'VoiceStopError';
        error.cause = cause;
        throw error;
      }
    }
  }

  async function requireCovered(tabId, type) {
    const response = await message(tabId, { type });
    if (response.covered !== true) {
      throw new Error('Listening mask is not covered');
    }
    return response;
  }

  async function armPreemptiveListeningMask(tabId) {
    return requireCovered(tabId, 'ENPAL_MASK_ARM');
  }

  async function applyListeningMask(tabId) {
    return requireCovered(tabId, 'ENPAL_MASK_ON');
  }

  async function applyProcessingVeil(tabId) {
    return requireCovered(tabId, 'ENPAL_PROCESSING_VEIL_ON');
  }

  async function removeConversationVeil(tabId) {
    return message(tabId, { type: 'ENPAL_VEIL_OFF' });
  }

  async function waitForPostVoiceSettle(tabId) {
    return message(tabId, { type: 'ENPAL_WAIT_POST_VOICE_SETTLE' });
  }

  async function renameCurrentChat(tabId, title) {
    try {
      if (await isAssistantGenerating(tabId)) return { ok: false, reason: 'not-idle' };
      if (await detectConversationRateLimit(tabId)) return { ok: false, reason: 'rate-limited' };
      const response = await chromeApi.tabs.sendMessage(tabId, { type: 'ENPAL_RENAME_CHAT', title });
      if (response?.ok) return { ok: true, title: response.title || title };
      return { ok: false, reason: response?.reason || 'unknown' };
    } catch (error) {
      return { ok: false, reason: error?.reason || 'unknown' };
    }
  }

  return {
    openProject,
    openChat,
    sendText,
    waitForConversationUrl,
    getCurrentChatUrl,
    verifyCurrentChat,
    isVoiceActive,
    isAssistantGenerating,
    startVoice,
    stopVoice,
    armPreemptiveListeningMask,
    applyListeningMask,
    applyProcessingVeil,
    removeConversationVeil,
    waitForPostVoiceSettle,
    renameCurrentChat,
    detectConversationRateLimit
  };
}
