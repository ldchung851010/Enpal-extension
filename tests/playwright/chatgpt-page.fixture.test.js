import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

import {
  createChatGptPage,
  isConversationInsideProject
} from '../../playwright/chatgpt-page.js';

const projectRoot = 'https://chatgpt.com/g/g-p-enpal';
const projectUrl = projectRoot + '/project';

function fixtureHtml({ sendSelector = 'id' } = {}) {
  const sendAttrs = sendSelector === 'id'
    ? 'id="composer-submit-button" aria-label="Send prompt"'
    : 'data-testid="send-button" aria-label="Send prompt"';

  return '<!doctype html>' +
    '<html><head><meta charset="utf-8"></head><body>' +
    '<div id="overlay" style="position:fixed;left:0;right:0;bottom:0;height:24px;z-index:9999;pointer-events:auto"></div>' +
    '<main><form id="composer-form">' +
    '<div id="prompt-textarea" role="textbox" contenteditable="true" data-lexical-editor="true" aria-label="New chat in this project"></div>' +
    '<button ' + sendAttrs + ' type="button" disabled>Send</button>' +
    '</form><section id="turns"></section></main>' +
    '<script>' +
    '(() => {' +
    'const editor=document.querySelector("#prompt-textarea");' +
    'const send=document.querySelector("#composer-submit-button, [data-testid=send-button]");' +
    'const turns=document.querySelector("#turns");' +
    'const currentText=()=>String(editor.innerText||editor.textContent||"").trim();' +
    'editor.addEventListener("input",()=>{send.disabled=currentText()==="";});' +
    'send.addEventListener("click",()=>{' +
    'const text=currentText(); if(!text)return;' +
    'const article=document.createElement("article"); article.setAttribute("data-testid","conversation-turn-0");' +
    'const message=document.createElement("div"); message.setAttribute("data-message-author-role","user"); message.textContent=text;' +
    'article.appendChild(message); turns.appendChild(article);' +
    'editor.textContent=""; editor.dispatchEvent(new InputEvent("input",{bubbles:true,inputType:"deleteContent"}));' +
    'history.pushState({},"","/g/g-p-enpal/c/fixture-conversation");' +
    '});' +
    '})();' +
    '<\/script></body></html>';
}

async function withFixture(t, options, fn) {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
    args: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? ['--no-sandbox'] : []
  });
  t.after(async () => browser.close());

  const context = await browser.newContext();
  const page = await context.newPage();

  await context.route('https://chatgpt.com/**', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: fixtureHtml(options)
    });
  });

  await page.goto(projectUrl, { waitUntil: 'domcontentloaded' });
  await fn(page);
}

test('submits through current #composer-submit-button despite overlay near composer', async t => {
  await withFixture(t, { sendSelector: 'id' }, async page => {
    const chatgpt = createChatGptPage(page, {
      projectReadyTimeoutMs: 2_000,
      conversationTimeoutMs: 2_000,
      submitTimeoutMs: 2_000
    });

    const ready = await chatgpt.waitForProjectReady(projectUrl);
    assert.equal(ready.projectReady, true);

    const result = await chatgpt.sendMessage('fixture message');
    assert.equal(result.sent, true);

    const conversationUrl = await chatgpt.waitForConversationUrl(projectUrl);
    assert.equal(conversationUrl, projectRoot + '/c/fixture-conversation');
    assert.equal(isConversationInsideProject(conversationUrl, projectUrl), true);

    const rendered = await page.locator('[data-message-author-role="user"]').innerText();
    assert.equal(rendered, 'fixture message');
    assert.equal(await page.locator('#prompt-textarea').innerText(), '');
  });
});

test('also supports the older data-testid send-button contract', async t => {
  await withFixture(t, { sendSelector: 'testid' }, async page => {
    const chatgpt = createChatGptPage(page, {
      projectReadyTimeoutMs: 2_000,
      conversationTimeoutMs: 2_000,
      submitTimeoutMs: 2_000
    });

    await chatgpt.waitForProjectReady(projectUrl);
    await chatgpt.sendMessage('second fixture message');

    const conversationUrl = await chatgpt.waitForConversationUrl(projectUrl);
    assert.equal(conversationUrl, projectRoot + '/c/fixture-conversation');
  });
});

test('wrong-project conversation is rejected', async t => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
    args: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? ['--no-sandbox'] : []
  });
  t.after(async () => browser.close());

  const context = await browser.newContext();
  const page = await context.newPage();

  await context.route('https://chatgpt.com/**', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: fixtureHtml()
    });
  });

  await page.goto('https://chatgpt.com/g/g-p-other/project');
  await page.evaluate(() => {
    history.pushState({}, '', '/g/g-p-other/c/not-enpal');
  });

  const chatgpt = createChatGptPage(page, {
    conversationTimeoutMs: 300
  });

  await assert.rejects(
    () => chatgpt.waitForConversationUrl(projectUrl),
    /outside the configured Project/
  );
});
