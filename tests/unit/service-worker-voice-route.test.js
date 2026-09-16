import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadClassicScript } from '../helpers/load-classic-script.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('service worker routes trusted activation without storing workflow state', async () => {
  const listeners = [];
  const activations = [];
  const chrome = {
    runtime: {
      onInstalled: { addListener() {} },
      onMessage: { addListener(listener) { listeners.push(listener); } }
    },
    sidePanel: { setPanelBehavior: async () => {} }
  };
  const globals = {
    chrome,
    importScripts() {},
    ENPAL_SELECTORS: { voiceControl: ['button.voice'] },
    EnPalVoiceController: {
      createVoiceController() {
        return {
          async activateVoiceControl(tabId, selectors) { activations.push({ tabId, selectors }); }
        };
      }
    }
  };
  loadClassicScript(path.join(ROOT, 'background/service-worker.js'), globals);
  assert.equal(listeners.length, 1);

  let response;
  const keepAlive = listeners[0]({ type:'ENPAL_TRUSTED_ACTIVATE', tabId:7 }, {}, value => { response = value; });
  assert.equal(keepAlive, true);
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.deepEqual(activations, [{ tabId:7, selectors:['button.voice'] }]);
  assert.equal(response?.ok, true);
});
