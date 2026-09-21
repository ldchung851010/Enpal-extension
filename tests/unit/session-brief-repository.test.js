import test from 'node:test';
import assert from 'node:assert/strict';
import { createSessionBriefRepository } from '../../storage/session-brief-repository.js';

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
    'Target Performance': 'Explain the problem clearly in a short work exchange.',
    'Completion Criteria': JSON.stringify([
      'Learner explains the problem in a way the listener can follow.'
    ]),
    'Mask Policy': 'OFF',
    ...overrides
  };

  return [
    ['key', 'value'],
    ...Object.entries(values)
  ];
}

test('staging verification rejects curriculum identity mismatch', async () => {
  const sheets = {
    async getValues() {
      return completeBriefRows({ lesson_id: 'L-WRONG' });
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

  await repo.promoteStaging({ rowCount: 14, columnCount: 2 });

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
      return completeBriefRows();
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

test('staging verification rejects missing required fields', async () => {
  const rows = completeBriefRows().filter(([key]) => key !== 'Situation');
  const sheets = {
    async getValues() {
      return rows;
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
    /missing required key: Situation/
  );
});

test('staging verification rejects non-array Focus', async () => {
  const sheets = {
    async getValues() {
      return completeBriefRows({ Focus: JSON.stringify('not-an-array') });
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
    /Focus must be a non-empty JSON array/
  );
});

test('staging verification rejects legacy NONE Review Focus representation', async () => {
  const sheets = {
    async getValues() {
      return completeBriefRows({ 'Review Focus': 'NONE' });
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
    /Review Focus must be valid JSON/
  );
});

test('staging verification rejects invalid Primary Skill and Mask Policy enums', async () => {
  for (const overrides of [
    { 'Primary Skill': 'Grammar' },
    { 'Mask Policy': 'MAYBE' }
  ]) {
    const sheets = {
      async getValues() {
        return completeBriefRows(overrides);
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
      /Primary Skill must be Speaking or Listening|Mask Policy must be ON or OFF/
    );
  }
});

test('staging verification accepts structured Review Focus entries', async () => {
  const sheets = {
    async getValues() {
      return completeBriefRows({
        'Review Focus': JSON.stringify([
          {
            'Review Item ID': 'RI-0012',
            'Review Item': 'Past-event reporting',
            'Weakness Detail': 'Maintain tense control while reporting completed work.'
          }
        ])
      });
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
