import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

import { createWorkflow } from '../../core/workflow.js';
import { createPlaywrightChatGptAdapter } from '../../playwright/chatgpt-adapter.js';
import { createFakeWorkflowRepositories } from '../helpers/fake-repositories.js';

const projectRoot = 'https://chatgpt.com/g/g-p-enpal';
const projectUrl = projectRoot + '/project';

function fixtureHtml() {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <link rel="canonical" href="${projectUrl}">
</head>
<body>
  <main>
    <form>
      <div
        id="prompt-textarea"
        role="textbox"
        contenteditable="true"
        data-lexical-editor="true"
        aria-label="New chat in this project"
      ></div>
      <button
        id="composer-submit-button"
        type="button"
        aria-disabled="true"
      >Send</button>
      <button
        data-testid="voice-mode-button"
        type="button"
        aria-label="Start voice mode"
        aria-pressed="false"
      >Voice</button>
    </form>
    <section id="turns"></section>
  </main>

  <div
    id="pointer-overlay"
    style="
      position:fixed;
      left:0;
      right:0;
      bottom:0;
      height:32px;
      z-index:9999;
      pointer-events:auto
    "
  ></div>

<script>
(() => {
  const box = document.querySelector('#prompt-textarea');
  const send = document.querySelector('#composer-submit-button');
  const voice = document.querySelector('[data-testid="voice-mode-button"]');
  const canonical = document.querySelector('link[rel="canonical"]');

  box.addEventListener('input', () => {
    send.setAttribute(
      'aria-disabled',
      box.innerText.trim() ? 'false' : 'true'
    );
  });

  send.addEventListener('click', () => {
    if (send.getAttribute('aria-disabled') === 'true') return;

    const text = box.innerText.trim();
    const turn = document.createElement('div');
    turn.setAttribute('data-message-author-role', 'user');
    turn.textContent = text;
    document.querySelector('#turns').appendChild(turn);

    box.innerHTML = '';
    box.dispatchEvent(new InputEvent('input', {
      bubbles: true,
      inputType: 'deleteContent'
    }));

    const conversationUrl = '${projectRoot}/c/workflow-start';
    canonical.href = conversationUrl;
    history.pushState({}, '', '/g/g-p-enpal/c/workflow-start');
  });

  voice.addEventListener('click', () => {
    const active = voice.getAttribute('aria-pressed') === 'true';
    voice.setAttribute('aria-pressed', active ? 'false' : 'true');
  });
})();
</script>
</body>
</html>`;
}

test('core START runs through the Playwright adapter and binds the real Project conversation identity', async t => {
  const browser = await chromium.launch({ headless: true });
  t.after(async () => browser.close());

  const context = await browser.newContext();
  const firstPage = await context.newPage();

  await context.route('https://chatgpt.com/**', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: fixtureHtml()
    });
  });

  const brief = {
    ready: true,
    curriculum_version: 'v1',
    curriculum_sequence: 1,
    lesson_id: 'L001',
    'Primary Skill': 'Speaking',
    'Communicative Goal': 'Give a short workplace update.'
  };

  const repos = createFakeWorkflowRepositories({
    activeBrief: brief,
    curriculumLesson: {
      curriculum_version: 'v1',
      curriculum_sequence: 1,
      lesson_id: 'L001'
    }
  });

  const chatgpt = createPlaywrightChatGptAdapter({
    context,
    initialPage: firstPage,
    chatgptPageOptions: {
      projectReadyTimeoutMs: 2_000,
      conversationTimeoutMs: 2_000,
      submitTimeoutMs: 2_000
    },
    idleOptions: {
      timeoutMs: 1_000,
      activityGraceMs: 0,
      idleStabilityMs: 0
    },
    voiceOptions: {
      timeoutMs: 1_000,
      pollMs: 10
    }
  });

  const workflow = createWorkflow({
    config: {
      projectUrl,
      teacherRoleUrl: 'https://drive.google.com/teacher-role',
      speakingMethodUrl: 'https://drive.google.com/speaking-method',
      listeningMethodUrl: 'https://drive.google.com/listening-method'
    },
    journal: repos.journal,
    sessions: repos.sessions,
    curriculum: repos.curriculum,
    briefs: repos.briefs,
    chatgpt,
    mask: {
      async arm() {
        throw new Error('Speaking START must not arm Listening Mask');
      }
    },
    supervisor: {
      async start() {
        return { status: 'ON' };
      }
    },
    createSessionId: () => 'S-PW-START'
  });

  const result = await workflow.start();

  assert.equal(result.action, 'STARTED');
  assert.equal(result.session.status, 'IN_PROGRESS');
  assert.equal(
    result.session.chat_url,
    projectRoot + '/c/workflow-start'
  );

  assert.equal(repos.sessionsState.length, 1);
  assert.equal(repos.sessionsState[0].session_id, 'S-PW-START');
  assert.equal(
    repos.sessionsState[0].chat_url,
    projectRoot + '/c/workflow-start'
  );

  const page = context.pages().find(candidate =>
    candidate.url().includes('/c/workflow-start')
  );
  assert.ok(page, 'workflow conversation page should remain open');

  const turn = await page.locator('[data-message-author-role="user"]').innerText();
  assert.match(turn, /^ENPAL_CONTROL\n/);
  assert.match(turn, /type=START/);
  assert.match(turn, /"lesson_id":"L001"/);

  assert.equal(
    await page.locator('[data-testid="voice-mode-button"]').getAttribute('aria-pressed'),
    'true'
  );

  assert.equal(repos.journalState.learningReady, true);
  assert.equal(repos.journalState.phase, 'LEARNING_ACTIVE');
});
