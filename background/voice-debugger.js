export async function activateFocusedControlWithDebugger(chromeApi, tabId) {
  const target = { tabId };
  await chromeApi.debugger.attach(target, '1.3');
  try {
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
    return { ok: true };
  } finally {
    await chromeApi.debugger.detach(target).catch(() => {});
  }
}
