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
  let browser;

  try {
    browser = await chromium.connectOverCDP(endpoint);
  } catch (error) {
    const message = String(error?.message || error);

    throw new Error(
      `Could not connect to Chrome at ${endpoint}. ` +
      'Start the dedicated EnPal Chrome with remote debugging enabled. ' +
      `Original error: ${message}`
    );
  }

  const contexts = browser.contexts();
  const context = contexts[0];

  if (!context) {
    await browser.close().catch(() => {});
    throw new Error(
      'Connected to Chrome but no browser context was available'
    );
  }

  // Work in a fresh tab inside the already-authenticated default context.
  // This inherits the user's ChatGPT login without mutating an unrelated tab.
  const page = await context.newPage();

  return {
    mode: 'attached',
    browser,
    context,
    page,
    endpoint,

    async close() {
      await page.close().catch(() => {});

      // For a browser obtained via connectOverCDP(), browser.close()
      // disconnects Playwright from the externally owned Chrome process.
      await browser.close();
    }
  };
}
