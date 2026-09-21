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
    ['recover']
  ]);
});
