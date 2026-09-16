(() => {
  const selectors = globalThis.ENPAL_SELECTORS;
  if (!selectors) throw new Error('EnPal selectors are not loaded');

  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  function first(category) {
    for (const selector of selectors[category] || []) {
      const element = document.querySelector(selector);
      if (element) return element;
    }
    return null;
  }

  async function waitForElement(category, { timeoutMs = 20_000, pollMs = 100 } = {}) {
    let elapsed = 0;
    while (elapsed <= timeoutMs) {
      const element = first(category);
      if (element) return element;
      if (elapsed === timeoutMs) break;
      const waitMs = Math.min(pollMs, timeoutMs - elapsed);
      await sleep(waitMs);
      elapsed += waitMs;
    }
    throw new Error(`selector-missing:${category}`);
  }

  function emitInput(element) {
    const EventType = globalThis.InputEvent || globalThis.Event;
    element.dispatchEvent(new EventType('input', { bubbles: true, inputType: 'insertText' }));
  }

  function setElementValue(element, text) {
    element.focus?.();
    if ('value' in element) {
      const prototype = Object.getPrototypeOf(element);
      const descriptor = prototype && Object.getOwnPropertyDescriptor(prototype, 'value');
      if (descriptor?.set) descriptor.set.call(element, text);
      else element.value = text;
    } else {
      element.textContent = text;
    }
    emitInput(element);
  }

  async function sendText(text) {
    const composer = await waitForElement('composer');
    setElementValue(composer, text);
    const send = await waitForElement('sendButton');
    send.click();
    return { ok: true };
  }

  function normalizeUrl(value) {
    try {
      const url = new URL(value);
      const path = url.pathname.replace(/\/$/, '');
      return `${url.origin}${path}`;
    } catch {
      return String(value || '').replace(/\/$/, '');
    }
  }

  function getCurrentChatUrl() {
    return normalizeUrl(location.href);
  }

  function verifyCurrentChat(expectedUrl) {
    return getCurrentChatUrl() === normalizeUrl(expectedUrl);
  }

  function isVoiceActive() {
    if (first('voiceActive')) return true;
    return first('voiceControl')?.getAttribute?.('aria-pressed') === 'true';
  }

  function isAssistantGenerating() {
    return Boolean(first('generating'));
  }

  function detectConversationRateLimit() {
    const notice = first('rateLimitNotice');
    if (!notice) return false;
    const testId = notice.getAttribute?.('data-testid') || '';
    if (/rate-limit/i.test(testId)) return true;
    return /rate limit|too many requests|try again later/i.test(notice.textContent || '');
  }

  async function waitForPostVoiceSettle({
    quietMs = 1_200,
    totalTimeoutMs = 20_000,
    pollMs = 100
  } = {}) {
    const startedAt = Date.now();
    while (isVoiceActive()) {
      if (Date.now() - startedAt >= totalTimeoutMs) {
        throw new Error('post-voice-settle-timeout:voice-active');
      }
      await sleep(pollMs);
    }

    const remainingAfterVoice = Math.max(0, totalTimeoutMs - (Date.now() - startedAt));
    await waitForElement('composer', { timeoutMs: remainingAfterVoice, pollMs });
    const remainingAfterComposer = Math.max(0, totalTimeoutMs - (Date.now() - startedAt));
    const root = await waitForElement('conversationRoot', { timeoutMs: remainingAfterComposer, pollMs });
    const remaining = Math.max(0, totalTimeoutMs - (Date.now() - startedAt));

    return new Promise((resolve, reject) => {
      let quietTimer;
      let totalTimer;
      const observer = new MutationObserver(() => scheduleQuiet());

      const cleanup = () => {
        clearTimeout(quietTimer);
        clearTimeout(totalTimer);
        observer.disconnect();
      };
      const finish = () => {
        cleanup();
        resolve({ ok: true, settled: true });
      };
      const scheduleQuiet = () => {
        clearTimeout(quietTimer);
        quietTimer = setTimeout(finish, quietMs);
      };

      observer.observe(root, { childList: true, subtree: true });
      totalTimer = setTimeout(() => {
        cleanup();
        reject(new Error('post-voice-settle-timeout:mutations'));
      }, remaining);
      scheduleQuiet();
    });
  }

  async function renameCurrentChat(title) {
    if (detectConversationRateLimit()) return { ok: false, reason: 'rate-limited' };
    if (isAssistantGenerating()) return { ok: false, reason: 'not-idle' };
    try {
      const menu = await waitForElement('chatMenu', { timeoutMs: 2_000 });
      menu.click();
      const renameAction = await waitForElement('renameAction', { timeoutMs: 2_000 });
      renameAction.click();
      const input = await waitForElement('renameInput', { timeoutMs: 2_000 });
      setElementValue(input, title);
      if (typeof input.form?.requestSubmit === 'function') {
        input.form.requestSubmit();
      } else {
        const EventType = globalThis.KeyboardEvent || globalThis.Event;
        input.dispatchEvent(new EventType('keydown', {
          key: 'Enter', code: 'Enter', bubbles: true, cancelable: true
        }));
      }
      return { ok: true, title };
    } catch (error) {
      const reason = String(error?.message || '').startsWith('selector-missing:')
        ? 'selector-missing'
        : 'unknown';
      return { ok: false, reason };
    }
  }

  async function handleMessage(message) {
    switch (message?.type) {
      case 'ENPAL_SEND_TEXT':
        return sendText(message.text);
      case 'ENPAL_GET_CHAT_URL':
        return { ok: true, url: getCurrentChatUrl() };
      case 'ENPAL_VERIFY_CHAT':
        return { ok: true, matches: verifyCurrentChat(message.chatUrl) };
      case 'ENPAL_IS_VOICE_ACTIVE':
        return { ok: true, active: isVoiceActive() };
      case 'ENPAL_IS_GENERATING':
        return { ok: true, generating: isAssistantGenerating() };
      case 'ENPAL_RENAME_CHAT':
        return renameCurrentChat(message.title);
      case 'ENPAL_DETECT_RATE_LIMIT':
        return { ok: true, rateLimited: detectConversationRateLimit() };
      case 'ENPAL_MASK_ARM':
        return globalThis.EnPalListeningMask?.armPreemptiveListeningMask?.() || { ok:false, covered:false, reason:'mask-unavailable' };
      case 'ENPAL_MASK_ON':
        return globalThis.EnPalListeningMask?.applyListeningMask?.() || { ok:false, covered:false, reason:'mask-unavailable' };
      case 'ENPAL_PROCESSING_VEIL_ON':
        return globalThis.EnPalListeningMask?.applyProcessingVeil?.() || { ok:false, covered:false, reason:'mask-unavailable' };
      case 'ENPAL_VEIL_OFF':
        return globalThis.EnPalListeningMask?.removeConversationVeil?.() || { ok:false, reason:'mask-unavailable' };
      case 'ENPAL_WAIT_POST_VOICE_SETTLE':
        return waitForPostVoiceSettle();
      default:
        return { ok: false, reason: 'unsupported-action' };
    }
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    Promise.resolve(handleMessage(message))
      .then(sendResponse)
      .catch(error => sendResponse({ ok: false, reason: 'unknown', error: error?.message || String(error) }));
    return true;
  });

  globalThis.EnPalChatGPTAdapter = Object.freeze({
    sendText,
    getCurrentChatUrl,
    verifyCurrentChat,
    isVoiceActive,
    isAssistantGenerating,
    waitForPostVoiceSettle,
    renameCurrentChat,
    detectConversationRateLimit,
    handleMessage
  });
})();
