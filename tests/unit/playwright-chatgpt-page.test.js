import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createChatGptPage,
  normalizeUrl,
  projectIdentityPath,
  isAnyConversationUrl,
  isConversationInsideProject,
  isProjectNewChatSurface
} from '../../playwright/chatgpt-page.js';

const projectRoot = 'https://chatgpt.com/g/g-p-enpal';
const projectRoute = projectRoot + '/project';

class FakeElement {
  constructor(kind, page, props = {}) {
    this.kind = kind;
    this.page = page;
    Object.assign(this, props);
  }
}

class FakeLocator {
  constructor(page, elements = []) {
    this.page = page;
    this.elements = elements;
  }

  async count() {
    return this.elements.length;
  }

  nth(index) {
    return new FakeLocator(
      this.page,
      this.elements[index] ? [this.elements[index]] : []
    );
  }

  first() {
    return this.nth(0);
  }

  async isVisible() {
    return Boolean(this.elements[0]?.visible ?? false);
  }

  async allInnerTexts() {
    return this.elements.map(element => element.text ?? '');
  }

  async getAttribute(name) {
    const element = this.elements[0];
    if (!element) return null;
    if (name === 'href') return element.href ?? null;
    return element.attrs?.[name] ?? null;
  }

  async fill(text) {
    const element = this.elements[0];
    if (!element) throw new Error('missing element');
    if (element.kind !== 'composer') throw new Error('not editable');

    element.text = element.fillBroken ? '' : text;

    if (!element.fillBroken) {
      this.page.send.attrs['aria-disabled'] = 'false';
    }

    this.page.active = element;
  }

  async focus() {
    const element = this.elements[0];
    if (!element) throw new Error('missing element');
    this.page.active = element;
  }

  async evaluate(fn) {
    const element = this.elements[0];
    if (!element) throw new Error('missing element');

    const dom = {
      innerText: element.text ?? '',
      textContent: element.text ?? '',
      disabled: Boolean(element.disabled),
      getAttribute: name => element.attrs?.[name] ?? null
    };

    if (element.kind === 'textarea') dom.value = element.text;

    const previousDocument = globalThis.document;
    globalThis.document = {
      activeElement: this.page.active === element ? dom : null
    };

    try {
      return fn(dom);
    } finally {
      globalThis.document = previousDocument;
    }
  }
}

class FakePage {
  constructor({
    url = projectRoute,
    fillBroken = false,
    omitUserTurn = false,
    wrongProject = false,
    canonicalOnly = false
  } = {}) {
    this.currentUrl = url;
    this.active = null;
    this.omitUserTurn = omitUserTurn;
    this.wrongProject = wrongProject;
    this.canonicalOnly = canonicalOnly;

    this.composer = new FakeElement('composer', this, {
      visible: true,
      text: '',
      fillBroken
    });

    this.send = new FakeElement('send', this, {
      visible: true,
      text: '',
      attrs: {
        'aria-disabled': 'true',
        'data-testid': 'send-button',
        id: 'composer-submit-button'
      }
    });

    this.turns = [];

    this.canonical = new FakeElement('canonical', this, {
      visible: false,
      href: null
    });

    this.keyboard = {
      press: async key => {
        if (key === 'Enter' && this.active === this.send) {
          this.submit();
        } else if (key === 'Backspace' && this.active === this.composer) {
          this.composer.text = '';
        }
      },

      insertText: async text => {
        if (this.active === this.composer) {
          this.composer.text = text;
          this.send.attrs['aria-disabled'] = 'false';
        }
      }
    };
  }

  url() {
    return this.currentUrl;
  }

  submit() {
    if (this.send.attrs['aria-disabled'] === 'true') return;

    const text = this.composer.text;

    if (!this.omitUserTurn) {
      this.turns.push(
        new FakeElement('turn', this, { visible: true, text })
      );
    }

    this.composer.text = '';

    const target = this.wrongProject
      ? 'https://chatgpt.com/c/wrong'
      : projectRoot + '/c/abc123';

    if (this.canonicalOnly) {
      this.canonical.href = target;
    } else {
      this.currentUrl = target;
    }
  }

  locator(selector) {
    if (selector === '#prompt-textarea') {
      return new FakeLocator(this, [this.composer]);
    }

    if (
      selector.includes('contenteditable') ||
      selector.includes('textarea[placeholder')
    ) {
      return new FakeLocator(this, []);
    }

    if (selector === '#composer-submit-button') {
      return new FakeLocator(this, [this.send]);
    }

    if (
      selector.includes('send-button') ||
      selector.includes('composer-submit-btn') ||
      selector.includes('type="submit"')
    ) {
      return new FakeLocator(this, []);
    }

    if (selector.includes('data-message-author-role="user"')) {
      return new FakeLocator(this, this.turns);
    }

    if (selector === 'link[rel="canonical"]') {
      return new FakeLocator(this, [this.canonical]);
    }

    if (
      selector.includes('stop-button') ||
      selector.includes('Stop generating')
    ) {
      return new FakeLocator(this, []);
    }

    return new FakeLocator(this, []);
  }
}

const immediateSleep = async () => {};

test('URL helpers understand current /project route', () => {
  assert.equal(
    normalizeUrl(projectRoute + '/#hello'),
    projectRoute
  );

  assert.equal(
    projectIdentityPath(projectRoute),
    '/g/g-p-enpal'
  );

  assert.equal(
    isConversationInsideProject(
      projectRoot + '/c/a',
      projectRoute
    ),
    true
  );

  assert.equal(
    isAnyConversationUrl('https://chatgpt.com/c/a'),
    true
  );

  assert.equal(
    isProjectNewChatSurface(projectRoute, projectRoute),
    true
  );
});

test('sendMessage activates Send by keyboard focus, not pointer click', async () => {
  const page = new FakePage();
  const chat = createChatGptPage(page, {
    submitTimeoutMs: 20,
    sleep: immediateSleep
  });

  const result = await chat.sendMessage('hello', projectRoute);

  assert.equal(result.sent, true);
  assert.equal(result.evidence, 'USER_TURN');
  assert.equal(page.turns[0].text, 'hello');
  assert.equal(page.composer.text, '');
  assert.equal(page.url(), projectRoot + '/c/abc123');
});

test('sendMessage falls back to keyboard insertion when fill misses editor state', async () => {
  const page = new FakePage({ fillBroken: true });
  const chat = createChatGptPage(page, {
    submitTimeoutMs: 20,
    sleep: immediateSleep
  });

  const result = await chat.sendMessage(
    'fallback works',
    projectRoute
  );

  assert.equal(result.sent, true);
  assert.equal(page.turns[0].text, 'fallback works');
});

test('submission can be proven without depending on user-turn DOM', async () => {
  const page = new FakePage({ omitUserTurn: true });
  const chat = createChatGptPage(page, {
    submitTimeoutMs: 20,
    sleep: immediateSleep
  });

  const result = await chat.sendMessage('hello', projectRoute);

  assert.equal(
    result.evidence,
    'PROJECT_CONVERSATION_AND_CLEARED_COMPOSER'
  );
});

test('canonical Project conversation URL is accepted before location changes', async () => {
  const page = new FakePage({
    omitUserTurn: true,
    canonicalOnly: true
  });

  const chat = createChatGptPage(page, {
    submitTimeoutMs: 20,
    conversationTimeoutMs: 20,
    sleep: immediateSleep
  });

  const result = await chat.sendMessage('hello', projectRoute);

  assert.equal(
    result.conversationUrl,
    projectRoot + '/c/abc123'
  );

  assert.equal(
    await chat.waitForConversationUrl(projectRoute),
    projectRoot + '/c/abc123'
  );
});

test('wrong-project conversation fails closed', async () => {
  const page = new FakePage({
    omitUserTurn: true,
    wrongProject: true
  });

  const chat = createChatGptPage(page, {
    submitTimeoutMs: 20,
    sleep: immediateSleep
  });

  await assert.rejects(
    chat.sendMessage('hello', projectRoute),
    /outside the configured Project/
  );
});

test('Send must be enabled before EnPal attempts activation', async () => {
  const page = new FakePage();
  page.composer.fillBroken = true;

  page.keyboard.insertText = async text => {
    page.composer.text = text;
  };

  const chat = createChatGptPage(page, {
    submitTimeoutMs: 1,
    sleep: immediateSleep
  });

  await assert.rejects(
    chat.sendMessage('hello', projectRoute),
    /Send control did not become enabled/
  );

  assert.equal(page.turns.length, 0);
});
