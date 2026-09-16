(() => {
  const selectors = globalThis.ENPAL_SELECTORS;
  if (!selectors) throw new Error('EnPal selectors are not loaded');

  const JOURNAL_KEY = 'enpal_journal_v1';
  const VEIL_ATTRIBUTE = 'data-enpal-conversation-veil';
  const BOOT_KEY = 'enpalBootVeil';

  function normalizeUrl(value) {
    try {
      const url = new URL(value);
      return `${url.origin}${url.pathname.replace(/\/$/, '')}`;
    } catch {
      return String(value || '').replace(/\/$/, '');
    }
  }

  function findConversationRoot() {
    for (const selector of selectors.conversationRoot || []) {
      const root = document.querySelector(selector);
      if (root) return root;
    }
    return null;
  }

  function installStyles() {
    const style = document.createElement('style');
    style.setAttribute('data-enpal-veil-style', '1');
    const bootRules = (selectors.conversationRoot || [])
      .map(selector => `html[data-enpal-boot-veil="1"] ${selector}`)
      .join(',\n');
    style.textContent = `${bootRules} { visibility: hidden !important; }\n` +
      `[${VEIL_ATTRIBUTE}] { visibility: hidden !important; }`;
    document.head.appendChild(style);
  }

  function setBootVeil(enabled) {
    if (enabled) document.documentElement.dataset[BOOT_KEY] = '1';
    else delete document.documentElement.dataset[BOOT_KEY];
  }

  function applyMode(mode) {
    const root = findConversationRoot();
    if (!root) return { ok: false, covered: false, reason: 'conversation-root-missing' };
    root.setAttribute(VEIL_ATTRIBUTE, mode);
    setBootVeil(false);
    return {
      ok: true,
      covered: root.getAttribute(VEIL_ATTRIBUTE) === mode,
      mode
    };
  }

  function armPreemptiveListeningMask() {
    setBootVeil(true);
    return applyMode('learning');
  }

  function applyListeningMask() {
    return applyMode('learning');
  }

  function applyProcessingVeil() {
    return applyMode('processing');
  }

  function removeConversationVeil() {
    findConversationRoot()?.removeAttribute(VEIL_ATTRIBUTE);
    setBootVeil(false);
    return { ok: true };
  }

  installStyles();
  setBootVeil(true);

  const ready = (async () => {
    try {
      const stored = await chrome.storage.local.get(JOURNAL_KEY);
      const pausedUrl = stored?.[JOURNAL_KEY]?.masked_paused_chat_url;
      if (pausedUrl && normalizeUrl(pausedUrl) === normalizeUrl(location.href)) {
        const result = applyListeningMask();
        if (!result.covered) setBootVeil(true);
        return result;
      }
      setBootVeil(false);
      return { ok: true, covered: false };
    } catch (error) {
      setBootVeil(false);
      return { ok: false, covered: false, reason: error?.message || String(error) };
    }
  })();

  globalThis.EnPalListeningMask = Object.freeze({
    ready,
    armPreemptiveListeningMask,
    applyListeningMask,
    applyProcessingVeil,
    removeConversationVeil
  });
})();
