async function withDebugger(chromeApi, tabId, action) {
  const target = { tabId };
  await chromeApi.debugger.attach(target, '1.3');
  try {
    return await action(target);
  } finally {
    await chromeApi.debugger.detach(target).catch(() => {});
  }
}

async function pressEnter(chromeApi, target) {
  await chromeApi.debugger.sendCommand(target, 'Input.dispatchKeyEvent', {
    type: 'keyDown',
    key: 'Enter',
    code: 'Enter',
    windowsVirtualKeyCode: 13
  });
  await chromeApi.debugger.sendCommand(target, 'Input.dispatchKeyEvent', {
    type: 'keyUp',
    key: 'Enter',
    code: 'Enter',
    windowsVirtualKeyCode: 13
  });
}

export async function activateFocusedControlWithDebugger(chromeApi, tabId) {
  return withDebugger(chromeApi, tabId, async (target) => {
    await pressEnter(chromeApi, target);
    return { ok: true };
  });
}

export async function insertTextWithDebugger(chromeApi, tabId, text) {
  return withDebugger(chromeApi, tabId, async (target) => {
    await chromeApi.debugger.sendCommand(target, 'Input.insertText', {
      text: String(text ?? '')
    });
    return { ok: true, inserted: true };
  });
}
