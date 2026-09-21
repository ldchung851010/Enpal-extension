import { activateFocusedControlWithDebugger } from './voice-debugger.js';

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
    if (message?.type !== 'ENPAL_TRUSTED_ACTIVATE') return false;
    if (!Number.isInteger(message.tabId)) {
      sendResponse({ ok: false, error: 'Trusted Voice activation requires tabId' });
      return false;
    }

    Promise.resolve(
      activateFocusedControlWithDebugger(chromeApi, message.tabId)
    )
      .then(() => sendResponse({ ok: true }))
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
