import test from 'node:test';
import assert from 'node:assert/strict';
import { makeFakeChrome } from '../helpers/fake-chrome.js';
import {
  createWorkspaceRegistry,
  WORKSPACES_KEY,
  ACTIVE_WORKSPACE_KEY
} from '../../storage/workspace-registry.js';
import { ERROR_CODES } from '../../core/errors.js';

function workspace(id, overrides = {}) {
  return {
    id,
    name: 'Workspace ' + id,
    projectUrl: 'https://chatgpt.com/g/g-p-' + id,
    curriculumSpreadsheetId: 'curriculum-' + id,
    databaseSpreadsheetId: 'database-' + id,
    sessionBriefSpreadsheetId: 'brief-' + id,
    reviewLedgerSpreadsheetId: 'review-' + id,
    teacherRoleUrl: 'https://drive.google.com/file/d/shared-teacher/view',
    speakingMethodUrl: 'https://drive.google.com/file/d/shared-speaking/view',
    listeningMethodUrl: 'https://drive.google.com/file/d/shared-listening/view',
    sessionBriefActiveSheetId: 100,
    sessionBriefStagingSheetId: 200,
    ...overrides
  };
}

test('initializes one default workspace and makes it active', async () => {
  const chromeApi = makeFakeChrome();
  const registry = createWorkspaceRegistry(chromeApi, {
    defaultWorkspace: workspace('A')
  });

  const active = await registry.ensureInitialized();

  assert.equal(active.id, 'A');
  assert.equal(chromeApi.__storage[ACTIVE_WORKSPACE_KEY], 'A');
  assert.equal(chromeApi.__storage[WORKSPACES_KEY].length, 1);
});

test('allows a DRAFT workspace and does not borrow missing sources', async () => {
  const chromeApi = makeFakeChrome();
  const registry = createWorkspaceRegistry(chromeApi);

  const draft = await registry.add({
    id: 'B',
    name: 'Japanese',
    projectUrl: 'https://chatgpt.com/g/g-p-B/c/chat-1'
  });

  assert.equal(draft.configState, 'DRAFT');
  assert.equal(draft.projectUrl, 'https://chatgpt.com/g/g-p-B');
  assert.equal(draft.curriculumSpreadsheetId, '');
});

test('switching active workspace changes selector only', async () => {
  const chromeApi = makeFakeChrome();
  const registry = createWorkspaceRegistry(chromeApi);

  await registry.add(workspace('A'));
  await registry.add(workspace('B'));

  const before = JSON.parse(JSON.stringify(chromeApi.__storage[WORKSPACES_KEY]));
  await registry.setActive('B');

  assert.equal(chromeApi.__storage[ACTIVE_WORKSPACE_KEY], 'B');
  assert.deepEqual(chromeApi.__storage[WORKSPACES_KEY], before);
});

test('workspace id is immutable during update', async () => {
  const chromeApi = makeFakeChrome();
  const registry = createWorkspaceRegistry(chromeApi);

  await registry.add(workspace('A'));

  await assert.rejects(
    registry.update('A', { id: 'B' }),
    /immutable/
  );

  assert.deepEqual((await registry.list()).map(item => item.id), ['A']);
});

test('runtime identity can be updated without changing workspace id', async () => {
  const chromeApi = makeFakeChrome();
  const registry = createWorkspaceRegistry(chromeApi);

  await registry.add(workspace('A'));
  const updated = await registry.update('A', {
    name: 'Renamed A',
    projectUrl: 'https://chatgpt.com/g/g-p-A-new'
  });

  assert.equal(updated.id, 'A');
  assert.equal(updated.name, 'Renamed A');
  assert.equal(updated.projectUrl, 'https://chatgpt.com/g/g-p-A-new');
});

test('rejects duplicate Project and stateful Sheet sources across workspaces', async () => {
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

    await registry.add(A);

    await assert.rejects(
      registry.add({ ...B, [field]: A[field] }),
      error => error?.code === ERROR_CODES.WORKSPACE_SOURCE_CONFLICT
    );
  }
});

test('static Teacher Role and Method references may be shared', async () => {
  const chromeApi = makeFakeChrome();
  const registry = createWorkspaceRegistry(chromeApi);

  await registry.add(workspace('A'));
  await registry.add(workspace('B'));

  assert.deepEqual((await registry.list()).map(item => item.id), ['A', 'B']);
});

test('rejects activation of a missing workspace', async () => {
  const chromeApi = makeFakeChrome();
  const registry = createWorkspaceRegistry(chromeApi);
  await registry.add(workspace('A'));

  await assert.rejects(
    registry.setActive('missing'),
    error => error?.code === ERROR_CODES.WORKSPACE_NOT_FOUND
  );
});

test('removing the active workspace chooses another without mutating it', async () => {
  const chromeApi = makeFakeChrome();
  const registry = createWorkspaceRegistry(chromeApi);

  await registry.add(workspace('A'));
  await registry.add(workspace('B'));
  await registry.setActive('B');

  const ABefore = await registry.get('A');
  assert.equal(await registry.remove('B'), true);

  assert.equal((await registry.getActive()).id, 'A');
  assert.deepEqual(await registry.get('A'), ABefore);
});

test('refuses to remove the final workspace', async () => {
  const chromeApi = makeFakeChrome();
  const registry = createWorkspaceRegistry(chromeApi);
  await registry.add(workspace('A'));

  await assert.rejects(
    registry.remove('A'),
    /at least one Workspace/
  );
});
