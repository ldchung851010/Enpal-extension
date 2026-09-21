const COMPOSER_SELECTORS = Object.freeze([
  '#prompt-textarea',
  '[contenteditable="true"][role="textbox"]',
  '[contenteditable="true"][data-lexical-editor="true"]',
  'textarea[placeholder*="Message"]'
]);

const SEND_SELECTORS = Object.freeze([
  '#composer-submit-button',
  'button[data-testid="send-button"]',
  'button.composer-submit-btn',
  'button[type="submit"][aria-label*="Send" i]'
]);

const GENERATING_SELECTORS = Object.freeze([
  'button[data-testid="stop-button"]',
  'button[aria-label="Stop generating"]',
  'button[aria-label*="Stop generating"]'
]);

const USER_TURN_SELECTORS = Object.freeze([
  '[data-message-author-role="user"]',
  '[data-testid^="conversation-turn-"] [data-message-author-role="user"]'
]);

function defaultSleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function cleanText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
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
        // DOM changed while checking. Continue with the next semantic candidate.
      }
    }
  }
  return null;
}

async function waitForVisible(page, selectors, {
  timeoutMs = 20_000,
  pollMs = 100,
  sleep = defaultSleep
} = {}) {
  const deadline = Date.now() + Math.max(0, timeoutMs);
  do {
    const locator = await firstVisible(page, selectors);
    if (locator) return locator;
    if (Date.now() >= deadline) break;
    await sleep(pollMs);
  } while (true);
  return null;
}

async function userTurns(page) {
  const seen = [];
  for (const selector of USER_TURN_SELECTORS) {
    const texts = await page.locator(selector).allInnerTexts().catch(() => []);
    for (const text of texts) {
      const normalized = cleanText(text);
      if (normalized && !seen.includes(normalized)) seen.push(normalized);
    }
  }
  return seen;
}

async function composerText(composer) {
  return composer.evaluate(element => {
    if ('value' in element) return String(element.value ?? '');
    return String(element.innerText ?? element.textContent ?? '');
  }).catch(() => '');
}

async function fillComposer(page, composer, message) {
  await composer.fill(message);
  let actual = await composerText(composer);
  if (cleanText(actual) === cleanText(message)) return;

  // Fallback for editor variants where fill() does not update ProseMirror state.
  await composer.focus();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.press('Backspace');
  await page.keyboard.insertText(message);
  actual = await composerText(composer);

  if (cleanText(actual) !== cleanText(message)) {
    throw new Error('ChatGPT composer did not retain the intended message');
  }
}

async function enabledSendControl(page) {
  for (const selector of SEND_SELECTORS) {
    const matches = page.locator(selector);
    const count = await matches.count().catch(() => 0);

    for (let index = 0; index < count; index += 1) {
      const candidate = matches.nth(index);
      try {
        if (!(await candidate.isVisible())) continue;
        const disabled = await candidate.evaluate(element =>
          element.disabled === true ||
          element.getAttribute('disabled') !== null ||
          element.getAttribute('aria-disabled') === 'true'
        );
        if (!disabled) return candidate;
      } catch {
        // Candidate detached or changed. Keep looking.
      }
    }
  }
  return null;
}

async function waitForEnabledSend(page, timeoutMs, sleep) {
  const deadline = Date.now() + Math.max(0, timeoutMs);
  do {
    const send = await enabledSendControl(page);
    if (send) return send;
    if (Date.now() >= deadline) break;
    await sleep(100);
  } while (true);
  return null;
}

async function conversationCandidates(page) {
  const candidates = [page.url()];
  try {
    const canonical = await page.locator('link[rel="canonical"]').first().getAttribute('href');
    if (canonical) candidates.push(canonical);
  } catch {
    // Canonical is optional.
  }
  return [...new Set(candidates.filter(Boolean))];
}

async function activateSend(page, send) {
  await send.focus();
  const focused = await send.evaluate(
    element => document.activeElement === element
  ).catch(() => false);

  if (!focused) {
    throw new Error('ChatGPT Send control could not receive keyboard focus');
  }

  // Trusted keyboard activation avoids pointer-overlay failures. Once this
  // activation is sent we never retry blindly, because an ambiguous retry can
  // create a duplicate user turn.
  await page.keyboard.press('Enter');
}

async function waitForSubmissionEvidence({
  page,
  composer,
  baseline,
  message,
  projectUrl,
  timeoutMs,
  sleep
}) {
  const deadline = Date.now() + timeoutMs;
  const marker = cleanText(message).slice(0, 80);

  do {
    const turns = await userTurns(page);
    const userTurnConfirmed = turns.length > baseline &&
      turns.some(turn => cleanText(turn).includes(marker));

    const remainingComposerText = cleanText(await composerText(composer));
    const composerCleared = remainingComposerText === '';
    const candidates = await conversationCandidates(page);

    const boundConversation = candidates.find(url =>
      isConversationInsideProject(url, projectUrl)
    );

    const wrongConversation = candidates.find(url =>
      isAnyConversationUrl(url) && !isConversationInsideProject(url, projectUrl)
    );

    if (wrongConversation) {
      throw new Error(
        'ChatGPT created the conversation outside the configured Project'
      );
    }

    if (userTurnConfirmed || (composerCleared && boundConversation)) {
      return {
        ok: true,
        sent: true,
        userTurns: turns.length,
        conversationUrl: boundConversation || null,
        evidence: userTurnConfirmed
          ? 'USER_TURN'
          : 'PROJECT_CONVERSATION_AND_CLEARED_COMPOSER'
      };
    }

    if (Date.now() >= deadline) break;
    await sleep(100);
  } while (true);

  const turns = await userTurns(page);
  const remainingComposerText = cleanText(await composerText(composer));

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
  submitTimeoutMs = 15_000,
  sleep = defaultSleep
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

        if (Date.now() >= deadline) break;
        await sleep(200);
      } while (true);

      throw new Error('ChatGPT Project new-chat surface did not become ready');
    },

    async sendMessage(text, projectUrl) {
      const message = String(text ?? '').trim();
      if (!message) throw new TypeError('sendMessage requires non-empty text');
      if (!projectUrl) throw new TypeError('sendMessage requires projectUrl');

      const composer = await waitForVisible(page, COMPOSER_SELECTORS, {
        timeoutMs: submitTimeoutMs,
        sleep
      });

      if (!composer) throw new Error('ChatGPT composer is unavailable');

      const beforeTurns = await userTurns(page);
      await fillComposer(page, composer, message);

      const send = await waitForEnabledSend(page, submitTimeoutMs, sleep);
      if (!send) {
        throw new Error(
          'ChatGPT Send control did not become enabled after composer input'
        );
      }

      await activateSend(page, send);

      return waitForSubmissionEvidence({
        page,
        composer,
        baseline: beforeTurns.length,
        message,
        projectUrl,
        timeoutMs: submitTimeoutMs,
        sleep
      });
    },

    async waitForConversationUrl(projectUrl) {
      const deadline = Date.now() + conversationTimeoutMs;

      do {
        const candidates = await conversationCandidates(page);
        const bound = candidates.find(url =>
          isConversationInsideProject(url, projectUrl)
        );

        if (bound) return bound;

        const wrong = candidates.find(url =>
          isAnyConversationUrl(url) &&
          !isConversationInsideProject(url, projectUrl)
        );

        if (wrong) {
          throw new Error(
            'ChatGPT created the conversation outside the configured Project'
          );
        }

        if (Date.now() >= deadline) break;
        await sleep(100);
      } while (true);

      throw new Error(
        'ChatGPT did not create a Project conversation URL before timeout'
      );
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
        const generating = Boolean(
          await firstVisible(page, GENERATING_SELECTORS)
        );
        const elapsed = Date.now() - startedAt;

        if (generating) {
          sawGenerating = true;
          idleSince = null;
        } else if (sawGenerating || elapsed >= activityGraceMs) {
          if (idleSince === null) idleSince = Date.now();
          if (Date.now() - idleSince >= idleStabilityMs) {
            return {
              ok: true,
              idle: true,
              activityObserved: sawGenerating
            };
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
