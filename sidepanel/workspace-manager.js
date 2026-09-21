const FIELD_MAP = Object.freeze({
  name: 'workspace-name',
  projectUrl: 'workspace-project-url',
  curriculumSpreadsheetId: 'workspace-curriculum-sheet',
  databaseSpreadsheetId: 'workspace-database-sheet',
  sessionBriefSpreadsheetId: 'workspace-brief-sheet',
  sessionBriefActiveSheetId: 'workspace-brief-active-sheet-id',
  sessionBriefStagingSheetId: 'workspace-brief-staging-sheet-id',
  reviewLedgerSpreadsheetId: 'workspace-review-sheet',
  teacherRoleUrl: 'workspace-teacher-role-url',
  speakingMethodUrl: 'workspace-speaking-method-url',
  listeningMethodUrl: 'workspace-listening-method-url'
});

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function defaultIdFactory() {
  if (globalThis.crypto?.randomUUID) {
    return 'ws-' + globalThis.crypto.randomUUID();
  }
  return 'ws-' + Date.now().toString(36);
}

export function createWorkspaceManager({
  registry,
  documentRef = document,
  activeWorkspace,
  reload = () => globalThis.location?.reload(),
  idFactory = defaultIdFactory
}) {
  let currentWorkspace = activeWorkspace;
  let editingId = null;
  let locked = false;
  let paused = false;
  let workspaceCount = 0;

  function el(id) {
    return documentRef.getElementById(id);
  }

  function setError(message = '') {
    const error = el('workspace-error');
    if (error) {
      error.textContent = message;
      error.hidden = message === '';
    }
  }

  function setFormVisible(visible) {
    const form = el('workspace-form');
    if (form) form.hidden = !visible;
  }

  function writeForm(workspace = null) {
    for (const [field, id] of Object.entries(FIELD_MAP)) {
      const input = el(id);
      if (!input) continue;
      input.value = workspace?.[field] ?? '';
    }
    editingId = workspace?.id ?? null;
    setError('');
    setFormVisible(true);
  }

  function readForm() {
    const value = (field) => String(el(FIELD_MAP[field])?.value ?? '').trim();
    return {
      id: editingId || idFactory(),
      name: value('name'),
      projectUrl: value('projectUrl'),
      curriculumSpreadsheetId: value('curriculumSpreadsheetId'),
      databaseSpreadsheetId: value('databaseSpreadsheetId'),
      sessionBriefSpreadsheetId: value('sessionBriefSpreadsheetId'),
      reviewLedgerSpreadsheetId: value('reviewLedgerSpreadsheetId'),
      teacherRoleUrl: value('teacherRoleUrl'),
      speakingMethodUrl: value('speakingMethodUrl'),
      listeningMethodUrl: value('listeningMethodUrl'),
      sessionBriefActiveSheetId: Number(value('sessionBriefActiveSheetId')),
      sessionBriefStagingSheetId: Number(value('sessionBriefStagingSheetId'))
    };
  }

  function applyLockState() {
    const select = el('workspace-select');
    if (select) select.disabled = locked;

    const addButton = el('add-workspace-action');
    if (addButton) addButton.disabled = locked;

    const editButton = el('edit-workspace-action');
    if (editButton) editButton.disabled = locked || paused;

    const deleteButton = el('delete-workspace-action');
    if (deleteButton) {
      deleteButton.disabled = locked || paused || workspaceCount <= 1;
    }
  }

  async function renderSelector() {
    const workspaces = await registry.list();
    workspaceCount = workspaces.length;
    const select = el('workspace-select');
    if (select) {
      select.innerHTML = workspaces.map(item =>
        '<option value="' + escapeHtml(item.id) + '">' +
        escapeHtml(item.name) +
        '</option>'
      ).join('');
      select.value = currentWorkspace?.id ?? '';
    }

    const deleteButton = el('delete-workspace-action');
    if (deleteButton) {
      deleteButton.title = workspaces.length <= 1
        ? 'Keep at least one workspace'
        : 'Delete this local workspace configuration';
    }
    applyLockState();
    return workspaces;
  }

  async function initialize() {
    await renderSelector();
    setFormVisible(false);
    setError('');
  }

  el('workspace-select')?.addEventListener('change', async () => {
    if (locked) return;
    const id = el('workspace-select')?.value;
    if (!id || id === currentWorkspace?.id) return;
    currentWorkspace = await registry.setActive(id);
    await reload();
  });

  el('add-workspace-action')?.addEventListener('click', () => {
    if (locked) return;
    writeForm(null);
  });

  el('edit-workspace-action')?.addEventListener('click', () => {
    if (locked || paused) return;
    writeForm(currentWorkspace);
  });

  el('cancel-workspace-action')?.addEventListener('click', () => {
    editingId = null;
    setError('');
    setFormVisible(false);
  });

  el('delete-workspace-action')?.addEventListener('click', async () => {
    if (locked || paused) return;
    const workspaces = await registry.list();
    if (!currentWorkspace || workspaces.length <= 1) return;
    await registry.remove(currentWorkspace.id);
    await reload();
  });

  el('workspace-form')?.addEventListener('submit', async (event) => {
    event?.preventDefault?.();
    if (locked) return;
    try {
      const saved = await registry.save(readForm());
      await registry.setActive(saved.id);
      currentWorkspace = saved;
      setError('');
      await reload();
    } catch (error) {
      setError(error?.message || String(error));
    }
  });

  return {
    initialize,
    setLocked(value) {
      locked = value === true;
      paused = false;
      if (locked) setFormVisible(false);
      applyLockState();
    },
    setLearnerState(state) {
      locked = state === 'LEARNING' || state === 'PROCESSING';
      paused = state === 'PAUSED' || state === 'ERROR';
      if (locked || paused) setFormVisible(false);
      applyLockState();
    },
    showAdd() {
      writeForm(null);
    },
    showEdit() {
      writeForm(currentWorkspace);
    }
  };
}
