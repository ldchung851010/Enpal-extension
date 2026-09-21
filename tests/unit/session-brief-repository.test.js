import test from 'node:test';
import assert from 'node:assert/strict';
import { createSessionBriefRepository } from '../../storage/session-brief-repository.js';

function makeWorkspace(id, activeSheetId = 101, stagingSheetId = 202) {
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
    sessionBriefActiveSheetId: activeSheetId,
    sessionBriefStagingSheetId: stagingSheetId
  };
}

function completeBriefRows(overrides = {}) {
  const values = {
    schema_version: '1.0',
    curriculum_version: 'v1',
    curriculum_sequence: '3',
    lesson_id: 'L3',
    ready_marker: 'READY',
    'Primary Skill': 'Speaking',
    'Communicative Goal': 'Explain a root cause',
    Focus: JSON.stringify(['Explain the current technical problem']),
    'Review Focus': JSON.stringify([]),
    Situation: 'Engineering problem update',
    'Target Performance': 'Explain the problem clearly.',
    'Completion Criteria': JSON.stringify(['Listener can follow the explanation.']),
    'Mask Policy': 'OFF',
    ...overrides
  };
  return [['key', 'value'], ...Object.entries(values)];
}

test('readActive uses the selected workspace Session Brief spreadsheet', async () => {
  const calls = [];
  const sheets = {
    async getValues(spreadsheetId, range) {
      calls.push({ spreadsheetId, range });
      return [
        ['key', 'value'],
        ['curriculum_sequence', '4'],
        ['lesson_id', spreadsheetId],
        ['ready_marker', 'READY']
      ];
    },
    async batchUpdate() {}
  };

  const A = createSessionBriefRepository({
    sheets,
    workspace: makeWorkspace('A')
  });
  const B = createSessionBriefRepository({
    sheets,
    workspace: makeWorkspace('B')
  });

  assert.equal((await A.readActive()).lesson_id, 'brief-A');
  assert.equal((await B.readActive()).lesson_id, 'brief-B');
  assert.deepEqual(calls.map(x => x.spreadsheetId), ['brief-A', 'brief-B']);
});

test('staging verification remains structural and identity-bound', async () => {
  const sheets = {
    async getValues() {
      return completeBriefRows();
    },
    async batchUpdate() {}
  };

  const repo = createSessionBriefRepository({
    sheets,
    workspace: makeWorkspace('A')
  });

  const brief = await repo.verifyStaging({
    curriculum_version: 'v1',
    curriculum_sequence: 3,
    lesson_id: 'L3'
  });

  assert.equal(brief.ready, true);
});

test('promotion uses the workspace-specific ACTIVE and _STAGING sheet ids atomically', async () => {
  const calls = [];
  const sheets = {
    async getValues() { return []; },
    async batchUpdate(spreadsheetId, requests) {
      calls.push({ spreadsheetId, requests });
      return { replies: [] };
    }
  };

  const repo = createSessionBriefRepository({
    sheets,
    workspace: makeWorkspace('A', 301, 302)
  });

  await repo.promoteStaging({ rowCount: 14, columnCount: 2 });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].spreadsheetId, 'brief-A');
  assert.equal(calls[0].requests[0].repeatCell.range.sheetId, 301);
  assert.equal(calls[0].requests[1].copyPaste.source.sheetId, 302);
  assert.equal(calls[0].requests[1].copyPaste.destination.sheetId, 301);
  assert.equal(calls[0].requests[2].repeatCell.range.sheetId, 302);
});

test('legacy spreadsheet and sheet ids without workspace are rejected', () => {
  assert.throws(
    () => createSessionBriefRepository({
      sheets: {
        async getValues() { return []; },
        async batchUpdate() {}
      },
      spreadsheetId: 'brief',
      activeSheetId: 1,
      stagingSheetId: 2
    }),
    /projectUrl|workspace/i
  );
});
