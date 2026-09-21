import { activateFocusedControlWithDebugger } from './voice-debugger.js';

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel?.setPanelBehavior?.({ openPanelOnActionClick: true }).catch(() => {});
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== 'ENPAL_TRUSTED_ACTIVATE') return false;
  if (!Number.isInteger(message.tabId)) {
    sendResponse({ ok: false, error: 'Trusted Voice activation requires tabId' });
    return false;
  }

  Promise.resolve(activateFocusedControlWithDebugger(chrome, message.tabId))
    .then(() => sendResponse({ ok: true }))
    .catch(error => sendResponse({ ok: false, error: error?.message || String(error) }));
  return true;
});
