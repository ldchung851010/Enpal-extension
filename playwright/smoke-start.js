import {
  attachToChrome,
  launchEnpalBrowser
} from './browser-session.js';
import { createChatGptPage } from './chatgpt-page.js';

function required(name, value) {
  const normalized = String(value ?? '').trim();
  if (!normalized) {
    throw new Error(
      `Missing ${name}. Example: ${name}=... npm run pw:smoke:start -- "EnPal Playwright smoke. Reply only OK."`
    );
  }
  return normalized;
}

const projectUrl = required('ENPAL_PROJECT_URL', process.env.ENPAL_PROJECT_URL);
const message = required(
  'smoke message',
  process.argv.slice(2).join(' ') || process.env.ENPAL_SMOKE_MESSAGE
);

const attachEndpoint = String(process.env.ENPAL_CDP_ENDPOINT ?? '').trim();
const profileDir = process.env.ENPAL_BROWSER_PROFILE || '.enpal/browser-profile';
const channel = process.env.ENPAL_BROWSER_CHANNEL || '';

let browser;

try {
  browser = attachEndpoint
    ? await attachToChrome({ endpoint: attachEndpoint })
    : await launchEnpalBrowser({
        profileDir,
        headless: false,
        channel
      });

  const { page } = browser;
  const chatgpt = createChatGptPage(page);

  if (browser.mode === 'attached') {
    console.log('[1/5] Attached to existing Chrome:', browser.endpoint);
  } else {
    console.log('[1/5] Browser profile:', browser.userDataDir);
  }

  console.log('[2/5] Opening ChatGPT Project:', projectUrl);

  await page.goto(projectUrl, {
    waitUntil: 'domcontentloaded',
    timeout: 120_000
  });

  console.log('[3/5] Waiting for authenticated Project new-chat surface...');
  await chatgpt.waitForProjectReady(projectUrl);

  console.log('[4/5] Sending smoke message through visible ChatGPT controls...');
  await chatgpt.sendMessage(message, projectUrl);

  const conversationUrl = await chatgpt.waitForConversationUrl(projectUrl);
  console.log('[5/5] PASS: authoritative conversation created inside Project');
  console.log('Conversation URL:', conversationUrl);

  if (process.env.ENPAL_KEEP_OPEN === '1') {
    console.log('ENPAL_KEEP_OPEN=1: Chrome remains available. Press Ctrl+C to stop this script.');
    await new Promise(() => {});
  }

  await browser.close();
} catch (error) {
  console.error('FAIL:', error?.stack || error?.message || String(error));
  if (browser?.close) {
    await browser.close().catch(() => {});
  }
  process.exitCode = 1;
}
