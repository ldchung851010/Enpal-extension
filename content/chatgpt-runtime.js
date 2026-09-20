(() => {
  const SELECTORS = Object.freeze({
    composer: Object.freeze([
      '#prompt-textarea',
      '[contenteditable="true"][data-lexical-editor="true"]',
      'textarea[placeholder*="Message"]'
    ]),
    sendButton: Object.freeze([
      'button[data-testid="send-button"]',
      'button[aria-label="Send prompt"]',
      'button[aria-label*="Send"]'
    ]),
    generating: Object.freeze([
      'button[data-testid="stop-button"]',
      'button[aria-label="Stop generating"]',
      'button[aria-label*="Stop generating"]'
    ]),
    voiceControl: Object.freeze([
      'button[data-testid="voice-mode-button"]',
      'button[aria-label="Start voice mode"]',
      'button[aria-label*="Voice"]'
    ]),
    voiceActive: Object.freeze([
      '[data-testid="voice-mode-active"]',
      '[data-voice-state="active"]'
    ]),
    chatMenu: Object.freeze([
      'button[data-testid="conversation-options-button"]',
      'button[aria-label="Chat options"]',
      'button[aria-label*="conversation options"]'
    ]),
    renameAction: Object.freeze([
      '[role="menuitem"][data-testid="rename-conversation"]',
      '[role="menuitem"][aria-label="Rename"]',
      'button[aria-label="Rename"]'
    ]),
    renameInput: Object.freeze([
      'input[data-testid="rename-conversation-input"]',
      'input[aria-label="Rename conversation"]',
      'input[aria-label*="Rename"]'
    ])
  });

  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  function first(category) {
    for (const selector of SELECTORS[category] || []) {
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
    return null;
  }

  function failure(message = 'Required ChatGPT UI is unavailable') {
    return { ok: false, code: 'CHAT_UI_UNAVAILABLE', message };
  }

  function emitInput(element) {
    const EventType = globalThis.InputEvent || globalThis.Event;
    element.dispatchEvent(new EventType('input', {
      bubbles: true,
      inputType: 'insertText'
    }));
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

  async function createConversation() {
    const composer = await waitForElement('composer');
    if (!composer) return failure('ChatGPT composer is unavailable');
    return { ok: true, ready: true };
  }

  async function sendControl(text) {
    if (typeof text !== 'string' || !text.startsWith('ENPAL_CONTROL\n')) {
      return failure('SEND_CONTROL requires an ENPAL_CONTROL envelope');
    }

    const composer = await waitForElement('composer');
    if (!composer) return failure('ChatGPT composer is unavailable');
    setElementValue(composer, text);

    const sendButton = await waitForElement('sendButton');
    if (!sendButton || sendButton.disabled === true) {
      return failure('ChatGPT Send control is unavailable');
    }
    sendButton.click();
    return { ok: true, sent: true };
  }

  function isGenerating() {
    return Boolean(first('generating'));
  }

  async function waitUntilIdle({ timeoutMs = 20_000, pollMs = 100 } = {}) {
    let elapsed = 0;
    while (elapsed <= timeoutMs) {
      if (!isGenerating()) return { ok: true, idle: true };
      if (elapsed === timeoutMs) break;
      const waitMs = Math.min(pollMs, timeoutMs - elapsed);
      await sleep(waitMs);
      elapsed += waitMs;
    }
    return failure('ChatGPT did not become idle before timeout');
  }

  function getConversationUrl() {
    return { ok: true, url: String(location.href) };
  }

  function getVoiceState() {
    const control = first('voiceControl');
    const active = Boolean(first('voiceActive')) || control?.getAttribute?.('aria-pressed') === 'true';
    return { ok: true, active };
  }

  async function focusVoiceControl() {
    const control = await waitForElement('voiceControl', { timeoutMs: 5_000 });
    if (!control) return failure('ChatGPT Voice control is unavailable');
    control.focus?.();
    return { ok: true, focused: true };
  }

  async function renameConversation(title) {
    try {
      const menu = await waitForElement('chatMenu', { timeoutMs: 2_000 });
      if (!menu) return failure('Chat options are unavailable');
      menu.click();

      const renameAction = await waitForElement('renameAction', { timeoutMs: 2_000 });
      if (!renameAction) return failure('Rename action is unavailable');
      renameAction.click();

      const input = await waitForElement('renameInput', { timeoutMs: 2_000 });
      if (!input) return failure('Rename input is unavailable');
      setElementValue(input, String(title ?? ''));

      if (typeof input.form?.requestSubmit === 'function') {
        input.form.requestSubmit();
      } else {
        const EventType = globalThis.KeyboardEvent || globalThis.Event;
        input.dispatchEvent(new EventType('keydown', {
          key: 'Enter',
          code: 'Enter',
          bubbles: true,
          cancelable: true
        }));
      }
      return { ok: true, title: String(title ?? '') };
    } catch {
      return failure('Rename failed');
    }
  }

  function getRealtimeFeed() {
    const nodes = Array.from(document.querySelectorAll?.('[data-message-author-role]') || []);
    const turns = nodes.map(node => ({
      role: node.getAttribute?.('data-message-author-role') || 'unknown',
      text: String(node.innerText ?? node.textContent ?? '').trim()
    })).filter(turn => turn.text !== '');
    return { ok: true, turns };
  }

  async function handleMessage(message) {
    switch (message?.action) {
      case 'CREATE_CONVERSATION':
        return createConversation();
      case 'SEND_CONTROL':
        return sendControl(message.text);
      case 'WAIT_IDLE':
        return waitUntilIdle({ timeoutMs: message.timeoutMs, pollMs: message.pollMs });
      case 'GET_CONVERSATION_URL':
        return getConversationUrl();
      case 'GET_VOICE_STATE':
        return getVoiceState();
      case 'FOCUS_VOICE_CONTROL':
        return focusVoiceControl();
      case 'RENAME_CONVERSATION':
        return renameConversation(message.title);
      case 'GET_REALTIME_FEED':
        return getRealtimeFeed();
      case 'SET_LISTENING_MASK':
        return { ok: false, code: 'CHAT_UI_UNAVAILABLE', armed: false };
      default:
        return failure(`Unsupported ChatGPT action: ${String(message?.action || '')}`);
    }
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.target !== 'ENPAL_CHATGPT') return false;
    Promise.resolve(handleMessage(message))
      .then(sendResponse)
      .catch(error => sendResponse(failure(error?.message || String(error))));
    return true;
  });

  globalThis.EnPalChatGptRuntime = Object.freeze({
    createConversation,
    sendControl,
    waitUntilIdle,
    getConversationUrl,
    getVoiceState,
    focusVoiceControl,
    renameConversation,
    getRealtimeFeed,
    handleMessage
  });
})();
