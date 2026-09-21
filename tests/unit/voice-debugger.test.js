import test from 'node:test';
import assert from 'node:assert/strict';
import { activateFocusedControlWithDebugger } from '../../background/voice-debugger.js';

test('always detaches debugger after trusted activation failure', async () => {
  let detachCount = 0;
  const chromeApi = {
    debugger: {
      async attach() {},
      async sendCommand() {
        throw new Error('dispatch failed');
      },
      async detach() {
        detachCount += 1;
      }
    }
  };

  await assert.rejects(
    activateFocusedControlWithDebugger(chromeApi, 9),
    /dispatch failed/
  );
  assert.equal(detachCount, 1);
});

test('trusted activation dispatches Enter key down/up and detaches', async () => {
  const calls = [];
  const chromeApi = {
    debugger: {
      async attach(target, version) {
        calls.push({ kind: 'attach', target, version });
      },
      async sendCommand(target, method, params) {
        calls.push({ kind: 'command', target, method, params });
      },
      async detach(target) {
        calls.push({ kind: 'detach', target });
      }
    }
  };

  assert.deepEqual(
    await activateFocusedControlWithDebugger(chromeApi, 9),
    { ok: true }
  );
  assert.deepEqual(
    calls.map((call) => call.kind),
    ['attach', 'command', 'command', 'detach']
  );
  assert.equal(calls[1].method, 'Input.dispatchKeyEvent');
  assert.equal(calls[1].params.type, 'keyDown');
  assert.equal(calls[2].params.type, 'keyUp');
});
