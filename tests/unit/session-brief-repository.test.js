import test from 'node:test';
import assert from 'node:assert/strict';
import { createSessionBriefRepository } from '../../storage/session-brief-repository.js';

test('staging verification rejects curriculum identity mismatch', async () => {
  const sheets = {
    async getValues() {
      return [
        ['key', 'value'],
        ['curriculum_version', 'v1'],
        ['curriculum_sequence', '3'],
        ['lesson_id', 'L-WRONG'],
        ['status', 'READY'],
        ['Primary Skill', 'Speaking'],
        ['Communicative Goal', 'Explain a root cause']
      ];
    }
  };

  const repo = createSessionBriefRepository({
    sheets,
    spreadsheetId: 'brief',
    activeSheetId: 1,
    stagingSheetId: 2
  });

  await assert.rejects(
    repo.verifyStaging({
      curriculum_version: 'v1',
      curriculum_sequence: 3,
      lesson_id: 'L3'
    }),
    /identity mismatch/
  );
});

test('promotion is one atomic batchUpdate call', async () => {
  const calls = [];
  const sheets = {
    async batchUpdate(spreadsheetId, requests) {
      calls.push({ spreadsheetId, requests });
      return { replies: [] };
    }
  };

  const repo = createSessionBriefRepository({
    sheets,
    spreadsheetId: 'brief',
    activeSheetId: 1,
    stagingSheetId: 2
  });

  await repo.promoteStaging({ rowCount: 12, columnCount: 2 });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].spreadsheetId, 'brief');
  assert.equal(calls[0].requests.length, 3);
});

test('readActive maps key/value rows and exposes READY state', async () => {
  const sheets = {
    async getValues(_spreadsheetId, range) {
      assert.equal(range, 'ACTIVE!A:B');
      return [
        ['key', 'value'],
        ['curriculum_version', 'v1'],
        ['curriculum_sequence', '4'],
        ['lesson_id', 'L4'],
        ['ready_marker', 'READY']
      ];
    }
  };

  const repo = createSessionBriefRepository({
    sheets,
    spreadsheetId: 'brief',
    activeSheetId: 1,
    stagingSheetId: 2
  });

  const brief = await repo.readActive();
  assert.equal(brief.curriculum_sequence, 4);
  assert.equal(brief.lesson_id, 'L4');
  assert.equal(brief.ready, true);
});

test('staging verification accepts matching READY structured brief', async () => {
  const sheets = {
    async getValues() {
      return [
        ['key', 'value'],
        ['curriculum_version', 'v1'],
        ['curriculum_sequence', '3'],
        ['lesson_id', 'L3'],
        ['ready_marker', 'READY'],
        ['Primary Skill', 'Speaking'],
        ['Communicative Goal', 'Explain a root cause']
      ];
    }
  };

  const repo = createSessionBriefRepository({
    sheets,
    spreadsheetId: 'brief',
    activeSheetId: 1,
    stagingSheetId: 2
  });

  const verified = await repo.verifyStaging({
    curriculum_version: 'v1',
    curriculum_sequence: 3,
    lesson_id: 'L3'
  });

  assert.equal(verified.ready, true);
});
