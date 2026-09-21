import path from 'node:path';
import { chromium } from 'playwright';

export async function launchEnpalBrowser({
  profileDir = '.enpal/browser-profile',
  headless = false,
  channel = ''
} = {}) {
  const userDataDir = path.resolve(profileDir);
  const options = {
    headless,
    viewport: null
  };

  if (channel) options.channel = channel;

  const context = await chromium.launchPersistentContext(userDataDir, options);
  const pages = context.pages();
  const page = pages[0] ?? await context.newPage();

  return {
    mode: 'launched',
    context,
    browser: null,
    page,
    userDataDir,
    async close() {
      await context.close();
    }
  };
}

export async function attachToChrome({
  endpoint = 'http://127.0.0.1:9222'
} = {}) {
  const browser = await chromium.connectOverCDP(endpoint);
  const contexts = browser.contexts();
  const context = contexts[0];

  if (!context) {
    await browser.close().catch(() => {});
    throw new Error('Connected to Chrome but no browser context was available');
  }

  const pages = context.pages();
  const page = pages.find(candidate => candidate.url().startsWith('https://chatgpt.com/'))
    ?? pages[0]
    ?? await context.newPage();

  return {
    mode: 'attached',
    browser,
    context,
    page,
    endpoint,
    async close() {
      await browser.close();
    }
  };
}
