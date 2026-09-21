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

test('real side-panel runtime remains SETUP_REQUIRED while live platform gate marker is absent', async () => {
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

  assert.equal(result.state, 'SETUP_REQUIRED');
  assert.match(result.reason, /platform gate/i);
  assert.equal(calls.filter((call) => call.method === 'GET').length, 4);
  assert.equal(calls.filter((call) => call.method === 'PUT').length, 1);
});
