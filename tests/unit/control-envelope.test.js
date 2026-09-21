import test from 'node:test';
import assert from 'node:assert/strict';
import { makeControl, isEnpalControl } from '../../core/control-envelope.js';

test('creates a deterministic workspace-bound ENPAL_CONTROL envelope', () => {
  const text = makeControl({
    type: 'PAUSE',
    sessionId: 'S-001',
    workspaceId: 'english-engineering',
    body: 'Create and persist the Pause Checkpoint.'
  });

  assert.match(text, /^ENPAL_CONTROL\n/);
  assert.match(text, /type=PAUSE/);
  assert.match(text, /session_id=S-001/);
  assert.match(text, /workspace_id=english-engineering/);
  assert.equal(isEnpalControl(text), true);
});

test('rejects multiline machine identity fields', () => {
  assert.throws(
    () => makeControl({
      type: 'START\nrole=bad',
      sessionId: 'S-001',
      workspaceId: 'A',
      body: 'x'
    }),
    /single-line/
  );
});
