import test from 'node:test';
import assert from 'node:assert/strict';
import { createSessionRepository } from '../../storage/session-repository.js';

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

test('one-active-session invariant is evaluated independently per workspace database', async () => {
  const data = {
    'database-A': [
      ['session_id', 'workspace_id', 'status', 'chat_url'],
      ['A-1', 'A', 'PAUSED', 'https://chatgpt.com/c/A-1']
    ],
    'database-B': [
      ['session_id', 'workspace_id', 'status', 'chat_url'],
      ['B-1', 'B', 'IN_PROGRESS', 'https://chatgpt.com/c/B-1']
    ]
  };

  const sheets = {
    async getValues(spreadsheetId) {
      return data[spreadsheetId];
    },
    async updateValues() {}
  };

  const A = createSessionRepository({
    sheets,
    workspace: makeWorkspace('A')
  });
  const B = createSessionRepository({
    sheets,
    workspace: makeWorkspace('B')
  });

  assert.equal((await A.listActive())[0].session_id, 'A-1');
  assert.equal((await B.listActive())[0].session_id, 'B-1');
});

test('two active sessions in one workspace produce consistency error without affecting another workspace', async () => {
  const data = {
    'database-A': [
      ['session_id', 'workspace_id', 'status', 'chat_url'],
      ['A-1', 'A', 'PAUSED', 'https://chatgpt.com/c/A-1'],
      ['A-2', 'A', 'IN_PROGRESS', 'https://chatgpt.com/c/A-2']
    ],
    'database-B': [
      ['session_id', 'workspace_id', 'status', 'chat_url'],
      ['B-1', 'B', 'PAUSED', 'https://chatgpt.com/c/B-1']
    ]
  };

  const sheets = {
    async getValues(spreadsheetId) {
      return data[spreadsheetId];
    },
    async updateValues() {}
  };

  const A = createSessionRepository({ sheets, workspace: makeWorkspace('A') });
  const B = createSessionRepository({ sheets, workspace: makeWorkspace('B') });

  await assert.rejects(
    A.listActive(),
    error => error?.code === 'CONSISTENCY_ERROR'
  );
  assert.equal((await B.listActive())[0].session_id, 'B-1');
});

test('foreign workspace_id inside a dedicated Sessions sheet fails closed', async () => {
  const sheets = {
    async getValues() {
      return [
        ['session_id', 'workspace_id', 'status'],
        ['B-1', 'B', 'PAUSED']
      ];
    },
    async updateValues() {}
  };

  const A = createSessionRepository({
    sheets,
    workspace: makeWorkspace('A')
  });

  await assert.rejects(
    A.listActive(),
    /foreign workspace_id/
  );
});

test('createStartingSession writes workspace_id when schema provides it', async () => {
  const calls = [];
  const sheets = {
    async getValues() {
      return [
        ['session_id', 'workspace_id', 'status', 'chat_url', 'lesson_id']
      ];
    },
    async updateValues(spreadsheetId, range, values) {
      calls.push({ spreadsheetId, range, values });
    }
  };

  const A = createSessionRepository({
    sheets,
    workspace: makeWorkspace('A')
  });

  const created = await A.createStartingSession({
    session_id: 'A-NEW',
    lesson_id: 'L1'
  });

  assert.equal(created.workspace_id, 'A');
  assert.equal(created.status, 'STARTING');
  assert.deepEqual(calls[0], {
    spreadsheetId: 'database-A',
    range: 'Sessions!A2:E2',
    values: [['A-NEW', 'A', 'STARTING', '', 'L1']]
  });
});

test('bindChat writes only selected workspace database', async () => {
  const calls = [];
  const sheets = {
    async getValues(spreadsheetId) {
      assert.equal(spreadsheetId, 'database-A');
      return [
        ['session_id', 'workspace_id', 'status', 'chat_url'],
        ['A-1', 'A', 'STARTING', '']
      ];
    },
    async updateValues(spreadsheetId, range, values) {
      calls.push({ spreadsheetId, range, values });
    }
  };

  const A = createSessionRepository({
    sheets,
    workspace: makeWorkspace('A')
  });

  await A.bindChat('A-1', 'https://chatgpt.com/c/A-1');
  assert.equal(calls[0].spreadsheetId, 'database-A');
  assert.equal(calls[0].range, 'Sessions!D2');
});

test('repository cannot be created from a legacy spreadsheetId alone', () => {
  assert.throws(
    () => createSessionRepository({
      sheets: {
        async getValues() { return []; },
        async updateValues() {}
      },
      spreadsheetId: 'legacy-db'
    }),
    /projectUrl|workspace/i
  );
});
