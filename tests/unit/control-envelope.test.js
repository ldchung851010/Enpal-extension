import test from 'node:test';
import assert from 'node:assert/strict';
import { makeControl, isEnpalControl } from '../../core/control-envelope.js';

test('creates a deterministic ENPAL_CONTROL envelope', () => {
  const text = makeControl({
    type: 'PAUSE',
    sessionId: 'S-001',
    body: 'Create and persist the Pause Checkpoint.'
  });

  assert.match(text, /^ENPAL_CONTROL\n/);
  assert.match(text, /type=PAUSE/);
  assert.match(text, /session_id=S-001/);
  assert.equal(isEnpalControl(text), true);
});
