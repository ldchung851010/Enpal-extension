import test from 'node:test';
import assert from 'node:assert/strict';
import { loadRuntimeConfig } from '../../core/config.js';

const valid = {
  projectUrl: 'https://chatgpt.com/g/example-project',
  curriculumSpreadsheetId: 'curriculum-id',
  databaseSpreadsheetId: 'database-id',
  sessionBriefSpreadsheetId: 'brief-id',
  reviewLedgerSpreadsheetId: 'review-id',
  teacherRoleUrl: 'https://drive.google.com/file/d/teacher/view',
  speakingMethodUrl: 'https://drive.google.com/file/d/speaking/view',
  listeningMethodUrl: 'https://drive.google.com/file/d/listening/view'
};

test('accepts exact configured runtime sources unchanged', () => {
  assert.deepEqual(loadRuntimeConfig(valid), valid);
});

test('rejects every missing required runtime source instead of discovering by title', () => {
  for (const key of Object.keys(valid)) {
    assert.throws(
      () => loadRuntimeConfig({ ...valid, [key]: '' }),
      new RegExp(key)
    );
  }
});

test('returns a defensive copy rather than the caller object', () => {
  const result = loadRuntimeConfig(valid);
  assert.notEqual(result, valid);
});
