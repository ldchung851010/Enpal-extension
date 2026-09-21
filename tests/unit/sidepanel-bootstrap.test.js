import test from 'node:test';
import assert from 'node:assert/strict';
import { bootstrapSidePanel } from '../../sidepanel/sidepanel.js';

test('bootstrap builds the learner workflow only from the active workspace config', async () => {
  const activeWorkspace = {
    id: 'B',
    name: 'Workspace B',
    projectUrl: 'https://chatgpt.com/g/g-p-B',
    curriculumSpreadsheetId: 'curriculum-B',
    databaseSpreadsheetId: 'database-B',
    sessionBriefSpreadsheetId: 'brief-B',
    reviewLedgerSpreadsheetId: 'review-B',
    teacherRoleUrl: 'https://drive.google.com/file/d/teacher-B/view',
    speakingMethodUrl: 'https://drive.google.com/file/d/speaking-B/view',
    listeningMethodUrl: 'https://drive.google.com/file/d/listening-B/view',
    sessionBriefActiveSheetId: 21,
    sessionBriefStagingSheetId: 22
  };

  const calls = [];
  const registry = {
    async ensureInitialized() {
      calls.push(['ensureInitialized']);
      return activeWorkspace;
    }
  };
  const workflow = {
    async inspect() {
      calls.push(['inspect']);
      return { state: 'READY' };
    },
    async recover() {
      calls.push(['recover']);
      return { state: 'READY' };
    },
    async start() {},
    async pause() {},
    async end() {}
  };

  const elements = new Map();
  const documentRef = {
    documentElement: { dataset: {} },
    getElementById(id) {
      if (!elements.has(id)) {
        elements.set(id, {
          hidden: true,
          disabled: true,
          textContent: '',
          addEventListener() {}
        });
      }
      return elements.get(id);
    }
  };

  let runtimeWorkspace = null;
  let managerWorkspace = null;

  await bootstrapSidePanel({
    chromeApi: {},
    documentRef,
    registry,
    workflowFactory({ workspace }) {
      runtimeWorkspace = workspace;
      return workflow;
    },
    workspaceManagerFactory({ activeWorkspace: value }) {
      managerWorkspace = value;
      return { async initialize() {} };
    }
  });

  assert.deepEqual(runtimeWorkspace, activeWorkspace);
  assert.deepEqual(managerWorkspace, activeWorkspace);
  assert.deepEqual(calls, [
    ['ensureInitialized'],
    ['inspect']
  ]);
});


test('bootstrap never falls back to the default runtime when the active workspace is a draft', async () => {
  const draft = {
    id: 'japanese',
    name: 'Japanese',
    projectUrl: 'https://chatgpt.com/g/g-p-japanese',
    setupStatus: 'DRAFT',
    curriculumSpreadsheetId: '',
    databaseSpreadsheetId: '',
    sessionBriefSpreadsheetId: '',
    reviewLedgerSpreadsheetId: '',
    teacherRoleUrl: '',
    speakingMethodUrl: '',
    listeningMethodUrl: '',
    sessionBriefActiveSheetId: null,
    sessionBriefStagingSheetId: null
  };
  const registry = {
    async ensureInitialized() {
      return draft;
    }
  };

  const elements = new Map();
  const documentRef = {
    documentElement: { dataset: {} },
    getElementById(id) {
      if (!elements.has(id)) {
        elements.set(id, {
          hidden: true,
          disabled: true,
          textContent: '',
          addEventListener() {}
        });
      }
      return elements.get(id);
    }
  };

  let runtimeCreated = false;

  const result = await bootstrapSidePanel({
    chromeApi: {},
    documentRef,
    registry,
    workflowFactory() {
      runtimeCreated = true;
      throw new Error('draft workspace must not create a learner runtime');
    },
    workspaceManagerFactory() {
      return {
        async initialize() {},
        setLearnerState() {}
      };
    }
  });

  assert.equal(runtimeCreated, false);
  assert.equal(result.activeWorkspace.id, 'japanese');
  assert.match(
    documentRef.getElementById('status').textContent,
    /complete workspace setup/i
  );
});
