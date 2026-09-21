import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RUNTIME_CONFIG,
  PLATFORM_GATE_KEY,
  createRuntimeWorkflow
} from '../../sidepanel/runtime.js';

const TEST_PROJECT_URL = 'https://chatgpt.com/g/g-p-test-project';

function configWithProject(projectUrl = TEST_PROJECT_URL) {
  return { ...RUNTIME_CONFIG, projectUrl };
}

test('runtime composition keeps canonical data sources pinned but Project URL user-configurable', () => {
  assert.deepEqual(RUNTIME_CONFIG, {
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

  const workflow = createRuntimeWorkflow({
    chromeApi,
    fetchImpl,
    config: configWithProject()
  });
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

  const workflow = createRuntimeWorkflow({
    chromeApi,
    fetchImpl,
    config: configWithProject()
  });

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

  const original = createRuntimeWorkflow({
    chromeApi,
    fetchImpl,
    config: configWithProject()
  });
  await original.recover({ interactiveSetup: true });
  const ready = await original.confirmPlatformGate();
  assert.equal(ready.state, 'READY');

  const changedConfig = configWithProject(
    'https://chatgpt.com/g/g-p-different-project'
  );
  const changed = createRuntimeWorkflow({
    chromeApi,
    fetchImpl,
    config: changedConfig
  });

  const result = await changed.recover({ interactiveSetup: true });
  assert.equal(result.state, 'PLATFORM_VERIFICATION_REQUIRED');
});
