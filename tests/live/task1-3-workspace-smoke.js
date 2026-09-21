import {
  loadWorkspaceConfig,
  isWorkspaceRuntimeReady,
  normalizeProjectUrl
} from '../../core/config.js';
import {
  createWorkspaceRegistry,
  WORKSPACES_KEY,
  ACTIVE_WORKSPACE_KEY
} from '../../storage/workspace-registry.js';
import {
  createLocalJournal,
  workspaceStorageKey
} from '../../storage/local-journal.js';
import { ERROR_CODES } from '../../core/errors.js';

const runButton = document.getElementById('run');
const resultsEl = document.getElementById('results');
const summaryEl = document.getElementById('summary');
const storageEl = document.getElementById('storage');

function completeWorkspace(id) {
  return {
    id,
    name: 'Workspace ' + id,
    projectUrl: 'https://chatgpt.com/g/g-p-' + id,
    curriculumSpreadsheetId: 'curriculum-' + id,
    databaseSpreadsheetId: 'database-' + id,
    sessionBriefSpreadsheetId: 'brief-' + id,
    reviewLedgerSpreadsheetId: 'review-' + id,
    teacherRoleUrl: 'https://drive.google.com/file/d/shared-teacher/view',
    speakingMethodUrl: 'https://drive.google.com/file/d/shared-speaking/view',
    listeningMethodUrl: 'https://drive.google.com/file/d/shared-listening/view',
    sessionBriefActiveSheetId: 101,
    sessionBriefStagingSheetId: 202
  };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function equal(actual, expected, message) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(message + '\nExpected: ' + JSON.stringify(expected) +
      '\nActual: ' + JSON.stringify(actual));
  }
}

function addResult(name, ok, detail = '') {
  const row = document.createElement('div');
  row.className = 'row ' + (ok ? 'pass' : 'fail');
  row.textContent = (ok ? 'PASS — ' : 'FAIL — ') + name +
    (detail ? '\n' + detail : '');
  resultsEl.appendChild(row);
}

async function runCase(name, fn) {
  try {
    await fn();
    addResult(name, true);
    return true;
  } catch (error) {
    addResult(name, false, error?.message || String(error));
    return false;
  }
}

async function resetSmokeStorage() {
  const all = await chrome.storage.local.get(null);
  const keys = Object.keys(all).filter(key =>
    key === WORKSPACES_KEY ||
    key === ACTIVE_WORKSPACE_KEY ||
    key === 'enpalRecovery' ||
    key.startsWith('enpalWorkspace:A:') ||
    key.startsWith('enpalWorkspace:B:')
  );
  if (keys.length) await chrome.storage.local.remove(keys);
}

async function run() {
  runButton.disabled = true;
  resultsEl.innerHTML = '';
  summaryEl.textContent = 'Đang chạy...';

  await resetSmokeStorage();

  const registry = createWorkspaceRegistry(chrome);
  const checks = [];

  checks.push(await runCase('Task 1: Project conversation URL normalizes to Project root', async () => {
    equal(
      normalizeProjectUrl('https://chatgpt.com/g/g-p-A/c/example?x=1#top'),
      'https://chatgpt.com/g/g-p-A',
      'Project URL normalization failed'
    );
  }));

  checks.push(await runCase('Task 1: DRAFT workspace cannot be runtime-ready', async () => {
    const draft = loadWorkspaceConfig({
      id: 'B',
      name: 'Workspace B',
      projectUrl: 'https://chatgpt.com/g/g-p-B'
    });
    assert(draft.configState === 'DRAFT', 'Expected DRAFT config state');
    assert(isWorkspaceRuntimeReady(draft) === false, 'Draft became runtime-ready');
  }));

  checks.push(await runCase('Task 2: Create independent Workspace A and DRAFT Workspace B', async () => {
    const A = await registry.add(completeWorkspace('A'));
    const B = await registry.add({
      id: 'B',
      name: 'Workspace B',
      projectUrl: 'https://chatgpt.com/g/g-p-B/c/temp-chat'
    });

    assert(A.configState === 'COMPLETE', 'Workspace A must be COMPLETE');
    assert(B.configState === 'DRAFT', 'Workspace B must remain DRAFT');
    assert(B.projectUrl === 'https://chatgpt.com/g/g-p-B', 'Workspace B Project URL not normalized');
  }));

  checks.push(await runCase('Task 2: Switching to B changes selector only', async () => {
    const before = await registry.list();
    await registry.setActive('B');
    const after = await registry.list();
    equal(after, before, 'Workspace records changed during switch');
    assert((await registry.getActive()).id === 'B', 'Active workspace is not B');
  }));

  checks.push(await runCase('Task 2: Duplicate Project is rejected', async () => {
    let caught = null;
    try {
      await registry.add({
        ...completeWorkspace('C'),
        projectUrl: 'https://chatgpt.com/g/g-p-A'
      });
    } catch (error) {
      caught = error;
    }
    assert(caught?.code === ERROR_CODES.WORKSPACE_SOURCE_CONFLICT,
      'Expected WORKSPACE_SOURCE_CONFLICT');
  }));

  checks.push(await runCase('Task 2: Duplicate stateful Sheet is rejected', async () => {
    let caught = null;
    try {
      await registry.add({
        ...completeWorkspace('C2'),
        databaseSpreadsheetId: 'database-A'
      });
    } catch (error) {
      caught = error;
    }
    assert(caught?.code === ERROR_CODES.WORKSPACE_SOURCE_CONFLICT,
      'Expected WORKSPACE_SOURCE_CONFLICT');
  }));

  checks.push(await runCase('Task 3: Workspace A/B recovery journals are isolated', async () => {
    const journalA = createLocalJournal(chrome, 'A');
    const journalB = createLocalJournal(chrome, 'B');

    await journalA.write({ sessionId: 'S-A', phase: 'PAUSE_COMMITTED' });
    await journalB.write({ sessionId: 'S-B', phase: 'ANALYZE_COMMITTED' });

    equal(await journalA.read(),
      { sessionId: 'S-A', phase: 'PAUSE_COMMITTED' },
      'Workspace A journal mismatch');
    equal(await journalB.read(),
      { sessionId: 'S-B', phase: 'ANALYZE_COMMITTED' },
      'Workspace B journal mismatch');

    await journalA.clear();
    equal(await journalA.read(), {}, 'Workspace A journal did not clear');
    equal(await journalB.read(),
      { sessionId: 'S-B', phase: 'ANALYZE_COMMITTED' },
      'Clearing A damaged B');
  }));

  checks.push(await runCase('Task 3: Legacy global recovery is ignored', async () => {
    await chrome.storage.local.set({
      enpalRecovery: { sessionId: 'LEGACY', phase: 'SESSION_STUB_CREATED' }
    });
    const journalA = createLocalJournal(chrome, 'A');
    equal(await journalA.read(), {}, 'Workspace journal fell back to legacy global recovery');
    const all = await chrome.storage.local.get(null);
    assert(all.enpalRecovery?.sessionId === 'LEGACY',
      'Test should not silently migrate/delete legacy data');
  }));

  const storage = await chrome.storage.local.get(null);
  storageEl.textContent = JSON.stringify(storage, null, 2);

  const passed = checks.filter(Boolean).length;
  summaryEl.textContent = passed + '/' + checks.length +
    (passed === checks.length ? ' checks PASS.' : ' checks; có lỗi cần sửa.');
  runButton.disabled = false;
}

runButton.addEventListener('click', run);
