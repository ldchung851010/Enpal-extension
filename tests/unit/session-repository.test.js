import test from 'node:test';
import assert from 'node:assert/strict';
import { createSessionRepository } from '../../storage/session-repository.js';

test('rejects more than one durable active session', async () => {
  const sheets = {
    async getValues() {
      return [
        ['session_id', 'status', 'chat_url'],
        ['S-001', 'PAUSED', 'https://chatgpt.com/c/1'],
        ['S-002', 'IN_PROGRESS', 'https://chatgpt.com/c/2']
      ];
    }
  };
  const repo = createSessionRepository({ sheets, spreadsheetId: 'db' });
  await assert.rejects(
    repo.listActive(),
    (error) => error.code === 'CONSISTENCY_ERROR'
  );
});

test('bindChat is idempotent for the same authoritative URL', async () => {
  let writes = 0;
  const sheets = {
    async getValues() {
      return [
        ['session_id', 'status', 'chat_url'],
        ['S-001', 'STARTING', 'https://chatgpt.com/c/1']
      ];
    },
    async updateValues() {
      writes += 1;
    }
  };
  const repo = createSessionRepository({ sheets, spreadsheetId: 'db' });
  const result = await repo.bindChat('S-001', 'https://chatgpt.com/c/1');
  assert.equal(result.chat_url, 'https://chatgpt.com/c/1');
  assert.equal(writes, 0);
});

test('bindChat rejects a conflicting second URL', async () => {
  const sheets = {
    async getValues() {
      return [
        ['session_id', 'status', 'chat_url'],
        ['S-001', 'STARTING', 'https://chatgpt.com/c/1']
      ];
    }
  };
  const repo = createSessionRepository({ sheets, spreadsheetId: 'db' });
  await assert.rejects(
    repo.bindChat('S-001', 'https://chatgpt.com/c/2'),
    /already bound/
  );
});

test('createStartingSession appends one STARTING row using existing headers', async () => {
  const calls = [];
  const sheets = {
    async getValues() {
      return [
        ['session_id', 'status', 'chat_url', 'lesson_id'],
        ['S-OLD', 'COMPLETED', 'https://chatgpt.com/c/old', 'L1']
      ];
    },
    async updateValues(spreadsheetId, range, values) {
      calls.push({ spreadsheetId, range, values });
    }
  };

  const repo = createSessionRepository({ sheets, spreadsheetId: 'db' });
  const created = await repo.createStartingSession({
    session_id: 'S-NEW',
    lesson_id: 'L2'
  });

  assert.equal(created.status, 'STARTING');
  assert.equal(created.chat_url, '');
  assert.deepEqual(calls, [{
    spreadsheetId: 'db',
    range: 'Sessions!A3:D3',
    values: [['S-NEW', 'STARTING', '', 'L2']]
  }]);
});

test('bindChat writes only the empty authoritative chat_url cell', async () => {
  const calls = [];
  const sheets = {
    async getValues() {
      return [
        ['session_id', 'status', 'chat_url'],
        ['S-001', 'STARTING', '']
      ];
    },
    async updateValues(spreadsheetId, range, values) {
      calls.push({ spreadsheetId, range, values });
    }
  };

  const repo = createSessionRepository({ sheets, spreadsheetId: 'db' });
  const result = await repo.bindChat('S-001', 'https://chatgpt.com/c/1');

  assert.equal(result.chat_url, 'https://chatgpt.com/c/1');
  assert.deepEqual(calls, [{
    spreadsheetId: 'db',
    range: 'Sessions!C2',
    values: [['https://chatgpt.com/c/1']]
  }]);
});

test('markState persists state and durable phase fields in one row update', async () => {
  const calls = [];
  const sheets = {
    async getValues() {
      return [
        ['session_id', 'status', 'chat_url', 'phase'],
        ['S-001', 'STARTING', 'https://chatgpt.com/c/1', 'SESSION_STUB_CREATED']
      ];
    },
    async updateValues(spreadsheetId, range, values) {
      calls.push({ spreadsheetId, range, values });
    }
  };

  const repo = createSessionRepository({ sheets, spreadsheetId: 'db' });
  const result = await repo.markState(
    'S-001',
    'IN_PROGRESS',
    { phase: 'CHAT_BOUND' }
  );

  assert.equal(result.status, 'IN_PROGRESS');
  assert.equal(result.phase, 'CHAT_BOUND');
  assert.deepEqual(calls[0].values, [[
    'S-001', 'IN_PROGRESS', 'https://chatgpt.com/c/1', 'CHAT_BOUND'
  ]]);
});

test('uses canonical lifecycle_status and pipeline_phase columns from the real Sessions schema', async () => {
  const calls = [];
  const sheets = {
    async getValues() {
      return [
        ['session_id', 'chat_url', 'lifecycle_status', 'pipeline_phase'],
        ['S-001', 'https://chatgpt.com/c/1', 'STARTING', 'SESSION_STUB_CREATED']
      ];
    },
    async updateValues(spreadsheetId, range, values) {
      calls.push({ spreadsheetId, range, values });
    }
  };

  const repo = createSessionRepository({ sheets, spreadsheetId: 'db' });
  const active = await repo.listActive();
  assert.equal(active[0].status, 'STARTING');
  assert.equal(active[0].phase, 'SESSION_STUB_CREATED');

  const updated = await repo.markState(
    'S-001',
    'IN_PROGRESS',
    { phase: 'CHAT_BOUND' }
  );

  assert.equal(updated.status, 'IN_PROGRESS');
  assert.equal(updated.phase, 'CHAT_BOUND');
  assert.deepEqual(calls[0].values, [[
    'S-001', 'https://chatgpt.com/c/1', 'IN_PROGRESS', 'CHAT_BOUND'
  ]]);
});
