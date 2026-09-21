import { attachToChrome } from './browser-session.js';
import { createChatGptPage } from './chatgpt-page.js';

function required(name, value) {
  const normalized = String(value ?? '').trim();
  if (!normalized) {
    throw new Error('Missing required environment value: ' + name);
  }
  return normalized;
}

const endpoint = required(
  'ENPAL_CDP_ENDPOINT',
  process.env.ENPAL_CDP_ENDPOINT
);
const projectUrl = required(
  'ENPAL_PROJECT_URL',
  process.env.ENPAL_PROJECT_URL
);
const message = required(
  'smoke message',
  process.argv.slice(2).join(' ') || process.env.ENPAL_SMOKE_MESSAGE
);

let session;

try {
  session = await attachToChrome({ endpoint });

  const { page } = session;
  const chatgpt = createChatGptPage(page);

  console.log('[1/5] Attached to existing Chrome:', endpoint);
  console.log('[2/5] Opening ChatGPT Project:', projectUrl);

  await page.goto(projectUrl, {
    waitUntil: 'domcontentloaded',
    timeout: 120_000
  });

  console.log('[3/5] Waiting for authenticated Project new-chat surface...');
  await chatgpt.waitForProjectReady(projectUrl);

  console.log('[4/5] Sending smoke message through ChatGPT Send control...');
  await chatgpt.sendMessage(message, projectUrl);

  const conversationUrl = await chatgpt.waitForConversationUrl(projectUrl);

  console.log('[5/5] PASS: authoritative conversation created inside Project');
  console.log('Conversation URL:', conversationUrl);

  if (process.env.ENPAL_KEEP_OPEN === '1') {
    console.log(
      'ENPAL_KEEP_OPEN=1: automation tab remains open. Press Ctrl+C to stop.'
    );
    await new Promise(() => {});
  }
} catch (error) {
  console.error(
    'FAIL:',
    error?.stack || error?.message || String(error)
  );
  process.exitCode = 1;
} finally {
  if (process.env.ENPAL_KEEP_OPEN !== '1') {
    await session?.close().catch(() => {});
  }
}
