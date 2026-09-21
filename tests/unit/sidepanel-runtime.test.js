import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RUNTIME_CONFIG,
  PLATFORM_GATE_KEY,
  createRuntimeWorkflow
} from '../../sidepanel/runtime.js';

test('runtime composition is pinned to the approved exact-source registry', () => {
  assert.deepEqual(RUNTIME_CONFIG, {
    projectUrl: 'https://chatgpt.com/g/g-p-6aa9f3ea98a481918727756027f94208-test',
    curriculumSpreadsheetId: '19Q6x9dOJVY-yRxuInThBj1gODQWAmyV1-EbeOh-2JLU',
    databaseSpreadsheetId: '13zDzNQSgxicIUBm8oE0CVAXzheTJ45KeeRrsaT3pJv4',
    sessionBriefSpreadsheetId: '1MsD-v6olhkecgBxFzWZg61f1WPo42u7hFhNQRgYk-QU',
    reviewLedgerSpreadsheetId: '1sQRdyjVvmQCOXPx6w-HHwGP1xeP8mjy5n2aHojJjzDs',
    teacherRoleUrl: 'https://drive.google.com/file/d/10NgizUp3AnnUSAZBqLexzu46sYqRqEO6/view',
    speakingMethodUrl: 'https://drive.google.com/file/d/1TeCJGwJmPlOSKZDHffid0iPreeSdxXWN/view',
    listeningMethodUrl: 'https://drive.google.com/file/d/1rYg8dYxlJNwAltjPn9dg8xz3_bkTTSZL/view'
  });
  assert.equal(PLATFORM_GATE_KEY, 'enpalPlatformGate');
});

test('real side-panel runtime requests explicit Project verification while platform marker is absent', async () => {
  const storage = {};
  const chromeApi = {
    identity: {
      async getAuthToken({ interactive }) {
        assert.equal(interactive, true);
        return { token: 'oauth-token' };
      }
    },
    storage: {
      local: {
        async get(key) {
          if (typeof key === 'string') return { [key]: storage[key] };
          return {};
        },
        async set(patch) {
          Object.assign(storage, patch);
        },
        async remove(key) {
          delete storage[key];
        }
      }
    },
    tabs: {
      async create() {
        throw new Error('ChatGPT must not open while setup is blocked');
      },
      async sendMessage() {
        throw new Error('ChatGPT must not receive messages while setup is blocked');
      }
    },
    runtime: {
      async sendMessage() {
        throw new Error('trusted activation must not run while setup is blocked');
      }
    }
  };

  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, method: options.method ?? 'GET', body: options.body ?? null });
    if ((options.method ?? 'GET') === 'PUT') {
      return {
        ok: true,
        json: async () => ({ updatedCells: 1 })
      };
    }
    return {
      ok: true,
      json: async () => ({ values: [['header']] })
    };
  };

  const workflow = createRuntimeWorkflow({ chromeApi, fetchImpl });
  const result = await workflow.recover({ interactiveSetup: true });

  assert.equal(result.state, 'PLATFORM_VERIFICATION_REQUIRED');
  assert.match(result.reason, /project access/i);
  assert.equal(calls.filter((call) => call.method === 'GET').length, 4);
  assert.equal(calls.filter((call) => call.method === 'PUT').length, 1);
});


test('runtime persists manual live Project confirmation only when explicitly confirmed', async () => {
  const storage = {};
  const chromeApi = {
    identity: {
      async getAuthToken() {
        return { token: 'oauth-token' };
      }
    },
    storage: {
      local: {
        async get(key) {
          if (typeof key === 'string') return { [key]: storage[key] };
          return {};
        },
        async set(patch) {
          Object.assign(storage, patch);
        },
        async remove(key) {
          delete storage[key];
        }
      }
    },
    tabs: {
      async create() {
        throw new Error('ChatGPT must not open during setup confirmation');
      },
      async sendMessage() {
        throw new Error('ChatGPT must not receive messages during setup confirmation');
      }
    },
    runtime: {
      async sendMessage() {
        throw new Error('trusted activation must not run during setup confirmation');
      }
    }
  };

  const activeBriefRows = [
    ['key', 'value'],
    ['ready_marker', 'READY'],
    ['curriculum_version', 'v1-smoke'],
    ['curriculum_sequence', '1'],
    ['lesson_id', 'smoke-speaking-001'],
    ['Primary Skill', 'Speaking'],
    ['Communicative Goal', 'Handle a short workplace exchange.']
  ];

  const fetchImpl = async (url, options = {}) => {
    const decoded = decodeURIComponent(url);
    if ((options.method ?? 'GET') === 'PUT') {
      return {
        ok: true,
        json: async () => ({ updatedCells: 1 })
      };
    }
    if (decoded.includes('ACTIVE!A:B')) {
      return {
        ok: true,
        json: async () => ({ values: activeBriefRows })
      };
    }
    return {
      ok: true,
      json: async () => ({ values: [['header']] })
    };
  };

  const workflow = createRuntimeWorkflow({ chromeApi, fetchImpl });

  const blocked = await workflow.recover({ interactiveSetup: true });
  assert.equal(blocked.state, 'PLATFORM_VERIFICATION_REQUIRED');
  assert.equal(storage[PLATFORM_GATE_KEY], undefined);

  const ready = await workflow.confirmPlatformGate();

  assert.equal(ready.state, 'READY');
  assert.equal(storage[PLATFORM_GATE_KEY].status, 'PASS');
  assert.equal(storage[PLATFORM_GATE_KEY].source, 'manual-live-confirmation');
  assert.match(storage[PLATFORM_GATE_KEY].verifiedAt, /^\d{4}-\d{2}-\d{2}T/);
});


test('Project verification marker is invalidated when canonical runtime config changes', async () => {
  const storage = {};
  const chromeApi = {
    identity: {
      async getAuthToken() {
        return { token: 'oauth-token' };
      }
    },
    storage: {
      local: {
        async get(key) {
          if (typeof key === 'string') return { [key]: storage[key] };
          return {};
        },
        async set(patch) {
          Object.assign(storage, patch);
        },
        async remove(key) {
          delete storage[key];
        }
      }
    },
    tabs: {
      async create() {
        throw new Error('ChatGPT must not open during setup verification');
      },
      async sendMessage() {
        throw new Error('ChatGPT must not receive messages during setup verification');
      }
    },
    runtime: {
      async sendMessage() {
        throw new Error('trusted activation must not run during setup verification');
      }
    }
  };

  const activeBriefRows = [
    ['key', 'value'],
    ['ready_marker', 'READY'],
    ['curriculum_version', 'v1-smoke'],
    ['curriculum_sequence', '1'],
    ['lesson_id', 'smoke-speaking-001'],
    ['Primary Skill', 'Speaking'],
    ['Communicative Goal', 'Handle a short workplace exchange.']
  ];

  const fetchImpl = async (url, options = {}) => {
    const decoded = decodeURIComponent(url);
    if ((options.method ?? 'GET') === 'PUT') {
      return {
        ok: true,
        json: async () => ({ updatedCells: 1 })
      };
    }
    if (decoded.includes('ACTIVE!A:B')) {
      return {
        ok: true,
        json: async () => ({ values: activeBriefRows })
      };
    }
    return {
      ok: true,
      json: async () => ({ values: [['header']] })
    };
  };

  const original = createRuntimeWorkflow({ chromeApi, fetchImpl });
  await original.recover({ interactiveSetup: true });
  const ready = await original.confirmPlatformGate();
  assert.equal(ready.state, 'READY');

  const changedConfig = {
    ...RUNTIME_CONFIG,
    projectUrl: 'https://chatgpt.com/g/g-p-different-project'
  };
  const changed = createRuntimeWorkflow({
    chromeApi,
    fetchImpl,
    config: changedConfig
  });

  const result = await changed.recover({ interactiveSetup: true });
  assert.equal(result.state, 'PLATFORM_VERIFICATION_REQUIRED');
});


test('platform verification is isolated per workspace even when both use the same Chrome profile', async () => {
  const storage = {};
  const chromeApi = {
    identity: {
      async getAuthToken() {
        return { token: 'oauth-token' };
      }
    },
    storage: {
      local: {
        async get(key) {
          if (key == null) return { ...storage };
          if (typeof key === 'string') return { [key]: storage[key] };
          if (Array.isArray(key)) {
            return Object.fromEntries(key.map(name => [name, storage[name]]));
          }
          return { ...storage };
        },
        async set(patch) {
          Object.assign(storage, patch);
        },
        async remove(key) {
          for (const name of Array.isArray(key) ? key : [key]) delete storage[name];
        }
      }
    },
    tabs: {
      async create() {
        throw new Error('ChatGPT must not open during setup verification');
      },
      async sendMessage() {
        throw new Error('ChatGPT must not receive messages during setup verification');
      }
    },
    runtime: {
      async sendMessage() {
        throw new Error('trusted activation must not run during setup verification');
      }
    }
  };

  const activeBriefRows = [
    ['key', 'value'],
    ['schema_version', '1.0'],
    ['curriculum_version', 'v1'],
    ['curriculum_sequence', '1'],
    ['lesson_id', 'L001'],
    ['ready_marker', 'READY'],
    ['Primary Skill', 'Speaking'],
    ['Communicative Goal', 'Give a short update.'],
    ['Focus', '["State status"]'],
    ['Review Focus', '[]'],
    ['Situation', 'Team check-in'],
    ['Target Performance', 'Give a short update.'],
    ['Completion Criteria', '["Status is clear"]'],
    ['Mask Policy', 'OFF']
  ];

  const fetchImpl = async (url, options = {}) => {
    const decoded = decodeURIComponent(url);
    if ((options.method ?? 'GET') === 'PUT') {
      return { ok: true, json: async () => ({ updatedCells: 1 }) };
    }
    if (decoded.includes('ACTIVE!A:B')) {
      return { ok: true, json: async () => ({ values: activeBriefRows }) };
    }
    return { ok: true, json: async () => ({ values: [['header']] }) };
  };

  const workspaceA = {
    id: 'A',
    name: 'A',
    ...RUNTIME_CONFIG,
    projectUrl: 'https://chatgpt.com/g/g-p-A',
    sessionBriefActiveSheetId: 11,
    sessionBriefStagingSheetId: 12
  };
  const workspaceB = {
    id: 'B',
    name: 'B',
    ...RUNTIME_CONFIG,
    projectUrl: 'https://chatgpt.com/g/g-p-B',
    databaseSpreadsheetId: 'database-B',
    sessionBriefActiveSheetId: 21,
    sessionBriefStagingSheetId: 22
  };

  const flowA = createRuntimeWorkflow({ chromeApi, fetchImpl, workspace: workspaceA });
  const blockedA = await flowA.recover({ interactiveSetup: true });
  assert.equal(blockedA.state, 'PLATFORM_VERIFICATION_REQUIRED');
  assert.equal((await flowA.confirmPlatformGate()).state, 'READY');

  const flowB = createRuntimeWorkflow({ chromeApi, fetchImpl, workspace: workspaceB });
  const blockedB = await flowB.recover({ interactiveSetup: true });
  assert.equal(blockedB.state, 'PLATFORM_VERIFICATION_REQUIRED');

  assert.ok(storage['enpalWorkspace:A:platformGate']);
  assert.equal(storage['enpalWorkspace:B:platformGate'], undefined);
});
