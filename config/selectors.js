(() => {
  const freeze = values => Object.freeze(values);
  globalThis.ENPAL_SELECTORS = Object.freeze({
    composer: freeze([
      '#prompt-textarea',
      '[contenteditable="true"][data-lexical-editor="true"]',
      'textarea[placeholder*="Message"]'
    ]),
    sendButton: freeze([
      'button[data-testid="send-button"]',
      'button[aria-label="Send prompt"]',
      'button[aria-label*="Send"]'
    ]),
    voiceControl: freeze([
      'button[data-testid="voice-mode-button"]',
      'button[aria-label="Start voice mode"]',
      'button[aria-label*="Voice"]'
    ]),
    voiceActive: freeze([
      '[data-testid="voice-mode-active"]',
      '[data-voice-state="active"]'
    ]),
    generating: freeze([
      'button[data-testid="stop-button"]',
      'button[aria-label="Stop generating"]',
      'button[aria-label*="Stop generating"]'
    ]),
    conversationRoot: freeze([
      'main [data-testid="conversation-turns"]',
      'main [role="presentation"]',
      'main'
    ]),
    chatMenu: freeze([
      'button[data-testid="conversation-options-button"]',
      'button[aria-label="Chat options"]',
      'button[aria-label*="conversation options"]'
    ]),
    renameAction: freeze([
      '[role="menuitem"][data-testid="rename-conversation"]',
      '[role="menuitem"][aria-label="Rename"]',
      'button[aria-label="Rename"]'
    ]),
    renameInput: freeze([
      'input[data-testid="rename-conversation-input"]',
      'input[aria-label="Rename conversation"]',
      'input[aria-label*="Rename"]'
    ]),
    rateLimitNotice: freeze([
      '[data-testid="conversation-rate-limit"]',
      '[role="alert"]'
    ])
  });
})();
