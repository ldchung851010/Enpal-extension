import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

import { createChatGptPage } from '../../playwright/chatgpt-page.js';

const projectRoot = 'https://chatgpt.com/g/g-p-enpal';
const projectRoute = projectRoot + '/project';

async function setupFixture({
  userTurn = true,
  sendContract = 'id'
} = {}) {
  const executablePath = process.env.ENPAL_TEST_CHROMIUM || undefined;
  const browser = await chromium.launch({
    headless: true,
    executablePath,
    args: executablePath ? ['--no-sandbox'] : []
  });
  const page = await browser.newPage();

  const html = `<!doctype html>
<html>
<head>
  <link rel="canonical" href="${projectRoute}">
</head>
<body>
  <form id="composer-form">
    <div
      id="prompt-textarea"
      role="textbox"
      aria-label="New chat in this project"
      contenteditable="true"
      class="ProseMirror"
    ></div>

    <button
      ${sendContract === 'id'
        ? 'id="composer-submit-button"'
        : 'data-testid="send-button"'}
      type="button"
      aria-disabled="true"
      aria-label="Localized action"
    >Submit</button>
  </form>

  <div id="turns"></div>

  <div
    id="overlay"
    style="
      position:fixed;
      left:0;
      top:0;
      width:100%;
      height:130px;
      z-index:9999;
      pointer-events:auto
    "
  ></div>

  <script>
    const box = document.querySelector('#prompt-textarea');
    const send = document.querySelector(
      '#composer-submit-button, [data-testid="send-button"]'
    );

    box.addEventListener('input', () => {
      send.setAttribute(
        'aria-disabled',
        box.innerText.trim() ? 'false' : 'true'
      );
    });

    send.addEventListener('click', () => {
      if (send.getAttribute('aria-disabled') === 'true') return;

      const text = box.innerText.trim();

      ${userTurn ? `
        const turn = document.createElement('div');
        turn.setAttribute('data-message-author-role', 'user');
        turn.textContent = text;
        document.querySelector('#turns').appendChild(turn);
      ` : ''}

      box.innerHTML = '';
      box.dispatchEvent(
        new InputEvent('input', {
          bubbles: true,
          inputType: 'deleteContent'
        })
      );

      document.querySelector('link[rel="canonical"]').href =
        '${projectRoot}/c/abc123';
    });
  </script>
</body>
</html>`;

  await page.setContent(html);

  return { browser, page };
}

test('real Chromium: pointer overlay does not block keyboard Send activation', async () => {
  const { browser, page } = await setupFixture();

  try {
    await assert.rejects(
      page.locator('#prompt-textarea').click({ timeout: 500 }),
      /intercepts pointer events|Timeout/
    );

    const chat = createChatGptPage(page, {
      submitTimeoutMs: 2_000,
      conversationTimeoutMs: 2_000
    });

    const sent = await chat.sendMessage(
      'hello fixture',
      projectRoute
    );

    assert.equal(sent.sent, true);
    assert.equal(sent.evidence, 'USER_TURN');

    assert.equal(
      await chat.waitForConversationUrl(projectRoute),
      projectRoot + '/c/abc123'
    );

    assert.equal(
      await page.locator('#prompt-textarea').innerText(),
      ''
    );
  } finally {
    await browser.close();
  }
});

test('real Chromium: canonical URL plus cleared composer survives user-turn DOM change', async () => {
  const { browser, page } = await setupFixture({
    userTurn: false,
    sendContract: 'testid'
  });

  try {
    const chat = createChatGptPage(page, {
      submitTimeoutMs: 2_000,
      conversationTimeoutMs: 2_000
    });

    const sent = await chat.sendMessage(
      'canonical fixture',
      projectRoute
    );

    assert.equal(
      sent.evidence,
      'PROJECT_CONVERSATION_AND_CLEARED_COMPOSER'
    );

    assert.equal(
      await chat.waitForConversationUrl(projectRoute),
      projectRoot + '/c/abc123'
    );
  } finally {
    await browser.close();
  }
});
