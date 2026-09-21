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
    context,
    page,
    userDataDir
  };
}
