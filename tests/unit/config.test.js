import test from 'node:test';
import assert from 'node:assert/strict';
import {
  loadRuntimeConfig,
  loadWorkspaceConfig,
  isWorkspaceRuntimeReady,
  normalizeProjectUrl
} from '../../core/config.js';

const complete = {
  id: 'english-engineering',
  name: 'English Engineering',
  projectUrl: 'https://chatgpt.com/g/g-p-english',
  curriculumSpreadsheetId: 'curriculum-id',
  databaseSpreadsheetId: 'database-id',
  sessionBriefSpreadsheetId: 'brief-id',
  reviewLedgerSpreadsheetId: 'review-id',
  teacherRoleUrl: 'https://drive.google.com/file/d/teacher/view',
  speakingMethodUrl: 'https://drive.google.com/file/d/speaking/view',
  listeningMethodUrl: 'https://drive.google.com/file/d/listening/view',
  sessionBriefActiveSheetId: 101,
  sessionBriefStagingSheetId: 202
};

test('accepts a complete independent workspace config', () => {
  const result = loadWorkspaceConfig(complete, { allowDraft: false });

  assert.equal(result.configState, 'COMPLETE');
  assert.equal(result.id, complete.id);
  assert.equal(result.projectUrl, complete.projectUrl);
  assert.equal(isWorkspaceRuntimeReady(result), true);
});

test('accepts a DRAFT workspace with only identity and Project URL', () => {
  const result = loadWorkspaceConfig({
    id: 'japanese',
    name: 'Japanese',
    projectUrl: 'https://chatgpt.com/g/g-p-japanese'
  });

  assert.equal(result.configState, 'DRAFT');
  assert.equal(result.curriculumSpreadsheetId, '');
  assert.equal(result.sessionBriefActiveSheetId, null);
  assert.equal(isWorkspaceRuntimeReady(result), false);
});

test('normalizes a Project conversation URL to the Project root', () => {
  assert.equal(
    normalizeProjectUrl('https://chatgpt.com/g/g-p-english/c/abc123?x=1#top'),
    'https://chatgpt.com/g/g-p-english'
  );
});

test('rejects non-Project ChatGPT URLs', () => {
  for (const value of [
    'https://chatgpt.com/',
    'https://chatgpt.com/c/abc123',
    'https://example.com/g/g-p-english'
  ]) {
    assert.throws(() => normalizeProjectUrl(value), /Project URL/);
  }
});

test('requires a stable workspace id and name', () => {
  assert.throws(
    () => loadWorkspaceConfig({ ...complete, id: '' }),
    /workspace id/i
  );
  assert.throws(
    () => loadWorkspaceConfig({ ...complete, id: 'bad id' }),
    /workspace id/i
  );
  assert.throws(
    () => loadWorkspaceConfig({ ...complete, name: '' }),
    /workspace name/i
  );
});

test('runtime-ready workspace rejects every missing required source', () => {
  const required = [
    'curriculumSpreadsheetId',
    'databaseSpreadsheetId',
    'sessionBriefSpreadsheetId',
    'reviewLedgerSpreadsheetId',
    'teacherRoleUrl',
    'speakingMethodUrl',
    'listeningMethodUrl',
    'sessionBriefActiveSheetId',
    'sessionBriefStagingSheetId'
  ];

  for (const key of required) {
    const missing = { ...complete, [key]: '' };
    assert.throws(
      () => loadWorkspaceConfig(missing, { allowDraft: false }),
      new RegExp(key)
    );
  }
});

test('Session Brief sheet ids must be non-negative integers', () => {
  assert.throws(
    () => loadWorkspaceConfig({ ...complete, sessionBriefActiveSheetId: -1 }),
    /sessionBriefActiveSheetId/
  );
  assert.throws(
    () => loadWorkspaceConfig({ ...complete, sessionBriefStagingSheetId: 1.5 }),
    /sessionBriefStagingSheetId/
  );
});

test('legacy runtime validator remains available only as a lower-level transition helper', () => {
  const runtime = { ...complete };
  delete runtime.id;
  delete runtime.name;
  delete runtime.configState;

  const result = loadRuntimeConfig(runtime);
  assert.equal(result.projectUrl, complete.projectUrl);
  assert.equal(result.curriculumSpreadsheetId, complete.curriculumSpreadsheetId);
});
