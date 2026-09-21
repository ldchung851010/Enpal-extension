import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { getSidePanelView } from '../../sidepanel/view-model.js';
import { createSidePanelController } from '../../sidepanel/sidepanel.js';

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
    async verifySetup(options) {
      calls.push(['verifySetup', options]);
      return { state: 'READY' };
    },
    async inspect() {
      calls.push(['inspect']);
      return { state: 'READY' };
    },
    async recover(options) {
      calls.push(['recover', options]);
      return { state: 'READY' };
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
  for (const id of ['start-action', 'pause-action', 'end-action']) {
    assert.equal(fakeDocument.elements[id].hidden, false);
    assert.equal(fakeDocument.elements[id].disabled, true);
  }

  await fakeDocument.elements['setup-action'].click();
  assert.equal(fakeDocument.elements['start-action'].hidden, false);
  assert.equal(fakeDocument.elements['start-action'].disabled, false);
  assert.equal(fakeDocument.elements['pause-action'].disabled, true);
  assert.equal(fakeDocument.elements['end-action'].disabled, true);

  await fakeDocument.elements['start-action'].click();
  assert.equal(fakeDocument.elements['start-action'].disabled, true);
  assert.equal(fakeDocument.elements['pause-action'].hidden, false);
  assert.equal(fakeDocument.elements['pause-action'].disabled, false);
  assert.equal(fakeDocument.elements['end-action'].hidden, false);
  assert.equal(fakeDocument.elements['end-action'].disabled, false);

  await fakeDocument.elements['pause-action'].click();
  assert.equal(fakeDocument.elements['start-action'].disabled, false);
  assert.equal(fakeDocument.elements['pause-action'].disabled, true);
  assert.equal(fakeDocument.elements['end-action'].disabled, true);

  await fakeDocument.elements['start-action'].click();
  await fakeDocument.elements['end-action'].click();
  assert.equal(fakeDocument.elements['start-action'].disabled, false);

  assert.deepEqual(calls, [
    ['verifySetup', { interactive: true }],
    ['start'],
    ['pause'],
    ['start'],
    ['end']
  ]);
});


test('Side Panel initializes from durable workflow recovery when reopened', async () => {
  const calls = [];
  const workflow = {
    async inspect() {
      calls.push(['inspect']);
      return { state: 'LEARNING', action: 'ALREADY_IN_PROGRESS' };
    },
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

  assert.deepEqual(calls, [['inspect']]);
  assert.equal(fakeDocument.documentElement.dataset.enpalState, 'LEARNING');
  assert.equal(fakeDocument.elements['start-action'].hidden, false);
  assert.equal(fakeDocument.elements['start-action'].disabled, true);
  assert.equal(fakeDocument.elements['pause-action'].hidden, false);
  assert.equal(fakeDocument.elements['pause-action'].disabled, false);
  assert.equal(fakeDocument.elements['end-action'].hidden, false);
  assert.equal(fakeDocument.elements['end-action'].disabled, false);
});


test('platform verification state exposes one explicit confirmation action', async () => {
  const calls = [];
  const workflow = {
    async verifySetup(options) {
      calls.push(['verifySetup', options]);
      return { state: 'PLATFORM_VERIFICATION_REQUIRED' };
    },
    async inspect() {
      calls.push(['inspect']);
      return { state: 'PLATFORM_VERIFICATION_REQUIRED' };
    },
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
    ['verifySetup', { interactive: true }],
    ['confirmPlatformGate']
  ]);
  assert.equal(fakeDocument.elements['start-action'].hidden, false);
  assert.equal(fakeDocument.elements['start-action'].disabled, false);
  assert.equal(fakeDocument.elements['pause-action'].hidden, false);
  assert.equal(fakeDocument.elements['pause-action'].disabled, true);
  assert.equal(fakeDocument.elements['end-action'].hidden, false);
  assert.equal(fakeDocument.elements['end-action'].disabled, true);
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

test('real Side Panel HTML always renders START, PAUSE, and END as visible core controls', () => {
  const html = readFileSync(
    new URL('../../sidepanel/index.html', import.meta.url),
    'utf8'
  );

  for (const id of ['start-action', 'pause-action', 'end-action']) {
    const match = html.match(new RegExp(`<button[^>]*id="${id}"[^>]*>`));
    assert.ok(match, `${id} must exist`);
    assert.doesNotMatch(match[0], /\shidden(?:\s|>|=)/);
    assert.match(match[0], /\sdisabled(?:\s|>|=)/);
  }
});


test('setup failure shows the concrete reason and keeps Verify setup available', async () => {
  const workflow = {
    async verifySetup() {
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
    async verifySetup() {
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


test('controller reports learner state changes so workspace switching can be locked during active processing', async () => {
  const states = [];
  const workflow = {
    async inspect() {
      return { state: 'READY' };
    },
    async recover() {
      return { state: 'READY' };
    },
    async start() {
      return { action: 'STARTED' };
    },
    async pause() {
      return { action: 'PAUSED' };
    },
    async end() {
      return { action: 'READY' };
    }
  };
  const fakeDocument = makeFakeDocument();
  const controller = createSidePanelController({
    workflow,
    documentRef: fakeDocument,
    onStateChange(state) {
      states.push(state);
    }
  });

  await controller.initialize();
  await controller.invoke('START');
  await controller.invoke('PAUSE');

  assert.ok(states.includes('READY'));
  assert.ok(states.includes('LEARNING'));
  assert.ok(states.includes('PAUSED'));
});


test('Verify setup and Side Panel initialization never call recovery', async () => {
  const calls = [];
  const workflow = {
    async verifySetup(options) {
      calls.push(['verifySetup', options]);
      return { state: 'READY' };
    },
    async inspect() {
      calls.push(['inspect']);
      return {
        state: 'ERROR',
        recoverable: true,
        reason: 'An incomplete START is waiting for Retry.'
      };
    },
    async recover() {
      calls.push(['recover']);
      throw new Error('Recovery must require explicit Retry');
    },
    async start() {},
    async pause() {},
    async end() {}
  };
  const fakeDocument = makeFakeDocument();
  const controller = createSidePanelController({ workflow, documentRef: fakeDocument });

  await controller.initialize();
  assert.equal(fakeDocument.elements['retry-action'].hidden, false);

  await controller.invoke('SETUP');

  assert.deepEqual(calls, [
    ['inspect'],
    ['verifySetup', { interactive: true }]
  ]);
});
