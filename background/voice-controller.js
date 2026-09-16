(() => {
  function createVoiceController(chromeApi = chrome) {
    async function activateVoiceControl(tabId, selectorCandidates) {
      const target = { tabId };
      let attached = false;
      try {
        await chromeApi.debugger.attach(target, '1.3');
        attached = true;
        const documentResult = await chromeApi.debugger.sendCommand(target, 'DOM.getDocument', {});
        const rootNodeId = documentResult?.root?.nodeId;
        if (!rootNodeId) throw new Error('Voice control: DOM root unavailable');

        let nodeId = 0;
        for (const selector of selectorCandidates || []) {
          const result = await chromeApi.debugger.sendCommand(target, 'DOM.querySelector', {
            nodeId: rootNodeId,
            selector
          });
          if (result?.nodeId) {
            nodeId = result.nodeId;
            break;
          }
        }
        if (!nodeId) throw new Error('Voice control: semantic selector missing');

        await chromeApi.debugger.sendCommand(target, 'DOM.focus', { nodeId });
        const key = {
          key: 'Enter',
          code: 'Enter',
          windowsVirtualKeyCode: 13,
          nativeVirtualKeyCode: 13
        };
        await chromeApi.debugger.sendCommand(target, 'Input.dispatchKeyEvent', {
          type: 'keyDown',
          ...key
        });
        await chromeApi.debugger.sendCommand(target, 'Input.dispatchKeyEvent', {
          type: 'keyUp',
          ...key
        });
        return { ok: true };
      } finally {
        if (attached) await chromeApi.debugger.detach(target);
      }
    }

    return { activateVoiceControl };
  }

  globalThis.EnPalVoiceController = Object.freeze({ createVoiceController });
})();
