import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { getSidePanelView } from '../../sidepanel/view-model.js';
import {
  createSidePanelController,
  bootstrapSidePanel
} from '../../sidepanel/sidepanel.js';

test('maps approved states to legal learner actions', () => {
  assert.deepEqual(getSidePanelView('SETUP_REQUIRED', false).actions, ['SETUP']);
  assert.deepEqual(
    getSidePanelView('PLATFORM_VERIFICATION_REQUIRED', false).actions,
    ['CONFIRM_PLATFORM']
  );
  assert.deepEqual(getSidePanelView('READY', false).actions, ['START']);
  assert.deepEqual(getSidePanelView('LEARNING', false).actions, ['PAUSE', 'END']);
  assert.deepEqual(getSidePanelView('PAUSED', false).actions, ['START']);
  assert.deepEqual(getSidePanelView('PROCESSING', false).actions, []);
  assert.deepEqual(getSidePanelView('ERROR', true).actions, ['RETRY']);
  assert.deepEqual(getSidePanelView('ERROR', false).actions, []);
});

test('learner-facing copy never exposes internal END pipeline labels', () => {
  for (const state of [
    'SETUP_REQUIRED',
    'PLATFORM_VERIFICATION_REQUIRED',
    'READY',
    'LEARNING',
    'PAUSED',
    'PROCESSING',
    'ERROR'
  ]) {
    const view = getSidePanelView(state, true);
    assert.equal(typeof view.message, 'string');
    assert.doesNotMatch(view.message, /ANALYZE|UPDATE|Planner|BRIEF_STAGED|BRIEF_PROMOTED/);
  }
});

test('unknown state exposes no action', () => {
  assert.deepEqual(getSidePanelView('UNKNOWN', false).actions, []);
});


function makeFakeDocument() {
  class FakeElement {
    constructor() {
      this.hidden = true;
      this.disabled = true;
      this.textContent = '';
      this.value = '';
      this.handlers = new Map();
    }
    addEventListener(type, handler) {
      this.handlers.set(type, handler);
    }
    click() {
      return this.handlers.get('click')?.();
    }
  }

  const ids = [
    'status',
    'project-url-input',
    'save-project-action',
    'setup-action',
    'confirm-platform-action',
    'start-action',
    'pause-action',
    'end-action',
    'retry-action'
  ];
  const elements = Object.fromEntries(ids.map((id) => [id, new FakeElement()]));

  return {
    documentElement: { dataset: {} },
    getElementById(id) {
      return elements[id] ?? null;
    },
    elements
  };
}

test('Side Panel actions invoke only public workflow methods and render resulting learner state', async () => {
  const calls = [];
  const workflow = {
    async recover(options) {
      calls.push(['recover', options]);
      return { state: options?.interactiveSetup ? 'READY' : 'READY' };
    },
    async start() {
      calls.push(['start']);
      return { action: 'STARTED' };
    },
    async pause() {
      calls.push(['pause']);
      return { action: 'PAUSED' };
    },
    async end() {
      calls.push(['end']);
      return { action: 'READY' };
    }
  };
  const fakeDocument = makeFakeDocument();
  createSidePanelController({ workflow, documentRef: fakeDocument });

  assert.equal(fakeDocument.elements['setup-action'].hidden, false);
  assert.equal(fakeDocument.elements['start-action'].hidden, true);

  await fakeDocument.elements['setup-action'].click();
  assert.equal(fakeDocument.elements['start-action'].hidden, false);

  await fakeDocument.elements['start-action'].click();
  assert.equal(fakeDocument.elements['pause-action'].hidden, false);
  assert.equal(fakeDocument.elements['end-action'].hidden, false);

  await fakeDocument.elements['pause-action'].click();
  assert.equal(fakeDocument.elements['start-action'].hidden, false);

  await fakeDocument.elements['start-action'].click();
  await fakeDocument.elements['end-action'].click();
  assert.equal(fakeDocument.elements['start-action'].hidden, false);

  assert.deepEqual(calls, [
    ['recover', { interactiveSetup: true }],
    ['start'],
    ['pause'],
    ['start'],
    ['end']
  ]);
});


test('Side Panel initializes from durable workflow recovery when reopened', async () => {
  const calls = [];
  const workflow = {
    async recover(options) {
      calls.push(['recover', options]);
      return { state: 'LEARNING', action: 'ALREADY_IN_PROGRESS' };
    },
    async start() {},
    async pause() {},
    async end() {}
  };
  const fakeDocument = makeFakeDocument();
  const controller = createSidePanelController({ workflow, documentRef: fakeDocument });

  await controller.initialize();

  assert.deepEqual(calls, [['recover', undefined]]);
  assert.equal(fakeDocument.documentElement.dataset.enpalState, 'LEARNING');
  assert.equal(fakeDocument.elements['pause-action'].hidden, false);
  assert.equal(fakeDocument.elements['end-action'].hidden, false);
  assert.equal(fakeDocument.elements['start-action'].hidden, true);
});


test('platform verification state exposes one explicit confirmation action', async () => {
  const calls = [];
  const workflow = {
    async recover(options) {
      calls.push(['recover', options]);
      return { state: 'PLATFORM_VERIFICATION_REQUIRED' };
    },
    async confirmPlatformGate() {
      calls.push(['confirmPlatformGate']);
      return { state: 'READY', action: 'READY' };
    },
    async start() {},
    async pause() {},
    async end() {}
  };
  const fakeDocument = makeFakeDocument();
  const controller = createSidePanelController({ workflow, documentRef: fakeDocument });

  await controller.invoke('SETUP');
  assert.equal(fakeDocument.elements['confirm-platform-action'].hidden, false);
  assert.equal(fakeDocument.elements['setup-action'].hidden, true);

  await fakeDocument.elements['confirm-platform-action'].click();

  assert.deepEqual(calls, [
    ['recover', { interactiveSetup: true }],
    ['confirmPlatformGate']
  ]);
  assert.equal(fakeDocument.elements['start-action'].hidden, false);
  assert.equal(fakeDocument.documentElement.dataset.enpalState, 'READY');
});

test('real Side Panel HTML contains the Project access confirmation button', () => {
  const html = readFileSync(
    new URL('../../sidepanel/index.html', import.meta.url),
    'utf8'
  );
  assert.match(html, /id="confirm-platform-action"/);
  assert.match(html, /Confirm Project access verified/);
});


test('setup failure shows the concrete reason and keeps Verify setup available', async () => {
  const workflow = {
    async recover() {
      const error = new Error('Sessions sheet missing required status column');
      error.recoverable = false;
      throw error;
    },
    async start() {},
    async pause() {},
    async end() {}
  };
  const fakeDocument = makeFakeDocument();
  const controller = createSidePanelController({ workflow, documentRef: fakeDocument });

  await controller.invoke('SETUP');

  assert.equal(fakeDocument.documentElement.dataset.enpalState, 'SETUP_REQUIRED');
  assert.match(
    fakeDocument.elements.status.textContent,
    /Sessions sheet missing required status column/
  );
  assert.equal(fakeDocument.elements['setup-action'].hidden, false);
});

test('setup result reason is rendered instead of a generic dead-end message', async () => {
  const workflow = {
    async recover() {
      return {
        state: 'SETUP_REQUIRED',
        reason: 'Google authorization unavailable'
      };
    },
    async start() {},
    async pause() {},
    async end() {}
  };
  const fakeDocument = makeFakeDocument();
  const controller = createSidePanelController({ workflow, documentRef: fakeDocument });

  await controller.invoke('SETUP');

  assert.equal(fakeDocument.documentElement.dataset.enpalState, 'SETUP_REQUIRED');
  assert.match(fakeDocument.elements.status.textContent, /Google authorization unavailable/);
  assert.equal(fakeDocument.elements['setup-action'].hidden, false);
});


test('Project URL field is prefilled, saves to persistent settings, and reloads EnPal', async () => {
  const calls = [];
  const workflow = {
    async recover() {
      return { state: 'SETUP_REQUIRED', reason: 'Project URL is required' };
    },
    async start() {},
    async pause() {},
    async end() {}
  };
  const projectSettings = {
    async save(value) {
      calls.push(['save', value]);
      return 'https://chatgpt.com/g/g-p-new-project';
    }
  };
  const fakeDocument = makeFakeDocument();
  let reloadCount = 0;

  const controller = createSidePanelController({
    workflow,
    documentRef: fakeDocument,
    projectSettings,
    initialProjectUrl: 'https://chatgpt.com/g/g-p-old-project',
    reload: async () => {
      reloadCount += 1;
    }
  });

  await controller.initialize();

  assert.equal(
    fakeDocument.elements['project-url-input'].value,
    'https://chatgpt.com/g/g-p-old-project'
  );

  fakeDocument.elements['project-url-input'].value =
    'https://chatgpt.com/g/g-p-new-project/';
  await fakeDocument.elements['save-project-action'].click();

  assert.deepEqual(calls, [
    ['save', 'https://chatgpt.com/g/g-p-new-project/']
  ]);
  assert.equal(
    fakeDocument.elements['project-url-input'].value,
    'https://chatgpt.com/g/g-p-new-project'
  );
  assert.equal(reloadCount, 1);
});

test('bootstrap reads saved Project URL before creating the runtime workflow', async () => {
  const savedProjectUrl = 'https://chatgpt.com/g/g-p-saved-project';
  const chromeApi = {
    storage: {
      local: {
        async get(key) {
          return { [key]: savedProjectUrl };
        },
        async set() {}
      }
    }
  };
  const fakeDocument = makeFakeDocument();
  let receivedConfig = null;

  await bootstrapSidePanel({
    chromeApi,
    documentRef: fakeDocument,
    workflowFactory({ config }) {
      receivedConfig = config;
      return {
        async recover() {
          return { state: 'SETUP_REQUIRED' };
        },
        async start() {},
        async pause() {},
        async end() {}
      };
    },
    reload: async () => {}
  });

  assert.equal(receivedConfig.projectUrl, savedProjectUrl);
  assert.equal(
    fakeDocument.elements['project-url-input'].value,
    savedProjectUrl
  );
});

test('real Side Panel HTML contains a Project URL field and save control', () => {
  const html = readFileSync(
    new URL('../../sidepanel/index.html', import.meta.url),
    'utf8'
  );
  assert.match(html, /id="project-url-input"/);
  assert.match(html, /id="save-project-action"/);
  assert.match(html, /ChatGPT Project/);
});
