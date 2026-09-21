(() => {
  const SELECTORS = Object.freeze({
    composer: Object.freeze([
      '#prompt-textarea',
      '[contenteditable="true"][data-lexical-editor="true"]',
      'textarea[placeholder*="Message"]'
    ]),
    sendControl: Object.freeze([
      'button[data-testid="send-button"]',
      'button[aria-label="Send prompt"]',
      'button[aria-label="Send message"]',
      'button[aria-label^="Send"]'
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

  const MASK_ATTRIBUTE = 'data-enpal-listening-mask';
  const MASK_STYLE_ATTRIBUTE = 'data-enpal-listening-mask-style';
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

  function normalizedPath(url) {
    const path = url.pathname.replace(/\/+$/, '');
    return path || '/';
  }

  function isConversationInsideProjectUrl(candidateUrl, projectUrl) {
    try {
      const candidate = new URL(candidateUrl);
      const project = new URL(projectUrl);
      const projectPath = normalizedPath(project);
      return candidate.origin === project.origin &&
        normalizedPath(candidate).startsWith(projectPath + '/c/');
    } catch {
      return false;
    }
  }

  function isAnyConversationUrl(candidateUrl) {
    try {
      const candidate = new URL(candidateUrl);
      return /\/c\/[^/]+/.test(normalizedPath(candidate));
    } catch {
      return false;
    }
  }

  function isProjectNewChatSurface(currentUrl, projectUrl) {
    try {
      const current = new URL(currentUrl);
      const project = new URL(projectUrl);
      const currentPath = normalizedPath(current);
      const projectPath = normalizedPath(project);
      const inProject = current.origin === project.origin &&
        (currentPath === projectPath || currentPath.startsWith(projectPath + '/'));
      return inProject && !isConversationInsideProjectUrl(currentUrl, projectUrl);
    } catch {
      return false;
    }
  }

  async function waitForProjectReady(
    projectUrl,
    { timeoutMs = 20_000, pollMs = 100 } = {}
  ) {
    let elapsed = 0;
    const timeout = Math.max(0, Number(timeoutMs) || 0);
    const poll = Math.max(1, Number(pollMs) || 1);

    while (elapsed <= timeout) {
      if (isConversationInsideProjectUrl(location.href, projectUrl)) {
        return failure('Configured ChatGPT Project opened an existing conversation instead of a new conversation surface');
      }
      if (isProjectNewChatSurface(location.href, projectUrl) && Boolean(first('composer'))) {
        return { ok: true, projectReady: true, url: String(location.href) };
      }
      if (elapsed >= timeout) break;
      const waitMs = Math.min(poll, timeout - elapsed);
      await sleep(waitMs);
      elapsed += waitMs;
    }

    return failure('Configured ChatGPT Project new conversation surface did not become ready');
  }

  async function waitForConversationUrl(
    projectUrl,
    { timeoutMs = 20_000, pollMs = 100 } = {}
  ) {
    let elapsed = 0;
    const timeout = Math.max(0, Number(timeoutMs) || 0);
    const poll = Math.max(1, Number(pollMs) || 1);

    while (elapsed <= timeout) {
      const currentUrl = String(location.href);
      if (isConversationInsideProjectUrl(currentUrl, projectUrl)) {
        return { ok: true, url: currentUrl };
      }
      if (isAnyConversationUrl(currentUrl)) {
        return {
          ok: false,
          code: 'WRONG_CHAT',
          message: 'ChatGPT created the conversation outside the configured Project'
        };
      }
      if (elapsed >= timeout) break;
      const waitMs = Math.min(poll, timeout - elapsed);
      await sleep(waitMs);
      elapsed += waitMs;
    }

    return failure('ChatGPT did not create a conversation URL before timeout');
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

  function countControlTurns() {
    const nodes = Array.from(document.querySelectorAll?.('[data-message-author-role="user"]') || []);
    return nodes.filter(node =>
      String(node.innerText ?? node.textContent ?? '').trimStart().startsWith('ENPAL_CONTROL\n')
    ).length;
  }

  async function focusComposer() {
    const composer = await waitForElement('composer');
    if (!composer) return failure('ChatGPT composer is unavailable');
    composer.focus?.();
    return { ok: true, focused: true, controlTurns: countControlTurns() };
  }

  function isEnabledControl(element) {
    return Boolean(element) &&
      element.disabled !== true &&
      element.getAttribute?.('disabled') == null &&
      element.getAttribute?.('aria-disabled') !== 'true';
  }

  function findSendControl() {
    const composer = first('composer');
    const scopedRoot = composer?.closest?.('form');
    const roots = scopedRoot ? [scopedRoot, document] : [document];

    for (const root of roots) {
      for (const selector of SELECTORS.sendControl) {
        const control = root.querySelector?.(selector);
        if (isEnabledControl(control)) return control;
      }
    }
    return null;
  }

  async function focusSendControl({ timeoutMs = 5_000, pollMs = 50 } = {}) {
    const timeout = Math.max(0, Number(timeoutMs) || 0);
    const poll = Math.max(1, Number(pollMs) || 1);
    let elapsed = 0;

    while (elapsed <= timeout) {
      const control = findSendControl();
      if (control) {
        control.focus?.();
        return { ok: true, focused: true };
      }
      if (elapsed >= timeout) break;
      const waitMs = Math.min(poll, timeout - elapsed);
      await sleep(waitMs);
      elapsed += waitMs;
    }

    return failure('ChatGPT Send control did not become enabled');
  }

  async function waitForControlSubmitted(
    previousControlTurns,
    { timeoutMs = 10_000, pollMs = 100 } = {}
  ) {
    const baseline = Math.max(0, Number(previousControlTurns) || 0);
    const timeout = Math.max(0, Number(timeoutMs) || 0);
    const poll = Math.max(1, Number(pollMs) || 1);
    let elapsed = 0;

    while (elapsed <= timeout) {
      const controlTurns = countControlTurns();
      if (controlTurns > baseline) {
        return { ok: true, submitted: true, controlTurns };
      }
      if (elapsed >= timeout) break;
      const waitMs = Math.min(poll, timeout - elapsed);
      await sleep(waitMs);
      elapsed += waitMs;
    }

    return failure('ChatGPT did not confirm the EnPal control message was submitted');
  }

  async function createConversation() {
    const composer = await waitForElement('composer');
    if (!composer) return failure('ChatGPT composer is unavailable');
    return { ok: true, ready: true };
  }

  function isGenerating() {
    return Boolean(first('generating'));
  }

  async function waitUntilIdle({
    timeoutMs = 30_000,
    pollMs = 100,
    activityGraceMs = 1_200,
    idleStabilityMs = 300
  } = {}) {
    const timeout = Math.max(0, Number(timeoutMs) || 0);
    const poll = Math.max(1, Number(pollMs) || 1);
    const grace = Math.max(0, Number(activityGraceMs) || 0);
    const stability = Math.max(0, Number(idleStabilityMs) || 0);
    let elapsed = 0;
    let sawGenerating = false;
    let idleSince = null;

    while (elapsed <= timeout) {
      if (isGenerating()) {
        sawGenerating = true;
        idleSince = null;
      } else if (sawGenerating || elapsed >= grace) {
        if (idleSince === null) idleSince = elapsed;
        if (elapsed - idleSince >= stability) {
          return { ok: true, idle: true, activityObserved: sawGenerating };
        }
      }

      if (elapsed >= timeout) break;
      const waitMs = Math.min(poll, timeout - elapsed);
      await sleep(waitMs);
      elapsed += waitMs;
    }
    return failure('ChatGPT did not become stably idle before timeout');
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


  function ensureMaskStyles() {
    if (!document.documentElement || typeof document.createElement !== 'function') return false;
    if (document.querySelector?.(`style[${MASK_STYLE_ATTRIBUTE}]`)) return true;

    const style = document.createElement('style');
    style.setAttribute(MASK_STYLE_ATTRIBUTE, '1');
    style.textContent = [
      `html[${MASK_ATTRIBUTE}="1"] [data-message-author-role]`,
      `html[${MASK_ATTRIBUTE}="1"] [data-testid="conversation-turns"]`,
      `html[${MASK_ATTRIBUTE}="1"] article[data-testid^="conversation-turn"]`
    ].join(',\\n') + ' { visibility: hidden !important; }';

    (document.head || document.documentElement).appendChild(style);
    return true;
  }

  function setListeningMask(armed) {
    if (!document.documentElement) {
      return { ok: false, code: 'CHAT_UI_UNAVAILABLE', armed: false };
    }

    if (armed === true) {
      if (!ensureMaskStyles()) {
        return { ok: false, code: 'CHAT_UI_UNAVAILABLE', armed: false };
      }
      document.documentElement.setAttribute(MASK_ATTRIBUTE, '1');
      return {
        ok: true,
        armed: document.documentElement.getAttribute(MASK_ATTRIBUTE) === '1'
      };
    }

    document.documentElement.removeAttribute(MASK_ATTRIBUTE);
    return { ok: true, armed: false };
  }

  async function handleMessage(message) {
    switch (message?.action) {
      case 'WAIT_PROJECT_READY':
        return waitForProjectReady(message.projectUrl, {
          timeoutMs: message.timeoutMs,
          pollMs: message.pollMs,
          stabilityMs: message.stabilityMs
        });
      case 'CREATE_CONVERSATION':
        return createConversation();
      case 'FOCUS_COMPOSER':
        return focusComposer();
      case 'FOCUS_SEND_CONTROL':
        return focusSendControl({
          timeoutMs: message.timeoutMs,
          pollMs: message.pollMs
        });
      case 'WAIT_CONTROL_SUBMITTED':
        return waitForControlSubmitted(message.previousControlTurns, {
          timeoutMs: message.timeoutMs,
          pollMs: message.pollMs
        });
      case 'WAIT_CONVERSATION_URL':
        return waitForConversationUrl(message.projectUrl, {
          timeoutMs: message.timeoutMs,
          pollMs: message.pollMs
        });
      case 'WAIT_IDLE':
        return waitUntilIdle({
          timeoutMs: message.timeoutMs,
          pollMs: message.pollMs,
          activityGraceMs: message.activityGraceMs,
          idleStabilityMs: message.idleStabilityMs
        });
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
        return setListeningMask(message.armed === true);
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
    waitForProjectReady,
    waitForConversationUrl,
    waitForControlSubmitted,
    focusComposer,
    focusSendControl,
    createConversation,
    waitUntilIdle,
    getConversationUrl,
    getVoiceState,
    focusVoiceControl,
    renameConversation,
    getRealtimeFeed,
    setListeningMask,
    handleMessage
  });
})();
