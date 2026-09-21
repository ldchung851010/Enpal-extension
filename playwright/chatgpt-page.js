const COMPOSER_SELECTORS = Object.freeze([
  '#prompt-textarea',
  '[contenteditable="true"][data-lexical-editor="true"]',
  'textarea[placeholder*="Message"]'
]);

const SEND_SELECTORS = Object.freeze([
  'button[data-testid="send-button"]',
  'button[aria-label="Send prompt"]',
  'button[aria-label="Send message"]',
  'button[aria-label="Send"]',
  'button[aria-label^="Send"]'
]);

const GENERATING_SELECTORS = Object.freeze([
  'button[data-testid="stop-button"]',
  'button[aria-label="Stop generating"]',
  'button[aria-label*="Stop generating"]'
]);

const USER_TURN_SELECTORS = Object.freeze([
  '[data-message-author-role="user"]',
  '[data-testid^="conversation-turn-"] [data-message-author-role="user"]',
  'article[data-testid^="conversation-turn-"][data-message-author-role="user"]'
]);

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function normalizeUrl(value) {
  const url = new URL(value);
  url.hash = '';
  if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, '');
  return `${url.origin}${url.pathname}${url.search}`;
}

function normalizedPath(url) {
  const path = url.pathname.replace(/\/+$/, '');
  return path || '/';
}

export function projectIdentityPath(value) {
  const url = value instanceof URL ? value : new URL(value);
  const path = normalizedPath(url);
  return path.endsWith('/project')
    ? path.slice(0, -'/project'.length)
    : path;
}

export function isConversationInsideProject(candidateUrl, projectUrl) {
  try {
    const candidate = new URL(candidateUrl);
    const project = new URL(projectUrl);
    const projectPath = projectIdentityPath(project);
    return candidate.origin === project.origin &&
      normalizedPath(candidate).startsWith(projectPath + '/c/');
  } catch {
    return false;
  }
}

export function isAnyConversationUrl(candidateUrl) {
  try {
    const candidate = new URL(candidateUrl);
    return /\/c\/[^/]+/.test(normalizedPath(candidate));
  } catch {
    return false;
  }
}

export function isProjectNewChatSurface(currentUrl, projectUrl) {
  try {
    const current = new URL(currentUrl);
    const project = new URL(projectUrl);
    const currentPath = normalizedPath(current);
    const projectPath = projectIdentityPath(project);

    if (current.origin !== project.origin) return false;
    if (isAnyConversationUrl(currentUrl)) return false;

    return currentPath === projectPath ||
      currentPath === projectPath + '/project' ||
      currentPath.startsWith(projectPath + '/project/');
  } catch {
    return false;
  }
}

async function firstVisible(page, selectors) {
  for (const selector of selectors) {
    const matches = page.locator(selector);
    const count = await matches.count().catch(() => 0);

    for (let index = 0; index < count; index += 1) {
      const locator = matches.nth(index);
      try {
        if (await locator.isVisible()) return locator;
      } catch {
        // DOM changed while checking; try the next semantic candidate.
      }
    }
  }
  return null;
}

async function waitForVisible(page, selectors, {
  timeoutMs = 20_000,
  pollMs = 100
} = {}) {
  const deadline = Date.now() + Math.max(0, timeoutMs);
  do {
    const locator = await firstVisible(page, selectors);
    if (locator) return locator;
    await sleep(pollMs);
  } while (Date.now() <= deadline);
  return null;
}

async function userTurns(page) {
  const seen = [];
  for (const selector of USER_TURN_SELECTORS) {
    const texts = await page.locator(selector).allInnerTexts().catch(() => []);
    for (const text of texts) {
      const normalized = String(text ?? '').trim();
      if (normalized && !seen.includes(normalized)) seen.push(normalized);
    }
  }
  return seen;
}

async function composerText(composer) {
  return composer.evaluate(element => {
    if ('value' in element) return String(element.value ?? '').trim();
    return String(element.innerText ?? element.textContent ?? '').trim();
  }).catch(() => '');
}

async function typeWithKeyboard(page, composer, message) {
  // Do not use pointer click here. ChatGPT can place sticky/fade layers
  // above the composer that intercept mouse events even though the editor
  // itself is visible. DOM focus + keyboard input avoids that fragile layer.
  await composer.focus();
  await page.keyboard.press('Control+A').catch(() => {});
  await page.keyboard.press('Backspace').catch(() => {});

  const lines = String(message).split('\n');
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index]) {
      await page.keyboard.type(lines[index], { delay: 1 });
    }
    if (index < lines.length - 1) {
      await page.keyboard.press('Shift+Enter');
    }
  }
}

async function enabledSendControl(page) {
  const send = await firstVisible(page, SEND_SELECTORS);
  if (!send) return null;

  const disabled = await send.evaluate(element =>
    element.disabled === true ||
    element.getAttribute('disabled') !== null ||
    element.getAttribute('aria-disabled') === 'true'
  ).catch(() => true);

  return disabled ? null : send;
}

async function waitForSubmissionEvidence(
  page,
  composer,
  baseline,
  message,
  timeoutMs
) {
  const deadline = Date.now() + timeoutMs;
  const marker = message.slice(0, 80);

  do {
    const turns = await userTurns(page);
    const userTurnConfirmed =
      turns.length > baseline &&
      turns.some(turn => String(turn).includes(marker));

    const currentUrl = page.url();
    const conversationUrlConfirmed = isAnyConversationUrl(currentUrl);
    const remainingComposerText = await composerText(composer);
    const composerCleared = remainingComposerText === '';

    if (userTurnConfirmed || (conversationUrlConfirmed && composerCleared)) {
      return {
        ok: true,
        sent: true,
        userTurns: turns.length,
        evidence: userTurnConfirmed ? 'USER_TURN' : 'CONVERSATION_URL_AND_CLEARED_COMPOSER'
      };
    }

    await sleep(100);
  } while (Date.now() <= deadline);

  const turns = await userTurns(page);
  const remainingComposerText = await composerText(composer);
  throw new Error(
    'ChatGPT did not confirm that the message was submitted. ' +
    'url=' + page.url() +
    '; userTurns=' + turns.length +
    '; composerCleared=' + String(remainingComposerText === '')
  );
}

export function createChatGptPage(page, {
  projectReadyTimeoutMs = 120_000,
  conversationTimeoutMs = 20_000,
  submitTimeoutMs = 12_000
} = {}) {
  if (!page) throw new TypeError('Playwright Page is required');

  return {
    async waitForProjectReady(projectUrl) {
      const deadline = Date.now() + projectReadyTimeoutMs;
      do {
        const currentUrl = page.url();

        if (isConversationInsideProject(currentUrl, projectUrl)) {
          throw new Error(
            'Configured ChatGPT Project opened an existing conversation instead of the Project new-chat surface'
          );
        }

        if (isProjectNewChatSurface(currentUrl, projectUrl)) {
          const composer = await firstVisible(page, COMPOSER_SELECTORS);
          if (composer) {
            return { ok: true, projectReady: true, url: currentUrl };
          }
        }

        await sleep(200);
      } while (Date.now() <= deadline);

      throw new Error(
        'ChatGPT Project did not become ready. If this is the first run, finish signing in in the opened browser and rerun.'
      );
    },

    async sendMessage(text) {
      const message = String(text ?? '').trim();
      if (!message) throw new TypeError('sendMessage requires non-empty text');

      const composer = await waitForVisible(page, COMPOSER_SELECTORS, {
        timeoutMs: submitTimeoutMs
      });
      if (!composer) throw new Error('ChatGPT composer is unavailable');

      const beforeTurns = await userTurns(page);
      await typeWithKeyboard(page, composer, message);

      // Keyboard typing should make ChatGPT's semantic Send control enabled.
      // Prefer the visible Send control, because some editor states treat
      // Enter as a newline. If no enabled Send control is exposed, fall back
      // to Enter on the focused composer.
      const sendDeadline = Date.now() + Math.min(3_000, submitTimeoutMs);
      let send = null;

      do {
        send = await enabledSendControl(page);
        if (send) break;
        await sleep(100);
      } while (Date.now() <= sendDeadline);

      if (send) {
        try {
          await send.click({ timeout: 2_000 });
        } catch {
          await send.click({ force: true });
        }
      } else {
        await page.keyboard.press('Enter');
      }

      return waitForSubmissionEvidence(
        page,
        composer,
        beforeTurns.length,
        message,
        submitTimeoutMs
      );
    },

    async waitForConversationUrl(projectUrl) {
      const deadline = Date.now() + conversationTimeoutMs;
      do {
        const currentUrl = page.url();
        if (isConversationInsideProject(currentUrl, projectUrl)) return currentUrl;
        if (isAnyConversationUrl(currentUrl)) {
          throw new Error(
            'ChatGPT created the conversation outside the configured Project'
          );
        }
        await sleep(100);
      } while (Date.now() <= deadline);

      throw new Error('ChatGPT did not create a conversation URL before timeout');
    },

    async waitUntilIdle({
      timeoutMs = 60_000,
      activityGraceMs = 1_200,
      idleStabilityMs = 500
    } = {}) {
      const startedAt = Date.now();
      let sawGenerating = false;
      let idleSince = null;

      while (Date.now() - startedAt <= timeoutMs) {
        const generating = Boolean(await firstVisible(page, GENERATING_SELECTORS));
        const elapsed = Date.now() - startedAt;

        if (generating) {
          sawGenerating = true;
          idleSince = null;
        } else if (sawGenerating || elapsed >= activityGraceMs) {
          if (idleSince === null) idleSince = Date.now();
          if (Date.now() - idleSince >= idleStabilityMs) {
            return { ok: true, idle: true, activityObserved: sawGenerating };
          }
        }

        await sleep(150);
      }

      throw new Error('ChatGPT did not become stably idle before timeout');
    },

    getConversationUrl() {
      return page.url();
    }
  };
}
