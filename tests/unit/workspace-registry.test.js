import test from 'node:test';
import assert from 'node:assert/strict';
import { makeFakeChrome } from '../helpers/fake-chrome.js';
import {
  createWorkspaceRegistry,
  workspaceStorageKey
} from '../../storage/workspace-registry.js';

function workspace(id, suffix = id) {
  return {
    id,
    name: 'Workspace ' + suffix,
    projectUrl: 'https://chatgpt.com/g/g-p-' + suffix,
    curriculumSpreadsheetId: 'curriculum-' + suffix,
    databaseSpreadsheetId: 'database-' + suffix,
    sessionBriefSpreadsheetId: 'brief-' + suffix,
    reviewLedgerSpreadsheetId: 'review-' + suffix,
    teacherRoleUrl: 'https://drive.google.com/file/d/teacher-' + suffix + '/view',
    speakingMethodUrl: 'https://drive.google.com/file/d/speaking-' + suffix + '/view',
    listeningMethodUrl: 'https://drive.google.com/file/d/listening-' + suffix + '/view',
    sessionBriefActiveSheetId: 100 + suffix.length,
    sessionBriefStagingSheetId: 200 + suffix.length
  };
}

test('registry keeps multiple workspace configs isolated and remembers the active workspace', async () => {
  const chromeApi = makeFakeChrome();
  const registry = createWorkspaceRegistry(chromeApi);

  await registry.save(workspace('A'));
  await registry.save(workspace('B'));
  await registry.setActive('B');

  assert.deepEqual((await registry.list()).map(item => item.id), ['A', 'B']);
  assert.equal((await registry.getActive()).id, 'B');
  assert.equal((await registry.get('A')).databaseSpreadsheetId, 'database-A');
  assert.equal((await registry.get('B')).databaseSpreadsheetId, 'database-B');

  await registry.setActive('A');

  assert.equal((await registry.getActive()).id, 'A');
  assert.equal((await registry.get('B')).projectUrl, 'https://chatgpt.com/g/g-p-B');
});

test('first initialization creates the default workspace and migrates legacy local state into its namespace', async () => {
  const defaultWorkspace = workspace('english-engineering', 'english');
  const chromeApi = makeFakeChrome({
    enpalRecovery: { sessionId: 'S-LEGACY', phase: 'SESSION_STUB_CREATED' },
    enpalPlatformGate: { status: 'PASS', fingerprint: 'legacy-fingerprint' }
  });
  const registry = createWorkspaceRegistry(chromeApi, { defaultWorkspace });

  const active = await registry.ensureInitialized();

  assert.equal(active.id, 'english-engineering');
  assert.equal((await registry.list()).length, 1);
  assert.deepEqual(
    chromeApi.__storage[workspaceStorageKey('english-engineering', 'recovery')],
    { sessionId: 'S-LEGACY', phase: 'SESSION_STUB_CREATED' }
  );
  assert.deepEqual(
    chromeApi.__storage[workspaceStorageKey('english-engineering', 'platformGate')],
    { status: 'PASS', fingerprint: 'legacy-fingerprint' }
  );
  assert.equal(chromeApi.__storage.enpalRecovery, undefined);
  assert.equal(chromeApi.__storage.enpalPlatformGate, undefined);
});

test('removing a workspace deletes only its local namespace and never another workspace state', async () => {
  const chromeApi = makeFakeChrome();
  const registry = createWorkspaceRegistry(chromeApi);
  await registry.save(workspace('A'));
  await registry.save(workspace('B'));
  await registry.setActive('A');

  chromeApi.__storage[workspaceStorageKey('A', 'recovery')] = { sessionId: 'S-A' };
  chromeApi.__storage[workspaceStorageKey('A', 'platformGate')] = { status: 'PASS' };
  chromeApi.__storage[workspaceStorageKey('B', 'recovery')] = { sessionId: 'S-B' };
  chromeApi.__storage.unrelated = 'keep';

  await registry.remove('A');

  assert.equal(await registry.get('A'), null);
  assert.equal((await registry.getActive()).id, 'B');
  assert.equal(chromeApi.__storage[workspaceStorageKey('A', 'recovery')], undefined);
  assert.equal(chromeApi.__storage[workspaceStorageKey('A', 'platformGate')], undefined);
  assert.deepEqual(
    chromeApi.__storage[workspaceStorageKey('B', 'recovery')],
    { sessionId: 'S-B' }
  );
  assert.equal(chromeApi.__storage.unrelated, 'keep');
});

test('registry rejects an incomplete workspace so state sources cannot silently fall back to another workspace', async () => {
  const chromeApi = makeFakeChrome();
  const registry = createWorkspaceRegistry(chromeApi);

  await assert.rejects(
    registry.save({
      id: 'broken',
      name: 'Broken',
      projectUrl: 'https://chatgpt.com/g/g-p-broken'
    }),
    /curriculumSpreadsheetId/
  );

  assert.deepEqual(await registry.list(), []);
});


test('changing workspace runtime sources clears only that workspace local runtime state', async () => {
  const chromeApi = makeFakeChrome();
  const registry = createWorkspaceRegistry(chromeApi);
  const A = workspace('A');
  const B = workspace('B');

  await registry.save(A);
  await registry.save(B);

  chromeApi.__storage[workspaceStorageKey('A', 'recovery')] = {
    sessionId: 'S-A'
  };
  chromeApi.__storage[workspaceStorageKey('A', 'platformGate')] = {
    status: 'PASS'
  };
  chromeApi.__storage[workspaceStorageKey('B', 'recovery')] = {
    sessionId: 'S-B'
  };

  await registry.save({
    ...A,
    projectUrl: 'https://chatgpt.com/g/g-p-A-new'
  });

  assert.equal(
    chromeApi.__storage[workspaceStorageKey('A', 'recovery')],
    undefined
  );
  assert.equal(
    chromeApi.__storage[workspaceStorageKey('A', 'platformGate')],
    undefined
  );
  assert.deepEqual(
    chromeApi.__storage[workspaceStorageKey('B', 'recovery')],
    { sessionId: 'S-B' }
  );
});

test('renaming a workspace preserves its local runtime state', async () => {
  const chromeApi = makeFakeChrome();
  const registry = createWorkspaceRegistry(chromeApi);
  const A = workspace('A');

  await registry.save(A);
  chromeApi.__storage[workspaceStorageKey('A', 'recovery')] = {
    sessionId: 'S-A'
  };

  await registry.save({
    ...A,
    name: 'Renamed Workspace'
  });

  assert.deepEqual(
    chromeApi.__storage[workspaceStorageKey('A', 'recovery')],
    { sessionId: 'S-A' }
  );
});


test('registry rejects workspaces that reuse another workspace Project or stateful Sheet', async () => {
  const protectedFields = [
    'projectUrl',
    'curriculumSpreadsheetId',
    'databaseSpreadsheetId',
    'sessionBriefSpreadsheetId',
    'reviewLedgerSpreadsheetId'
  ];

  for (const field of protectedFields) {
    const chromeApi = makeFakeChrome();
    const registry = createWorkspaceRegistry(chromeApi);
    const A = workspace('A');
    const B = workspace('B');

    await registry.save(A);

    await assert.rejects(
      registry.save({ ...B, [field]: A[field] }),
      new RegExp(field)
    );

    assert.deepEqual((await registry.list()).map(item => item.id), ['A']);
  }
});


test('registry refuses to remove the final workspace', async () => {
  const chromeApi = makeFakeChrome();
  const registry = createWorkspaceRegistry(chromeApi);
  await registry.save(workspace('A'));

  await assert.rejects(
    registry.remove('A'),
    /at least one workspace/i
  );

  assert.equal((await registry.getActive()).id, 'A');
  assert.deepEqual((await registry.list()).map(item => item.id), ['A']);
});
