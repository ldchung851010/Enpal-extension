import { attachToChrome } from './browser-session.js';

const endpoint = String(process.env.ENPAL_CDP_ENDPOINT || 'http://127.0.0.1:9222').trim();
const projectUrl = String(process.env.ENPAL_PROJECT_URL || '').trim();

if (!projectUrl) {
  throw new Error('ENPAL_PROJECT_URL is required');
}

const browser = await attachToChrome({ endpoint });

try {
  const { page } = browser;

  await page.goto(projectUrl, {
    waitUntil: 'domcontentloaded',
    timeout: 120_000
  });

  await page.waitForTimeout(1500);

  const report = await page.evaluate(() => {
    const composerSelectors = [
      '#prompt-textarea',
      '[contenteditable="true"][data-lexical-editor="true"]',
      'textarea[placeholder*="Message"]'
    ];

    let composer = null;
    let matchedSelector = '';

    for (const selector of composerSelectors) {
      const candidate = document.querySelector(selector);
      if (candidate) {
        composer = candidate;
        matchedSelector = selector;
        break;
      }
    }

    if (!composer) {
      return {
        ok: false,
        reason: 'composer-not-found',
        url: location.href
      };
    }

    const form = composer.closest('form');
    const buttons = Array.from((form || document).querySelectorAll('button')).map((button, index) => ({
      index,
      text: String(button.innerText || button.textContent || '').trim().slice(0, 120),
      ariaLabel: button.getAttribute('aria-label'),
      dataTestId: button.getAttribute('data-testid'),
      disabledProperty: button.disabled === true,
      disabledAttribute: button.getAttribute('disabled'),
      ariaDisabled: button.getAttribute('aria-disabled'),
      type: button.getAttribute('type'),
      visible: Boolean(button.offsetWidth || button.offsetHeight || button.getClientRects().length),
      outerHTML: button.outerHTML.slice(0, 600)
    }));

    return {
      ok: true,
      url: location.href,
      composer: {
        matchedSelector,
        tagName: composer.tagName,
        role: composer.getAttribute('role'),
        ariaLabel: composer.getAttribute('aria-label'),
        contentEditable: composer.getAttribute('contenteditable'),
        dataLexicalEditor: composer.getAttribute('data-lexical-editor'),
        className: String(composer.className || '').slice(0, 300),
        text: String(
          'value' in composer
            ? composer.value
            : (composer.innerText || composer.textContent || '')
        ).slice(0, 300),
        outerHTML: composer.outerHTML.slice(0, 1200)
      },
      form: form ? {
        action: form.getAttribute('action'),
        method: form.getAttribute('method'),
        outerHTMLStart: form.outerHTML.slice(0, 1800)
      } : null,
      buttons,
      activeElement: document.activeElement ? {
        tagName: document.activeElement.tagName,
        id: document.activeElement.id,
        ariaLabel: document.activeElement.getAttribute('aria-label'),
        dataTestId: document.activeElement.getAttribute('data-testid')
      } : null
    };
  });

  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
