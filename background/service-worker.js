importScripts('../config/selectors.js', 'voice-controller.js');

const voiceController = globalThis.EnPalVoiceController.createVoiceController(chrome);

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel?.setPanelBehavior?.({ openPanelOnActionClick: true }).catch(() => {});
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== 'ENPAL_TRUSTED_ACTIVATE') return false;
  const selectorCandidates = message.selectorCandidates || globalThis.ENPAL_SELECTORS.voiceControl;
  Promise.resolve(voiceController.activateVoiceControl(message.tabId, selectorCandidates))
    .then(() => sendResponse({ ok: true }))
    .catch(error => sendResponse({ ok: false, error: error?.message || String(error) }));
  return true;
});
