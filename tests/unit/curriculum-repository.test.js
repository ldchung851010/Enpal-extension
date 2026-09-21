import test from 'node:test';
import assert from 'node:assert/strict';
import { createCurriculumRepository } from '../../storage/curriculum-repository.js';

function workspace(id) {
  return {
  "id": "X",
  "name": "Workspace X",
  "projectUrl": "https://chatgpt.com/g/g-p-X",
  "curriculumSpreadsheetId": "curriculum-X",
  "databaseSpreadsheetId": "database-X",
  "sessionBriefSpreadsheetId": "brief-X",
  "reviewLedgerSpreadsheetId": "review-X",
  "teacherRoleUrl": "https://drive.google.com/file/d/teacher/view",
  "speakingMethodUrl": "https://drive.google.com/file/d/speaking/view",
  "listeningMethodUrl": "https://drive.google.com/file/d/listening/view",
  "sessionBriefActiveSheetId": 101,
  "sessionBriefStagingSheetId": 202
}
    .replace ? null : null;
}

function makeWorkspace(id) {
  return {
    id,
    name: 'Workspace ' + id,
    projectUrl: 'https://chatgpt.com/g/g-p-' + id,
    curriculumSpreadsheetId: 'curriculum-' + id,
    databaseSpreadsheetId: 'database-' + id,
    sessionBriefSpreadsheetId: 'brief-' + id,
    reviewLedgerSpreadsheetId: 'review-' + id,
    teacherRoleUrl: 'https://drive.google.com/file/d/teacher/view',
    speakingMethodUrl: 'https://drive.google.com/file/d/speaking/view',
    listeningMethodUrl: 'https://drive.google.com/file/d/listening/view',
    sessionBriefActiveSheetId: 101,
    sessionBriefStagingSheetId: 202
  };
}

test('curriculum reads only the selected workspace spreadsheet', async () => {
  const calls = [];
  const sheets = {
    async getValues(spreadsheetId) {
      calls.push(spreadsheetId);
      return [
        ['curriculum_sequence', 'lesson_id'],
        ['1', spreadsheetId + '-L1'],
        ['2', spreadsheetId + '-L2']
      ];
    }
  };

  const repoA = createCurriculumRepository({
    sheets,
    workspace: makeWorkspace('A')
  });
  const repoB = createCurriculumRepository({
    sheets,
    workspace: makeWorkspace('B')
  });

  assert.equal((await repoA.getLesson(1)).lesson_id, 'curriculum-A-L1');
  assert.equal((await repoB.getLesson(1)).lesson_id, 'curriculum-B-L1');
  assert.deepEqual(calls, ['curriculum-A', 'curriculum-B']);
});

test('curriculum chooses the smallest sequence not completed', async () => {
  const sheets = {
    async getValues() {
      return [
        ['curriculum_sequence', 'lesson_id'],
        ['1', 'L1'],
        ['2', 'L2'],
        ['3', 'L3']
      ];
    }
  };

  const repo = createCurriculumRepository({
    sheets,
    workspace: makeWorkspace('A')
  });

  assert.equal((await repo.getNextLesson([1, 2])).lesson_id, 'L3');
});

test('legacy spreadsheetId without workspace is rejected', () => {
  assert.throws(
    () => createCurriculumRepository({
      sheets: { async getValues() { return []; } },
      spreadsheetId: 'legacy'
    }),
    /projectUrl|workspace/i
  );
});
