import test from 'node:test';
import assert from 'node:assert/strict';
import { getSidePanelView } from '../../sidepanel/view-model.js';
import { createSidePanelController } from '../../sidepanel/sidepanel.js';

test('maps approved states to legal learner actions', () => {
  assert.deepEqual(getSidePanelView('SETUP_REQUIRED', false).actions, ['SETUP']);
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
