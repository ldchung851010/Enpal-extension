import { loadRuntimeConfig } from '../core/config.js';

export const WORKSPACES_KEY = 'enpalWorkspaces';
export const ACTIVE_WORKSPACE_KEY = 'enpalActiveWorkspaceId';
export const WORKSPACE_PREFIX = 'enpalWorkspace:';

const REQUIRED_NUMERIC = [
  'sessionBriefActiveSheetId',
  'sessionBriefStagingSheetId'
];

const REQUIRED_RUNTIME_STRINGS = [
  'curriculumSpreadsheetId',
  'databaseSpreadsheetId',
  'sessionBriefSpreadsheetId',
  'reviewLedgerSpreadsheetId',
  'teacherRoleUrl',
  'speakingMethodUrl',
  'listeningMethodUrl'
];

const RUNTIME_IDENTITY_FIELDS = [
  'projectUrl',
  'curriculumSpreadsheetId',
  'databaseSpreadsheetId',
  'sessionBriefSpreadsheetId',
  'reviewLedgerSpreadsheetId',
  'teacherRoleUrl',
  'speakingMethodUrl',
  'listeningMethodUrl',
  'sessionBriefActiveSheetId',
  'sessionBriefStagingSheetId'
];

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function normalizeProjectUrl(value) {
  let project;
  try {
    project = new URL(String(value ?? '').trim());
  } catch {
    throw new Error('Workspace projectUrl must be a ChatGPT Project URL');
  }

  const segments = project.pathname.split('/').filter(Boolean);
  if (
    project.origin !== 'https://chatgpt.com' ||
    segments[0] !== 'g' ||
    typeof segments[1] !== 'string' ||
    segments[1].trim() === ''
  ) {
    throw new Error('Workspace projectUrl must be a ChatGPT Project URL');
  }

  return project.origin + '/g/' + segments[1];
}

export function isWorkspaceRuntimeReady(workspace) {
  return Boolean(workspace) &&
    REQUIRED_RUNTIME_STRINGS.every(
      key => typeof workspace[key] === 'string' && workspace[key].trim() !== ''
    ) &&
    REQUIRED_NUMERIC.every(
      key => Number.isInteger(workspace[key]) && workspace[key] >= 0
    );
}

function normalizeWorkspace(input) {
  const workspace = { ...input };
  if (typeof workspace.id !== 'string' || workspace.id.trim() === '') {
    throw new Error('Workspace id is required');
  }
  if (!/^[A-Za-z0-9_-]+$/.test(workspace.id)) {
    throw new Error('Workspace id may contain only letters, numbers, hyphen, and underscore');
  }
  if (typeof workspace.name !== 'string' || workspace.name.trim() === '') {
    throw new Error('Workspace name is required');
  }

  workspace.id = workspace.id.trim();
  workspace.name = workspace.name.trim();
  workspace.projectUrl = normalizeProjectUrl(workspace.projectUrl);

  for (const key of REQUIRED_RUNTIME_STRINGS) {
    workspace[key] = typeof workspace[key] === 'string'
      ? workspace[key].trim()
      : '';
  }

  for (const key of REQUIRED_NUMERIC) {
    const raw = workspace[key];
    if (raw == null || String(raw).trim() === '') {
      workspace[key] = null;
      continue;
    }

    const value = Number(raw);
    if (!Number.isInteger(value) || value < 0) {
      throw new Error('Workspace ' + key + ' must be a non-negative integer');
    }
    workspace[key] = value;
  }

  if (isWorkspaceRuntimeReady(workspace)) {
    Object.assign(workspace, loadRuntimeConfig(workspace));
    workspace.setupStatus = 'READY';
  } else {
    workspace.setupStatus = 'DRAFT';
  }

  return workspace;
}

export function workspaceStorageKey(workspaceId, name) {
  if (typeof workspaceId !== 'string' || workspaceId.trim() === '') {
    throw new Error('workspaceId is required');
  }
  if (typeof name !== 'string' || name.trim() === '') {
    throw new Error('workspace storage name is required');
  }
  return WORKSPACE_PREFIX + workspaceId.trim() + ':' + name.trim();
}

export function createWorkspaceRegistry(
  chromeApi = chrome,
  { defaultWorkspace = null } = {}
) {
  async function readState() {
    const result = await chromeApi.storage.local.get([
      WORKSPACES_KEY,
      ACTIVE_WORKSPACE_KEY
    ]);
    const workspaces = Array.isArray(result?.[WORKSPACES_KEY])
      ? result[WORKSPACES_KEY].map(item => normalizeWorkspace(item))
      : [];
    const activeId = typeof result?.[ACTIVE_WORKSPACE_KEY] === 'string'
      ? result[ACTIVE_WORKSPACE_KEY]
      : '';
    return { workspaces, activeId };
  }

  async function writeState(workspaces, activeId) {
    await chromeApi.storage.local.set({
      [WORKSPACES_KEY]: workspaces.map(clone),
      [ACTIVE_WORKSPACE_KEY]: activeId
    });
  }

  async function clearWorkspaceNamespace(id) {
    const allStorage = await chromeApi.storage.local.get(null);
    const prefix = WORKSPACE_PREFIX + id + ':';
    const keys = Object.keys(allStorage ?? {}).filter(key => key.startsWith(prefix));
    if (keys.length > 0) await chromeApi.storage.local.remove(keys);
  }

  function runtimeIdentityChanged(previous, next) {
    if (!previous) return false;
    return RUNTIME_IDENTITY_FIELDS.some(
      key => previous[key] !== next[key]
    );
  }

  function assertNoSharedStatefulSources(workspaces, workspace) {
    const protectedFields = [
      'projectUrl',
      'curriculumSpreadsheetId',
      'databaseSpreadsheetId',
      'sessionBriefSpreadsheetId',
      'reviewLedgerSpreadsheetId'
    ];

    for (const other of workspaces) {
      if (other.id === workspace.id) continue;
      for (const field of protectedFields) {
        const value = workspace[field];
        if (
          typeof value === 'string' &&
          value.trim() !== '' &&
          other[field] === value
        ) {
          throw new Error(
            `Workspace ${field} must be unique; already used by ${other.name}`
          );
        }
      }
    }
  }

  return {
    async ensureInitialized() {
      let { workspaces, activeId } = await readState();

      if (workspaces.length === 0) {
        if (!defaultWorkspace) return null;

        const normalized = normalizeWorkspace(defaultWorkspace);
        const allStorage = await chromeApi.storage.local.get(null);
        const patch = {
          [WORKSPACES_KEY]: [clone(normalized)],
          [ACTIVE_WORKSPACE_KEY]: normalized.id
        };

        if (allStorage?.enpalRecovery !== undefined) {
          patch[workspaceStorageKey(normalized.id, 'recovery')] =
            clone(allStorage.enpalRecovery);
        }
        if (allStorage?.enpalPlatformGate !== undefined) {
          patch[workspaceStorageKey(normalized.id, 'platformGate')] =
            clone(allStorage.enpalPlatformGate);
        }

        await chromeApi.storage.local.set(patch);
        await chromeApi.storage.local.remove([
          'enpalRecovery',
          'enpalPlatformGate'
        ]);
        return clone(normalized);
      }

      if (!workspaces.some(item => item.id === activeId)) {
        activeId = workspaces[0].id;
        await writeState(workspaces, activeId);
      }
      return clone(workspaces.find(item => item.id === activeId));
    },

    async list() {
      const { workspaces } = await readState();
      return workspaces.map(clone);
    },

    async get(id) {
      const { workspaces } = await readState();
      const found = workspaces.find(item => item.id === id);
      return found ? clone(found) : null;
    },

    async getActive() {
      const { workspaces, activeId } = await readState();
      const found = workspaces.find(item => item.id === activeId);
      return found ? clone(found) : null;
    },

    async save(input) {
      const workspace = normalizeWorkspace(input);
      const { workspaces, activeId } = await readState();
      assertNoSharedStatefulSources(workspaces, workspace);
      const index = workspaces.findIndex(item => item.id === workspace.id);
      const previous = index >= 0 ? workspaces[index] : null;

      if (index >= 0) workspaces[index] = workspace;
      else workspaces.push(workspace);

      const nextActive = activeId || workspace.id;
      await writeState(workspaces, nextActive);

      if (runtimeIdentityChanged(previous, workspace)) {
        await clearWorkspaceNamespace(workspace.id);
      }

      return clone(workspace);
    },

    async setActive(id) {
      const { workspaces } = await readState();
      const found = workspaces.find(item => item.id === id);
      if (!found) throw new Error('Workspace not found: ' + id);
      await writeState(workspaces, id);
      return clone(found);
    },

    async remove(id) {
      const { workspaces, activeId } = await readState();
      if (!workspaces.some(item => item.id === id)) return false;
      if (workspaces.length <= 1) {
        throw new Error('EnPal requires at least one workspace');
      }

      const nextWorkspaces = workspaces.filter(item => item.id !== id);
      const nextActive = activeId === id
        ? (nextWorkspaces[0]?.id ?? '')
        : activeId;

      await writeState(nextWorkspaces, nextActive);

      await clearWorkspaceNamespace(id);
      return true;
    }
  };
}
