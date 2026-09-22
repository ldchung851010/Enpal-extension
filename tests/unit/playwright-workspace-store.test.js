import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';

import {
  createWorkspaceFileStore,
  normalizePlaywrightWorkspace
} from '../../playwright/workspace-store.js';

function workspace(id, project, suffix = '') {
  return {
    id,
    name: id,
    projectUrl: project,
    curriculumSpreadsheetId: 'curriculum-' + id + suffix,
    databaseSpreadsheetId: 'database-' + id + suffix,
    sessionBriefSpreadsheetId: 'brief-' + id + suffix,
    reviewLedgerSpreadsheetId: 'review-' + id + suffix,
    teacherRoleUrl: 'https://drive.google.com/teacher-' + id,
    speakingMethodUrl: 'https://drive.google.com/speaking-' + id,
    listeningMethodUrl: 'https://drive.google.com/listening-' + id,
    sessionBriefActiveSheetId: 1,
    sessionBriefStagingSheetId: 2
  };
}

test('Playwright workspace normalizes conversation and root URLs to /project route', () => {
  const fromRoot = normalizePlaywrightWorkspace(
    workspace('a', 'https://chatgpt.com/g/g-p-a')
  );
  const fromConversation = normalizePlaywrightWorkspace(
    workspace('b', 'https://chatgpt.com/g/g-p-b/c/abc')
  );

  assert.equal(fromRoot.projectUrl, 'https://chatgpt.com/g/g-p-a/project');
  assert.equal(fromConversation.projectUrl, 'https://chatgpt.com/g/g-p-b/project');
});

test('workspace file store isolates multiple workspaces and persists active selection', async t => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'enpal-workspaces-'));
  t.after(async () => rm(dir, { recursive: true, force: true }));

  const store = createWorkspaceFileStore({
    filePath: path.join(dir, 'workspaces.json')
  });

  await store.save(
    workspace('english', 'https://chatgpt.com/g/g-p-english'),
    { makeActive: true }
  );
  await store.save(
    workspace('german', 'https://chatgpt.com/g/g-p-german')
  );

  assert.equal((await store.getActive()).id, 'english');

  await store.setActive('german');
  assert.equal((await store.getActive()).id, 'german');
  assert.equal((await store.list()).length, 2);
});

test('workspace file store rejects shared stateful sources across workspaces', async t => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'enpal-workspaces-'));
  t.after(async () => rm(dir, { recursive: true, force: true }));

  const store = createWorkspaceFileStore({
    filePath: path.join(dir, 'workspaces.json')
  });

  const a = workspace('a', 'https://chatgpt.com/g/g-p-a');
  const b = workspace('b', 'https://chatgpt.com/g/g-p-b');
  b.databaseSpreadsheetId = a.databaseSpreadsheetId;

  await store.save(a, { makeActive: true });

  await assert.rejects(
    store.save(b),
    /databaseSpreadsheetId is already used/
  );
});
