import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorkspaceManager } from '../../sidepanel/workspace-manager.js';

function workspace(id, name) {
  return {
    id,
    name,
    projectUrl: 'https://chatgpt.com/g/g-p-' + id,
    curriculumSpreadsheetId: 'curriculum-' + id,
    databaseSpreadsheetId: 'database-' + id,
    sessionBriefSpreadsheetId: 'brief-' + id,
    reviewLedgerSpreadsheetId: 'review-' + id,
    teacherRoleUrl: 'https://drive.google.com/file/d/teacher-' + id + '/view',
    speakingMethodUrl: 'https://drive.google.com/file/d/speaking-' + id + '/view',
    listeningMethodUrl: 'https://drive.google.com/file/d/listening-' + id + '/view',
    sessionBriefActiveSheetId: 101,
    sessionBriefStagingSheetId: 202
  };
}

function makeDocument() {
  class FakeElement {
    constructor() {
      this.hidden = false;
      this.disabled = false;
      this.value = '';
      this.textContent = '';
      this.innerHTML = '';
      this.handlers = new Map();
    }
    addEventListener(type, handler) {
      this.handlers.set(type, handler);
    }
    async fire(type) {
      return this.handlers.get(type)?.({ preventDefault() {} });
    }
  }

  const ids = [
    'workspace-select',
    'add-workspace-action',
    'edit-workspace-action',
    'delete-workspace-action',
    'workspace-form',
    'workspace-error',
    'workspace-name',
    'workspace-project-url',
    'workspace-curriculum-sheet',
    'workspace-database-sheet',
    'workspace-brief-sheet',
    'workspace-brief-active-sheet-id',
    'workspace-brief-staging-sheet-id',
    'workspace-review-sheet',
    'workspace-teacher-role-url',
    'workspace-speaking-method-url',
    'workspace-listening-method-url',
    'save-workspace-action',
    'cancel-workspace-action'
  ];
  const elements = Object.fromEntries(ids.map(id => [id, new FakeElement()]));
  elements['workspace-form'].hidden = true;

  return {
    getElementById(id) {
      return elements[id] ?? null;
    },
    elements
  };
}

test('workspace selector renders all workspaces and switching changes only activeWorkspaceId', async () => {
  const A = workspace('A', 'English Engineering');
  const B = workspace('B', 'Interview Practice');
  const calls = [];
  const registry = {
    async list() {
      return [A, B];
    },
    async setActive(id) {
      calls.push(['setActive', id]);
      return id === 'A' ? A : B;
    }
  };
  const documentRef = makeDocument();
  let reloadCount = 0;

  const manager = createWorkspaceManager({
    registry,
    documentRef,
    activeWorkspace: A,
    reload: async () => {
      reloadCount += 1;
    }
  });

  await manager.initialize();

  assert.match(documentRef.elements['workspace-select'].innerHTML, /English Engineering/);
  assert.match(documentRef.elements['workspace-select'].innerHTML, /Interview Practice/);
  assert.equal(documentRef.elements['workspace-select'].value, 'A');

  documentRef.elements['workspace-select'].value = 'B';
  await documentRef.elements['workspace-select'].fire('change');

  assert.deepEqual(calls, [['setActive', 'B']]);
  assert.equal(reloadCount, 1);
});

test('Add Workspace saves a complete independent config, activates it, and reloads', async () => {
  const A = workspace('A', 'English Engineering');
  const calls = [];
  const registry = {
    async list() {
      return [A];
    },
    async save(value) {
      calls.push(['save', value]);
      return value;
    },
    async setActive(id) {
      calls.push(['setActive', id]);
    }
  };
  const documentRef = makeDocument();
  let reloadCount = 0;
  const manager = createWorkspaceManager({
    registry,
    documentRef,
    activeWorkspace: A,
    idFactory: () => 'workspace-new',
    reload: async () => {
      reloadCount += 1;
    }
  });

  await manager.initialize();
  await documentRef.elements['add-workspace-action'].fire('click');

  const values = {
    'workspace-name': 'Japanese',
    'workspace-project-url': 'https://chatgpt.com/g/g-p-japanese',
    'workspace-curriculum-sheet': 'curriculum-jp',
    'workspace-database-sheet': 'database-jp',
    'workspace-brief-sheet': 'brief-jp',
    'workspace-brief-active-sheet-id': '301',
    'workspace-brief-staging-sheet-id': '302',
    'workspace-review-sheet': 'review-jp',
    'workspace-teacher-role-url': 'https://drive.google.com/file/d/teacher-jp/view',
    'workspace-speaking-method-url': 'https://drive.google.com/file/d/speaking-jp/view',
    'workspace-listening-method-url': 'https://drive.google.com/file/d/listening-jp/view'
  };
  for (const [id, value] of Object.entries(values)) {
    documentRef.elements[id].value = value;
  }

  await documentRef.elements['workspace-form'].fire('submit');

  assert.equal(calls[0][0], 'save');
  assert.deepEqual(calls[0][1], {
    id: 'workspace-new',
    name: 'Japanese',
    projectUrl: 'https://chatgpt.com/g/g-p-japanese',
    curriculumSpreadsheetId: 'curriculum-jp',
    databaseSpreadsheetId: 'database-jp',
    sessionBriefSpreadsheetId: 'brief-jp',
    reviewLedgerSpreadsheetId: 'review-jp',
    teacherRoleUrl: 'https://drive.google.com/file/d/teacher-jp/view',
    speakingMethodUrl: 'https://drive.google.com/file/d/speaking-jp/view',
    listeningMethodUrl: 'https://drive.google.com/file/d/listening-jp/view',
    sessionBriefActiveSheetId: 301,
    sessionBriefStagingSheetId: 302
  });
  assert.deepEqual(calls[1], ['setActive', 'workspace-new']);
  assert.equal(reloadCount, 1);
});

test('editing a workspace preserves its workspace id', async () => {
  const A = workspace('A', 'English Engineering');
  const calls = [];
  const registry = {
    async list() {
      return [A];
    },
    async save(value) {
      calls.push(value);
      return value;
    },
    async setActive() {}
  };
  const documentRef = makeDocument();
  const manager = createWorkspaceManager({
    registry,
    documentRef,
    activeWorkspace: A,
    reload: async () => {}
  });

  await manager.initialize();
  await documentRef.elements['edit-workspace-action'].fire('click');
  documentRef.elements['workspace-name'].value = 'English Work';
  await documentRef.elements['workspace-form'].fire('submit');

  assert.equal(calls[0].id, 'A');
  assert.equal(calls[0].name, 'English Work');
});

test('real Side Panel HTML exposes workspace selector and complete workspace form', () => {
  const html = readFileSync(
    new URL('../../sidepanel/index.html', import.meta.url),
    'utf8'
  );
  for (const id of [
    'workspace-select',
    'add-workspace-action',
    'edit-workspace-action',
    'delete-workspace-action',
    'workspace-project-url',
    'workspace-curriculum-sheet',
    'workspace-database-sheet',
    'workspace-brief-sheet',
    'workspace-review-sheet',
    'workspace-teacher-role-url',
    'workspace-speaking-method-url',
    'workspace-listening-method-url'
  ]) {
    assert.match(html, new RegExp('id="' + id + '"'));
  }
});


test('workspace switching and mutations are locked while a lesson is active', async () => {
  const A = workspace('A', 'English Engineering');
  const B = workspace('B', 'Japanese');
  const calls = [];
  const registry = {
    async list() {
      return [A, B];
    },
    async setActive(id) {
      calls.push(['setActive', id]);
      return B;
    },
    async remove(id) {
      calls.push(['remove', id]);
    }
  };
  const documentRef = makeDocument();
  const manager = createWorkspaceManager({
    registry,
    documentRef,
    activeWorkspace: A,
    reload: async () => calls.push(['reload'])
  });

  await manager.initialize();
  manager.setLocked(true);

  assert.equal(documentRef.elements['workspace-select'].disabled, true);
  assert.equal(documentRef.elements['add-workspace-action'].disabled, true);
  assert.equal(documentRef.elements['edit-workspace-action'].disabled, true);
  assert.equal(documentRef.elements['delete-workspace-action'].disabled, true);

  documentRef.elements['workspace-select'].value = 'B';
  await documentRef.elements['workspace-select'].fire('change');
  await documentRef.elements['delete-workspace-action'].fire('click');

  assert.deepEqual(calls, []);

  manager.setLocked(false);
  assert.equal(documentRef.elements['workspace-select'].disabled, false);
  assert.equal(documentRef.elements['add-workspace-action'].disabled, false);
  assert.equal(documentRef.elements['edit-workspace-action'].disabled, false);
});

test('workspace manager stays unlocked for a PAUSED lesson so another workspace can be selected', async () => {
  const A = workspace('A', 'English Engineering');
  const documentRef = makeDocument();
  const manager = createWorkspaceManager({
    registry: {
      async list() {
        return [A];
      }
    },
    documentRef,
    activeWorkspace: A,
    reload: async () => {}
  });

  await manager.initialize();
  manager.setLocked(false);

  assert.equal(documentRef.elements['workspace-select'].disabled, false);
  assert.equal(documentRef.elements['edit-workspace-action'].disabled, false);
});


test('PAUSED workspace may switch or add but cannot edit or delete its paused configuration', async () => {
  const A = workspace('A', 'English Engineering');
  const B = workspace('B', 'Japanese');
  const documentRef = makeDocument();
  const manager = createWorkspaceManager({
    registry: {
      async list() {
        return [A, B];
      },
      async setActive() {
        return B;
      }
    },
    documentRef,
    activeWorkspace: A,
    reload: async () => {}
  });

  await manager.initialize();
  manager.setLearnerState('PAUSED');

  assert.equal(documentRef.elements['workspace-select'].disabled, false);
  assert.equal(documentRef.elements['add-workspace-action'].disabled, false);
  assert.equal(documentRef.elements['edit-workspace-action'].disabled, true);
  assert.equal(documentRef.elements['delete-workspace-action'].disabled, true);
});


test('ERROR workspace may be left but its configuration remains protected for recovery', async () => {
  const A = workspace('A', 'English Engineering');
  const B = workspace('B', 'Japanese');
  const documentRef = makeDocument();
  const manager = createWorkspaceManager({
    registry: {
      async list() {
        return [A, B];
      }
    },
    documentRef,
    activeWorkspace: A,
    reload: async () => {}
  });

  await manager.initialize();
  manager.setLearnerState('ERROR');

  assert.equal(documentRef.elements['workspace-select'].disabled, false);
  assert.equal(documentRef.elements['add-workspace-action'].disabled, false);
  assert.equal(documentRef.elements['edit-workspace-action'].disabled, true);
  assert.equal(documentRef.elements['delete-workspace-action'].disabled, true);
});
