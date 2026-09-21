import { attachToChrome } from './browser-session.js';

const endpoint = String(process.env.ENPAL_CDP_ENDPOINT || 'http://127.0.0.1:9222').trim();
const projectUrl = String(process.env.ENPAL_PROJECT_URL || '').trim();

if (!projectUrl) {
  throw new Error('ENPAL_PROJECT_URL is required');
}

const browser = await attachToChrome({ endpoint });

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function inspect(page) {
  return page.evaluate(() => {
    const describe = (element, maxHtml = 900) => ({
      tagName: element.tagName,
      id: element.id || null,
      role: element.getAttribute('role'),
      ariaLabel: element.getAttribute('aria-label'),
      dataTestId: element.getAttribute('data-testid'),
      contentEditable: element.getAttribute('contenteditable'),
      dataLexicalEditor: element.getAttribute('data-lexical-editor'),
      type: element.getAttribute('type'),
      disabledProperty: 'disabled' in element ? element.disabled === true : null,
      disabledAttribute: element.getAttribute('disabled'),
      ariaDisabled: element.getAttribute('aria-disabled'),
      visible: Boolean(element.offsetWidth || element.offsetHeight || element.getClientRects().length),
      text: String(
        'value' in element
          ? element.value
          : (element.innerText || element.textContent || '')
      ).trim().slice(0, 300),
      outerHTML: element.outerHTML.slice(0, maxHtml)
    });

    const composerSelectors = [
      '#prompt-textarea',
      '[contenteditable="true"][data-lexical-editor="true"]',
      'textarea[placeholder*="Message"]',
      '[contenteditable="true"][role="textbox"]'
    ];

    let composer = null;
    let matchedSelector = '';

    for (const selector of composerSelectors) {
      const candidates = Array.from(document.querySelectorAll(selector));
      composer = candidates.find(el =>
        Boolean(el.offsetWidth || el.offsetHeight || el.getClientRects().length)
      ) || candidates[0] || null;
      if (composer) {
        matchedSelector = selector;
        break;
      }
    }

    const editables = Array.from(document.querySelectorAll(
      'textarea, input, [contenteditable="true"], [role="textbox"]'
    )).slice(0, 30).map(el => describe(el, 700));

    const forms = Array.from(document.querySelectorAll('form'))
      .slice(0, 20)
      .map(el => describe(el, 1200));

    const buttons = Array.from(document.querySelectorAll('button'))
      .filter(button => Boolean(
        button.offsetWidth || button.offsetHeight || button.getClientRects().length
      ))
      .slice(0, 60)
      .map(el => describe(el, 700));

    return {
      url: location.href,
      readyState: document.readyState,
      title: document.title,
      composerFound: Boolean(composer),
      matchedSelector,
      composer: composer ? describe(composer, 1600) : null,
      editables,
      forms,
      buttons,
      activeElement: document.activeElement ? describe(document.activeElement, 500) : null
    };
  });
}

try {
  const { page } = browser;

  await page.goto(projectUrl, {
    waitUntil: 'domcontentloaded',
    timeout: 120_000
  });

  const deadline = Date.now() + 30_000;
  let report = null;

  do {
    report = await inspect(page);
    if (report.composerFound) break;
    await sleep(500);
  } while (Date.now() <= deadline);

  const frameInfo = page.frames().map(frame => ({
    name: frame.name(),
    url: frame.url()
  }));

  const result = {
    ok: Boolean(report?.composerFound),
    reason: report?.composerFound ? 'composer-found' : 'composer-not-found-after-30s',
    frames: frameInfo,
    page: report,
    keyboardProbe: null
  };

  if (report?.composerFound) {
    const composer = page.locator(report.matchedSelector).first();
    const probe = '__ENPAL_DIAGNOSTIC_PROBE__';

    try {
      await composer.focus();
      const before = await composer.evaluate(element =>
        String(
          'value' in element
            ? element.value
            : (element.innerText || element.textContent || '')
        )
      );

      await page.keyboard.type(probe, { delay: 1 });
      await page.waitForTimeout(200);

      const afterType = await composer.evaluate(element =>
        String(
          'value' in element
            ? element.value
            : (element.innerText || element.textContent || '')
        )
      );

      await page.keyboard.press('Control+A').catch(() => {});
      await page.keyboard.press('Backspace').catch(() => {});
      await page.waitForTimeout(100);

      const afterClear = await composer.evaluate(element =>
        String(
          'value' in element
            ? element.value
            : (element.innerText || element.textContent || '')
        )
      );

      result.keyboardProbe = {
        before: before.slice(0, 300),
        afterType: afterType.slice(0, 300),
        afterClear: afterClear.slice(0, 300),
        typedSuccessfully: afterType.includes(probe),
        clearedSuccessfully: afterClear.trim() === ''
      };

      result.pageAfterProbe = await inspect(page);
    } catch (error) {
      result.keyboardProbe = {
        error: error?.message || String(error)
      };
    }
  }

  console.log(JSON.stringify(result, null, 2));
} finally {
  await browser.close();
}
