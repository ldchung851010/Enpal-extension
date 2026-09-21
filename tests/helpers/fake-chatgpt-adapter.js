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


export function makeCrashRecoveryChatGptAdapter({
  events = [],
  projectUrl = 'https://chatgpt.com/g/g-p-enpal',
  boundUrl = '',
  pendingTabId = null,
  pendingUrl = null,
  onControl = () => {},
  metrics = {}
} = {}) {
  const calls = [];
  const tabUrls = new Map();
  const externalConversationUrls = new Set();
  let nextTabId = 200;

  metrics.createConversationCount ??= 0;
  metrics.voiceStartCount ??= 0;
  metrics.renameCount ??= 0;

  if (boundUrl) externalConversationUrls.add(boundUrl);
  if (Number.isInteger(pendingTabId) && pendingUrl) {
    tabUrls.set(pendingTabId, pendingUrl);
    externalConversationUrls.add(pendingUrl);
  }

  function record(name, args = []) {
    calls.push({ name, args });
    events.push('chatgpt.' + name);
  }

  return {
    calls,

    async openProject(url) {
      record('openProject', [url]);
      const tabId = nextTabId++;
      tabUrls.set(tabId, url);
      return tabId;
    },

    async createConversation(tabId) {
      record('createConversation', [tabId]);
      metrics.createConversationCount += 1;
      const url = projectUrl + '/c/recovery-' + metrics.createConversationCount;
      tabUrls.set(tabId, url);
      externalConversationUrls.add(url);
      return { ok: true, ready: true };
    },

    async openConversation(url) {
      record('openConversation', [url]);
      const tabId = nextTabId++;
      tabUrls.set(tabId, url);
      externalConversationUrls.add(url);
      return tabId;
    },

    async sendControl(tabId, text) {
      const type = text.match(/\ntype=([^\n]+)/)?.[1] ?? '';
      calls.push({ name: 'sendControl', args: [tabId, text], type });
      events.push('chatgpt.sendControl:' + type);
      onControl(type);
      return { ok: true, sent: true };
    },

    async waitUntilIdle(tabId) {
      record('waitUntilIdle', [tabId]);
      return { ok: true, idle: true };
    },

    async getConversationUrl(tabId) {
      record('getConversationUrl', [tabId]);
      return tabUrls.get(tabId) ?? projectUrl;
    },

    async startVoice(tabId) {
      record('startVoice', [tabId]);
      metrics.voiceStartCount += 1;
      return { ok: true, active: true, changed: true };
    },

    async stopVoice(tabId) {
      record('stopVoice', [tabId]);
      return { ok: true, active: false, changed: true };
    },

    async renameConversation(tabId, title) {
      record('renameConversation', [tabId, title]);
      metrics.renameCount += 1;
      return { ok: true };
    },

    async getRealtimeFeed(tabId) {
      record('getRealtimeFeed', [tabId]);
      return [];
    },

    async setListeningMask(tabId, armed) {
      record('setListeningMask', [tabId, armed]);
      return { ok: true, armed: armed === true };
    },

    orphanCount(currentBoundUrl = '') {
      return [...externalConversationUrls]
        .filter((url) => url !== currentBoundUrl)
        .length;
    }
  };
}
