import test from 'node:test';
import assert from 'node:assert/strict';
import { createReviewLedgerRepository } from '../../storage/review-ledger-repository.js';

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

test('review ledger reads only the selected workspace spreadsheet', async () => {
  const calls = [];
  const sheets = {
    async getValues(spreadsheetId) {
      calls.push(spreadsheetId);
      return [
        ['ID', 'Review Item'],
        ['R-1', spreadsheetId]
      ];
    }
  };

  const A = createReviewLedgerRepository({
    sheets,
    workspace: makeWorkspace('A')
  });
  const B = createReviewLedgerRepository({
    sheets,
    workspace: makeWorkspace('B')
  });

  assert.equal((await A.readAll())[0]['Review Item'], 'review-A');
  assert.equal((await B.readAll())[0]['Review Item'], 'review-B');
  assert.deepEqual(calls, ['review-A', 'review-B']);
});

test('review ledger is read-only at repository boundary', async () => {
  let writes = 0;
  const sheets = {
    async getValues() {
      return [['ID'], ['R-1']];
    },
    async updateValues() { writes += 1; },
    async batchUpdate() { writes += 1; }
  };

  const repo = createReviewLedgerRepository({
    sheets,
    workspace: makeWorkspace('A')
  });

  await repo.readAll();
  assert.equal(writes, 0);
});
