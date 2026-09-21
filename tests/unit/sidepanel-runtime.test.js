import test from 'node:test';
import assert from 'node:assert/strict';
import { createRuntimeWorkflow } from '../../sidepanel/runtime.js';
import { workspaceStorageKey } from '../../storage/local-journal.js';

function workspace(id) {
  return {
    id,
    name: 'Workspace ' + id,
    projectUrl: 'https://chatgpt.com/g/g-p-' + id,
    curriculumSpreadsheetId: 'curriculum-' + id,
    databaseSpreadsheetId: 'database-' + id,
    sessionBriefSpreadsheetId: 'brief-' + id,
    reviewLedgerSpreadsheetId: 'review-' + id,
    teacherRoleUrl: 'https://drive.google.com/file/d/teacher/view',
    speakingMethodUrl: 'https://drive.google.com/file/d/speaking/view',
    listeningMethodUrl: 'https://drive.google.com/file/d/listening/view',
    sessionBriefActiveSheetId: 101,
    sessionBriefStagingSheetId: 202
  };
}

function harness() {
  const storage = {};
  const calls = [];
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
        throw new Error('ChatGPT must not open during setup-only tests');
      },
      async sendMessage() {
        throw new Error('ChatGPT must not receive messages during setup-only tests');
      }
    },
    runtime: {
      async sendMessage() {
        throw new Error('trusted input must not run during setup-only tests');
      }
    }
  };

  const activeBriefRows = [
    ['key', 'value'],
    ['ready_marker', 'READY'],
    ['curriculum_version', 'v1'],
    ['curriculum_sequence', '1'],
    ['lesson_id', 'L001'],
    ['Primary Skill', 'Speaking'],
    ['Communicative Goal', 'Give a short update.']
  ];

  const fetchImpl = async (url, options = {}) => {
    calls.push({ url: decodeURIComponent(url), method: options.method ?? 'GET' });
    if ((options.method ?? 'GET') === 'PUT') {
      return { ok: true, json: async () => ({ updatedCells: 1 }) };
    }
    if (decodeURIComponent(url).includes('ACTIVE!A:B')) {
      return { ok: true, json: async () => ({ values: activeBriefRows }) };
    }
    return { ok: true, json: async () => ({ values: [['header']] }) };
  };

  return { storage, calls, chromeApi, fetchImpl };
}

test('runtime refuses to exist without an explicit Workspace', () => {
  assert.throws(
    () => createRuntimeWorkflow({ chromeApi: {}, fetchImpl: async () => ({}) }),
    /Workspace is required/
  );
});

test('setup probes only the selected Workspace Sheets', async () => {
  const h = harness();
  const A = workspace('A');
  const workflow = createRuntimeWorkflow({
    chromeApi: h.chromeApi,
    fetchImpl: h.fetchImpl,
    workspace: A
  });

  const result = await workflow.recover({ interactiveSetup: true });
  assert.equal(result.state, 'PLATFORM_VERIFICATION_REQUIRED');

  const urls = h.calls.map(call => call.url).join('\n');
  assert.match(urls, /curriculum-A/);
  assert.match(urls, /database-A/);
  assert.match(urls, /brief-A/);
  assert.match(urls, /review-A/);
  assert.doesNotMatch(urls, /curriculum-B|database-B|brief-B|review-B/);
});

test('platform confirmation is namespaced by workspace_id', async () => {
  const h = harness();
  const A = workspace('A');
  const B = workspace('B');

  const flowA = createRuntimeWorkflow({
    chromeApi: h.chromeApi,
    fetchImpl: h.fetchImpl,
    workspace: A
  });
  const flowB = createRuntimeWorkflow({
    chromeApi: h.chromeApi,
    fetchImpl: h.fetchImpl,
    workspace: B
  });

  assert.equal(
    (await flowA.recover({ interactiveSetup: true })).state,
    'PLATFORM_VERIFICATION_REQUIRED'
  );
  assert.equal((await flowA.confirmPlatformGate()).state, 'READY');

  const keyA = workspaceStorageKey('A', 'platformGate');
  const keyB = workspaceStorageKey('B', 'platformGate');
  assert.equal(h.storage[keyA].status, 'PASS');
  assert.equal(h.storage[keyB], undefined);

  assert.equal(
    (await flowB.recover({ interactiveSetup: true })).state,
    'PLATFORM_VERIFICATION_REQUIRED'
  );
});

test('changing runtime identity invalidates an old platform marker by fingerprint', async () => {
  const h = harness();
  const A = workspace('A');
  const original = createRuntimeWorkflow({
    chromeApi: h.chromeApi,
    fetchImpl: h.fetchImpl,
    workspace: A
  });

  await original.recover({ interactiveSetup: true });
  assert.equal((await original.confirmPlatformGate()).state, 'READY');

  const changed = createRuntimeWorkflow({
    chromeApi: h.chromeApi,
    fetchImpl: h.fetchImpl,
    workspace: {
      ...A,
      projectUrl: 'https://chatgpt.com/g/g-p-A-new'
    }
  });

  assert.equal(
    (await changed.recover({ interactiveSetup: true })).state,
    'PLATFORM_VERIFICATION_REQUIRED'
  );
});


test('non-interactive inspect never performs a Sheets write probe after setup is verified', async () => {
  const h = harness();
  const A = workspace('A');
  const flow = createRuntimeWorkflow({
    chromeApi: h.chromeApi,
    fetchImpl: h.fetchImpl,
    workspace: A
  });

  await flow.recover({ interactiveSetup: true });
  await flow.confirmPlatformGate();

  h.calls.length = 0;
  const result = await flow.inspect();

  assert.equal(result.state, 'READY');
  assert.equal(h.calls.filter(call => call.method === 'PUT').length, 0);
  assert.equal(h.calls.filter(call => call.method === 'GET').length >= 4, true);
});
