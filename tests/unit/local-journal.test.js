import test from 'node:test';
import assert from 'node:assert/strict';
import { makeFakeChrome } from '../helpers/fake-chrome.js';
import {
  createLocalJournal,
  workspaceStorageKey
} from '../../storage/local-journal.js';

test('journal requires an explicit workspace id', () => {
  const chromeApi = makeFakeChrome();

  assert.throws(
    () => createLocalJournal(chromeApi),
    /workspaceId is required/
  );
});

test('persists recoverable workflow intent under the workspace namespace', async () => {
  const chromeApi = makeFakeChrome();
  const journal = createLocalJournal(chromeApi, 'A');

  await journal.write({
    appState: 'PROCESSING',
    sessionId: 'S-A-001',
    phase: 'ANALYZE_COMMITTED',
    pendingTabId: 42
  });

  assert.equal(journal.key, 'enpalWorkspace:A:recovery');
  assert.deepEqual(await journal.read(), {
    appState: 'PROCESSING',
    sessionId: 'S-A-001',
    phase: 'ANALYZE_COMMITTED',
    pendingTabId: 42
  });
});

test('patches without erasing existing fields in the same workspace', async () => {
  const key = workspaceStorageKey('A', 'recovery');
  const chromeApi = makeFakeChrome({
    [key]: { sessionId: 'S-A-001', phase: 'SESSION_STUB_CREATED' }
  });
  const journal = createLocalJournal(chromeApi, 'A');

  await journal.write({ pendingTabId: 7 });

  assert.deepEqual(await journal.read(), {
    sessionId: 'S-A-001',
    phase: 'SESSION_STUB_CREATED',
    pendingTabId: 7
  });
});

test('workspace journals cannot read or overwrite each other', async () => {
  const chromeApi = makeFakeChrome();
  const journalA = createLocalJournal(chromeApi, 'A');
  const journalB = createLocalJournal(chromeApi, 'B');

  await journalA.write({ sessionId: 'S-A', phase: 'PAUSE_COMMITTED' });
  await journalB.write({ sessionId: 'S-B', phase: 'ANALYZE_COMMITTED' });

  assert.deepEqual(await journalA.read(), {
    sessionId: 'S-A',
    phase: 'PAUSE_COMMITTED'
  });
  assert.deepEqual(await journalB.read(), {
    sessionId: 'S-B',
    phase: 'ANALYZE_COMMITTED'
  });
});

test('clearing one workspace preserves other workspace and unrelated storage', async () => {
  const keyA = workspaceStorageKey('A', 'recovery');
  const keyB = workspaceStorageKey('B', 'recovery');
  const chromeApi = makeFakeChrome({
    [keyA]: { sessionId: 'S-A' },
    [keyB]: { sessionId: 'S-B' },
    unrelated: 'keep',
    enpalRecovery: { sessionId: 'legacy-must-not-be-read' }
  });

  const journalA = createLocalJournal(chromeApi, 'A');
  await journalA.clear();

  assert.equal(chromeApi.__storage[keyA], undefined);
  assert.deepEqual(chromeApi.__storage[keyB], { sessionId: 'S-B' });
  assert.equal(chromeApi.__storage.unrelated, 'keep');
  assert.deepEqual(
    chromeApi.__storage.enpalRecovery,
    { sessionId: 'legacy-must-not-be-read' }
  );
});

test('new runtime never falls back to the legacy global enpalRecovery key', async () => {
  const chromeApi = makeFakeChrome({
    enpalRecovery: {
      sessionId: 'legacy',
      phase: 'SESSION_STUB_CREATED'
    }
  });

  const journal = createLocalJournal(chromeApi, 'A');

  assert.deepEqual(await journal.read(), {});
});
