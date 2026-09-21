import test from 'node:test';
import assert from 'node:assert/strict';
import { makeFakeChrome } from '../helpers/fake-chrome.js';
import { createLocalJournal } from '../../storage/local-journal.js';

test('persists recoverable workflow intent under one namespaced key', async () => {
  const chromeApi = makeFakeChrome();
  const journal = createLocalJournal(chromeApi);

  await journal.write({
    appState: 'PROCESSING',
    sessionId: 'S-001',
    phase: 'ANALYZE_COMMITTED',
    pendingTabId: 42
  });

  assert.deepEqual(await journal.read(), {
    appState: 'PROCESSING',
    sessionId: 'S-001',
    phase: 'ANALYZE_COMMITTED',
    pendingTabId: 42
  });
});

test('patches without erasing existing recovery fields', async () => {
  const chromeApi = makeFakeChrome({
    enpalRecovery: { sessionId: 'S-001', phase: 'SESSION_STUB_CREATED' }
  });
  const journal = createLocalJournal(chromeApi);

  await journal.write({ pendingTabId: 7 });

  assert.deepEqual(await journal.read(), {
    sessionId: 'S-001',
    phase: 'SESSION_STUB_CREATED',
    pendingTabId: 7
  });
});

test('clear removes only EnPal recovery state', async () => {
  const chromeApi = makeFakeChrome({
    enpalRecovery: { sessionId: 'S-001' },
    unrelated: 'keep'
  });
  const journal = createLocalJournal(chromeApi);

  await journal.clear();

  assert.equal(chromeApi.__storage.unrelated, 'keep');
  assert.equal(chromeApi.__storage.enpalRecovery, undefined);
});
