export function makeFakeChatGptAdapter(overrides = {}, { events } = {}) {
  const calls = [];
  const defaults = {
    openProject: 101,
    createConversation: { ok: true, ready: true },
    openConversation: 102,
    sendControl: { ok: true, sent: true },
    waitUntilIdle: { ok: true, idle: true },
    getConversationUrl: 'https://chatgpt.com/g/g-p-enpal/c/fake',
    startVoice: { ok: true, active: true, changed: true },
    stopVoice: { ok: true, active: false, changed: true },
    renameConversation: { ok: true },
    getRealtimeFeed: [],
    setListeningMask: { ok: true, armed: true }
  };

  function method(name) {
    return async (...args) => {
      calls.push({ name, args });
      events?.push('chatgpt.' + name);
      const value = Object.hasOwn(overrides, name) ? overrides[name] : defaults[name];
      if (typeof value === 'function') return value(...args);
      if (value instanceof Error) throw value;
      return value;
    };
  }

  return {
    calls,
    openProject: method('openProject'),
    createConversation: method('createConversation'),
    openConversation: method('openConversation'),
    sendControl: method('sendControl'),
    waitUntilIdle: method('waitUntilIdle'),
    getConversationUrl: method('getConversationUrl'),
    startVoice: method('startVoice'),
    stopVoice: method('stopVoice'),
    renameConversation: method('renameConversation'),
    getRealtimeFeed: method('getRealtimeFeed'),
    setListeningMask: method('setListeningMask')
  };
}
