import test from 'node:test';
import assert from 'node:assert/strict';
import { decideRecovery } from '../../core/recovery.js';
import { makeRecoveryInput } from '../helpers/fake-repositories.js';

test('two active sessions produce CONSISTENCY_ERROR', () => {
  const input = makeRecoveryInput({
    activeSessions: [
      { session_id: 'S-001', status: 'PAUSED' },
      { session_id: 'S-002', status: 'STARTING' }
    ],
    activeBrief: { ready: true, lesson_id: 'L3' }
  });

  assert.deepEqual(decideRecovery(input), {
    action: 'CONSISTENCY_ERROR'
  });
});

test('STARTING without chat_url produces RECOVER_STARTING with journal intent', () => {
  const journal = { pendingTabId: 77, sessionId: 'S-001' };
  const session = {
    session_id: 'S-001',
    status: 'STARTING',
    phase: 'SESSION_STUB_CREATED',
    chat_url: ''
  };

  assert.deepEqual(
    decideRecovery(makeRecoveryInput({
      journal,
      activeSessions: [session],
      activeBrief: { ready: true, lesson_id: 'L1' }
    })),
    {
      action: 'RECOVER_STARTING',
      session,
      journal
    }
  );
});

test('STARTING with a bound chat still recovers the incomplete START transition', () => {
  const journal = { sessionId: 'S-001' };
  const session = {
    session_id: 'S-001',
    status: 'STARTING',
    phase: 'CHAT_BOUND',
    chat_url: 'https://chatgpt.com/g/g-p-enpal/c/abc'
  };

  assert.deepEqual(
    decideRecovery(makeRecoveryInput({
      journal,
      activeSessions: [session]
    })),
    {
      action: 'RECOVER_STARTING',
      session,
      journal
    }
  );
});

test('PAUSED produces RESUME_PAUSED before a future ACTIVE brief', () => {
  const session = {
    session_id: 'S-001',
    status: 'PAUSED',
    lesson_id: 'L1',
    curriculum_sequence: 1
  };

  assert.deepEqual(
    decideRecovery(makeRecoveryInput({
      activeSessions: [session],
      activeBrief: {
        ready: true,
        lesson_id: 'L2',
        curriculum_sequence: 2
      }
    })),
    {
      action: 'RESUME_PAUSED',
      session
    }
  );
});

test('PROCESSING produces RESUME_PROCESSING', () => {
  const session = {
    session_id: 'S-001',
    status: 'PROCESSING',
    phase: 'ANALYZE_COMMITTED'
  };

  assert.deepEqual(
    decideRecovery(makeRecoveryInput({
      activeSessions: [session],
      activeBrief: { ready: true, lesson_id: 'L2' }
    })),
    {
      action: 'RESUME_PROCESSING',
      session
    }
  );
});

test('no active session and valid ACTIVE brief produces READY', () => {
  assert.deepEqual(
    decideRecovery(makeRecoveryInput({
      activeSessions: [],
      activeBrief: { ready: true, lesson_id: 'L1' }
    })),
    {
      action: 'READY'
    }
  );
});

test('no active session and no READY brief produces SETUP_REQUIRED', () => {
  assert.deepEqual(
    decideRecovery(makeRecoveryInput({
      activeSessions: [],
      activeBrief: { ready: false, lesson_id: 'L1' }
    })),
    {
      action: 'SETUP_REQUIRED'
    }
  );
});

test('an IN_PROGRESS session is preserved instead of inventing a new session', () => {
  const session = {
    session_id: 'S-001',
    status: 'IN_PROGRESS',
    chat_url: 'https://chatgpt.com/g/g-p-enpal/c/abc'
  };

  assert.deepEqual(
    decideRecovery(makeRecoveryInput({
      activeSessions: [session],
      activeBrief: { ready: true, lesson_id: 'L1' }
    })),
    {
      action: 'READY',
      session
    }
  );
});
