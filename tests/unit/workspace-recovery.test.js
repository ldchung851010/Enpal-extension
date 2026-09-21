import test from 'node:test';
import assert from 'node:assert/strict';
import { decideRecovery } from '../../core/recovery.js';

test('PAUSED session in Workspace A does not affect recovery decision for Workspace B', () => {
  const A = decideRecovery({
    journal: { workspaceId: 'A', sessionId: 'A-1' },
    activeSessions: [{ session_id: 'A-1', status: 'PAUSED' }],
    activeBrief: { ready: true, lesson_id: 'LA' }
  });

  const B = decideRecovery({
    journal: { workspaceId: 'B' },
    activeSessions: [],
    activeBrief: { ready: true, lesson_id: 'LB' }
  });

  assert.equal(A.action, 'RESUME_PAUSED');
  assert.equal(A.session.session_id, 'A-1');
  assert.deepEqual(B, { action: 'READY' });
});

test('consistency error is scoped to the workspace state supplied to recovery', () => {
  const A = decideRecovery({
    activeSessions: [
      { session_id: 'A-1', status: 'PAUSED' },
      { session_id: 'A-2', status: 'STARTING' }
    ],
    activeBrief: { ready: true }
  });

  const B = decideRecovery({
    activeSessions: [{ session_id: 'B-1', status: 'PAUSED' }],
    activeBrief: { ready: true }
  });

  assert.deepEqual(A, { action: 'CONSISTENCY_ERROR' });
  assert.equal(B.action, 'RESUME_PAUSED');
  assert.equal(B.session.session_id, 'B-1');
});
