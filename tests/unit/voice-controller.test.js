import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadClassicScript } from '../helpers/load-classic-script.js';
import { fakeDebuggerChrome } from '../helpers/chatgpt-harness.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function loadController(chromeApi) {
  const context = loadClassicScript(path.join(ROOT, 'background/voice-controller.js'), { chrome: chromeApi });
  return context.EnPalVoiceController.createVoiceController(chromeApi);
}

test('trusted activation always detaches debugger', async () => {
  const calls = [];
  const chromeApi = fakeDebuggerChrome(calls);
  const controller = loadController(chromeApi);
  await controller.activateVoiceControl(7, ['button[data-testid="voice"]']);
  assert.deepEqual(calls.map(x => x.name), [
    'attach','DOM.getDocument','DOM.querySelector','DOM.focus',
    'Input.dispatchKeyEvent','Input.dispatchKeyEvent','detach'
  ]);
  assert.equal(calls.some(call => /Mouse/.test(call.name)), false);
});

test('trusted activation detaches debugger when key dispatch fails', async () => {
  const calls = [];
  const chromeApi = fakeDebuggerChrome(calls, { throwOn: 'Input.dispatchKeyEvent' });
  const controller = loadController(chromeApi);
  await assert.rejects(
    () => controller.activateVoiceControl(7, ['button[data-testid="voice"]']),
    /forced debugger failure/
  );
  assert.equal(calls.at(-1).name, 'detach');
});

test('trusted activation tries semantic selector candidates in order', async () => {
  const calls = [];
  const chromeApi = fakeDebuggerChrome(calls, { missingSelectors: ['button.first'] });
  const controller = loadController(chromeApi);
  await controller.activateVoiceControl(7, ['button.first', 'button.second']);
  const queries = calls.filter(call => call.name === 'DOM.querySelector');
  assert.deepEqual(queries.map(call => call.params.selector), ['button.first','button.second']);
});
