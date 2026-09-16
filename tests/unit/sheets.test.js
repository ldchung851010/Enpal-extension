import test from 'node:test';
import assert from 'node:assert/strict';
import { makeSheetsRepoWithFixture } from '../helpers/sheets-harness.js';

const SESSION_HEADERS = [
  'session_id','session_number','curriculum_sequence','lesson_id','unit_id',
  'lesson_type','title','chat_url','chat_title_expected','lifecycle_status',
  'pipeline_phase','started_at','paused_at','completed_at','review_targets_used',
  'main_ability_result','strong_targets','weak_targets','speaking_gaps',
  'listening_gaps','important_corrections','review_targets_next','learning_summary',
  'analysis_status','rename_status','rename_last_error'
];

function completeAnalyzeRow(overrides = {}) {
  return {
    session_id: 'S-001',
    main_ability_result: 'PASS',
    strong_targets: [],
    weak_targets: [],
    speaking_gaps: [],
    listening_gaps: [],
    important_corrections: [],
    review_targets_next: [],
    learning_summary: 'Summary',
    analysis_status: 'DONE',
    ...overrides
  };
}

function sessionTable(rowObject) {
  return [
    SESSION_HEADERS,
    SESSION_HEADERS.map(key => {
      const value = rowObject[key] ?? '';
      return Array.isArray(value) || (value && typeof value === 'object')
        ? JSON.stringify(value)
        : value;
    })
  ];
}

test('session stub retry updates the same session row', async () => {
  const repo = makeSheetsRepoWithFixture([
    SESSION_HEADERS,
    SESSION_HEADERS.map(key => ({
      session_id: 'S-001',
      lifecycle_status: 'STARTING'
    })[key] ?? '')
  ]);

  await repo.upsertSessionStub('sheet1', {
    session_id: 'S-001',
    lifecycle_status: 'STARTING'
  });

  assert.equal(repo.fixture.tabs.Sessions.length, 2);
});

test('extension patch refuses ChatGPT-owned analysis fields', async () => {
  const repo = makeSheetsRepoWithFixture([
    SESSION_HEADERS,
    SESSION_HEADERS.map(key => ({ session_id: 'S-001' })[key] ?? '')
  ]);

  await assert.rejects(
    () => repo.patchSessionExtensionFields('sheet1', 'S-001', { learning_summary: 'x' }),
    /writer ownership/
  );
});

test('extension cannot set Next Session READY', async () => {
  const repo = makeSheetsRepoWithFixture([], {
    nextSessionRows: [['key','value'], ['status','PREPARING']]
  });

  await assert.rejects(
    () => repo.setNextSessionExtensionFields('sheet1', { status: 'READY' }),
    /writer ownership/
  );
});

test('waitForAnalysisDone returns only a complete DONE commit', async () => {
  const repo = makeSheetsRepoWithFixture(sessionTable(completeAnalyzeRow()));
  const row = await repo.waitForAnalysisDone('sheet1', 'S-001', { timeoutMs: 1 });
  assert.equal(row.analysis_status, 'DONE');
  assert.deepEqual(row.strong_targets, []);
});

test('waitForAnalysisDone rejects corrupt DONE commit instead of advancing', async () => {
  const repo = makeSheetsRepoWithFixture(
    sessionTable(completeAnalyzeRow({ learning_summary: '' }))
  );

  await assert.rejects(
    () => repo.waitForAnalysisDone('sheet1', 'S-001', { timeoutMs: 1 }),
    /learning_summary/
  );
});

test('waitForNextSessionReady requires exact preallocated identity', async () => {
  const next = {
    session_id: 'S-002',
    session_number: 2,
    curriculum_sequence: 2,
    prepared_from_session_id: 'S-001',
    prepare_version: 'enpal-v1.0',
    lesson_id: 'lesson-002',
    unit_id: 'unit-001',
    lesson_type: 'SPEAKING',
    title: 'Explain Root Cause',
    main_ability: 'Explain the root cause',
    base_lesson_id: 'lesson-002',
    review_targets: [],
    learner_context: '{}',
    teaching_control: 'Teach naturally',
    completion_criteria: [],
    mask_policy: 'OFF',
    prepared_at: '2026-09-16T00:00:00Z',
    status: 'READY'
  };
  const rows = [['key','value'], ...Object.entries(next).map(([key, value]) => [
    key,
    Array.isArray(value) || (value && typeof value === 'object') ? JSON.stringify(value) : value
  ])];
  const repo = makeSheetsRepoWithFixture([], { nextSessionRows: rows });

  const ready = await repo.waitForNextSessionReady('sheet1', {
    session_id: 'S-002',
    session_number: 2,
    curriculum_sequence: 2,
    prepared_from_session_id: 'S-001'
  }, { timeoutMs: 1 });

  assert.equal(ready.status, 'READY');

  await assert.rejects(
    () => repo.waitForNextSessionReady('sheet1', {
      session_id: 'S-WRONG',
      session_number: 2,
      curriculum_sequence: 2,
      prepared_from_session_id: 'S-001'
    }, { timeoutMs: 1 }),
    /identity mismatch/
  );
});

test('advanceCurriculumPosition is monotonic and retrying same sequence is a no-op', async () => {
  const repo = makeSheetsRepoWithFixture([], {
    learnerRows: [
      ['key','value'],
      ['learner_id','default'],
      ['current_curriculum_position','7']
    ]
  });

  const first = await repo.advanceCurriculumPosition('sheet1', 9);
  const writesAfterAdvance = repo.fixture.writes.length;
  const retry = await repo.advanceCurriculumPosition('sheet1', 9);
  const backwards = await repo.advanceCurriculumPosition('sheet1', 8);

  assert.equal(first, 9);
  assert.equal(retry, 9);
  assert.equal(backwards, 9);
  assert.equal(repo.fixture.writes.length, writesAfterAdvance);
});

test('ensureDatabaseSchema preserves existing learner values while adding missing keys', async () => {
  const repo = makeSheetsRepoWithFixture([], {
    learnerRows: [
      ['key','value'],
      ['learner_id','my-learner'],
      ['strengths','existing strength']
    ],
    targetRows: [['target_id','target_type']],
    curriculumRows: [['sequence','lesson_id']],
    nextSessionRows: [['key','value'], ['status','CONSUMED']]
  });

  await repo.ensureDatabaseSchema('sheet1');
  const learner = await repo.getLearner('sheet1');
  const next = await repo.getNextSession('sheet1');

  assert.equal(learner.learner_id, 'my-learner');
  assert.equal(learner.strengths, 'existing strength');
  assert.equal(next.status, 'CONSUMED');
  assert.ok(repo.fixture.tabs.Sessions[0].includes('analysis_status'));
});

test('createDatabase creates exactly the five EnPal tabs', async () => {
  const repo = makeSheetsRepoWithFixture([]);
  const created = await repo.createDatabase();
  assert.equal(created.spreadsheetId, 'sheet1');
  assert.deepEqual(
    repo.fixture.creates[0].sheets.map(sheet => sheet.properties.title),
    ['Learner','Target Bank','Sessions','Curriculum','Next Session']
  );
});

test('ensureDatabaseSchema repairs a missing value header without overwriting existing keys', async () => {
  const repo = makeSheetsRepoWithFixture([], {
    learnerRows: [
      ['key'],
      ['learner_id','keep-me']
    ]
  });

  await repo.ensureDatabaseSchema('sheet1');

  assert.deepEqual(repo.fixture.tabs.Learner[0].slice(0, 2), ['key', 'value']);
  const learner = await repo.getLearner('sheet1');
  assert.equal(learner.learner_id, 'keep-me');
});
