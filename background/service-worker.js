import { activateFocusedControlWithDebugger, typeAndSubmitWithDebugger } from './voice-debugger.js';

export function registerServiceWorker(chromeApi = chrome) {
  chromeApi.runtime.onInstalled.addListener(() => {
    try {
      Promise.resolve(
        chromeApi.sidePanel?.setPanelBehavior?.({ openPanelOnActionClick: true })
      ).catch(() => {});
    } catch {
      // Side-panel configuration is best effort during installation.
    }
  });

  chromeApi.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!['ENPAL_TRUSTED_ACTIVATE', 'ENPAL_TRUSTED_SEND'].includes(message?.type)) {
      return false;
    }
    if (!Number.isInteger(message.tabId)) {
      sendResponse({ ok: false, error: 'Trusted ChatGPT input requires tabId' });
      return false;
    }
    if (message.type === 'ENPAL_TRUSTED_SEND' && typeof message.text !== 'string') {
      sendResponse({ ok: false, error: 'Trusted ChatGPT send requires text' });
      return false;
    }

    const action = message.type === 'ENPAL_TRUSTED_SEND'
      ? typeAndSubmitWithDebugger(chromeApi, message.tabId, message.text)
      : activateFocusedControlWithDebugger(chromeApi, message.tabId);

    Promise.resolve(action)
      .then(result => sendResponse(result ?? { ok: true }))
      .catch(error => sendResponse({
        ok: false,
        error: error?.message || String(error)
      }));

    return true;
  });
}

if (typeof chrome !== 'undefined') {
  registerServiceWorker(chrome);
}
