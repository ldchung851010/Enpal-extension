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

test('accepts exact configured runtime sources', () => {
  assert.deepEqual(loadRuntimeConfig(valid), valid);
});

test('rejects missing required IDs instead of discovering files by title', () => {
  assert.throws(() => loadRuntimeConfig({ ...valid, curriculumSpreadsheetId: '' }), {
    message: /curriculumSpreadsheetId/
  });
});
