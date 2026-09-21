import { loadWorkspaceConfig, isWorkspaceRuntimeReady } from '../core/config.js';
import { EnpalError, ERROR_CODES } from '../core/errors.js';

export const WORKSPACES_KEY = 'enpalWorkspaces';
export const ACTIVE_WORKSPACE_KEY = 'enpalActiveWorkspaceId';
export { isWorkspaceRuntimeReady };

const WORKSPACE_PREFIX = 'enpalWorkspace:';

const STATEFUL_SOURCE_FIELDS = Object.freeze([
  'projectUrl',
  'curriculumSpreadsheetId',
  'databaseSpreadsheetId',
  'sessionBriefSpreadsheetId',
  'reviewLedgerSpreadsheetId'
]);

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function normalizeWorkspace(input) {
  return loadWorkspaceConfig(input, { allowDraft: true });
}

function assertUniqueStatefulSources(workspaces, candidate) {
  for (const other of workspaces) {
    if (other.id === candidate.id) continue;

    for (const field of STATEFUL_SOURCE_FIELDS) {
      const value = candidate[field];
      if (
        typeof value === 'string' &&
        value.trim() !== '' &&
        other[field] === value
      ) {
        throw new EnpalError(
          ERROR_CODES.WORKSPACE_SOURCE_CONFLICT,
          'Workspace ' + field + ' is already used by ' + other.name,
          false
        );
      }
    }
  }
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
      ? result[WORKSPACES_KEY].map(normalizeWorkspace)
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
    const all = await chromeApi.storage.local.get(null);
    const prefix = WORKSPACE_PREFIX + id + ':';
    const keys = Object.keys(all ?? {}).filter(key => key.startsWith(prefix));
    if (keys.length > 0) await chromeApi.storage.local.remove(keys);
  }

  function runtimeIdentityChanged(previous, next) {
    if (!previous) return false;
    return [
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
    ].some(key => previous[key] !== next[key]);
  }

  async function findOrThrow(id) {
    const { workspaces } = await readState();
    const found = workspaces.find(item => item.id === id);
    if (!found) {
      throw new EnpalError(
        ERROR_CODES.WORKSPACE_NOT_FOUND,
        'Workspace not found: ' + id,
        false
      );
    }
    return { workspaces, found };
  }

  return {
    async ensureInitialized() {
      let { workspaces, activeId } = await readState();

      if (workspaces.length === 0) {
        if (!defaultWorkspace) return null;
        const normalized = normalizeWorkspace(defaultWorkspace);
        await writeState([normalized], normalized.id);
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

    async add(input) {
      const workspace = normalizeWorkspace(input);
      const { workspaces, activeId } = await readState();

      if (workspaces.some(item => item.id === workspace.id)) {
        throw new Error('Workspace id already exists: ' + workspace.id);
      }

      assertUniqueStatefulSources(workspaces, workspace);
      const next = [...workspaces, workspace];
      const nextActiveId = activeId || workspace.id;
      await writeState(next, nextActiveId);
      return clone(workspace);
    },

    async update(id, patch) {
      const { workspaces, found } = await findOrThrow(id);

      if (patch?.id != null && patch.id !== id) {
        throw new Error('Workspace id is immutable');
      }

      const candidate = normalizeWorkspace({
        ...found,
        ...(patch ?? {}),
        id
      });

      assertUniqueStatefulSources(workspaces, candidate);
      const next = workspaces.map(item => item.id === id ? candidate : item);

      const { activeId } = await readState();
      await writeState(next, activeId);
      if (runtimeIdentityChanged(found, candidate)) {
        await clearWorkspaceNamespace(id);
      }
      return clone(candidate);
    },

    async save(input) {
      const normalized = normalizeWorkspace(input);
      const existing = await this.get(normalized.id);
      return existing
        ? this.update(normalized.id, normalized)
        : this.add(normalized);
    },

    async setActive(id) {
      const { workspaces, found } = await findOrThrow(id);
      const { activeId } = await readState();

      if (activeId !== id) {
        await writeState(workspaces, id);
      }

      return clone(found);
    },

    async remove(id) {
      const { workspaces, activeId } = await readState();
      if (!workspaces.some(item => item.id === id)) return false;
      if (workspaces.length <= 1) {
        throw new Error('EnPal requires at least one Workspace');
      }

      const next = workspaces.filter(item => item.id !== id);
      const nextActiveId = activeId === id
        ? next[0].id
        : activeId;

      await writeState(next, nextActiveId);
      await clearWorkspaceNamespace(id);
      return true;
    }
  };
}
