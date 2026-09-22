import path from 'node:path';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { loadRuntimeConfig } from '../core/config.js';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeProjectUrl(value) {
  const url = new URL(String(value ?? '').trim());
  const segments = url.pathname.split('/').filter(Boolean);

  if (
    url.origin !== 'https://chatgpt.com' ||
    segments[0] !== 'g' ||
    !segments[1]
  ) {
    throw new Error('workspace projectUrl must be a ChatGPT Project URL');
  }

  return url.origin + '/g/' + segments[1] + '/project';
}

export function normalizePlaywrightWorkspace(input) {
  if (!input || typeof input !== 'object') {
    throw new Error('workspace configuration is required');
  }

  const workspace = { ...input };
  if (typeof workspace.id !== 'string' || !/^[A-Za-z0-9_-]+$/.test(workspace.id)) {
    throw new Error('workspace id may contain only letters, numbers, hyphen, and underscore');
  }
  if (typeof workspace.name !== 'string' || workspace.name.trim() === '') {
    throw new Error('workspace name is required');
  }

  workspace.id = workspace.id.trim();
  workspace.name = workspace.name.trim();
  workspace.projectUrl = normalizeProjectUrl(workspace.projectUrl);

  Object.assign(workspace, loadRuntimeConfig(workspace));

  for (const key of [
    'sessionBriefActiveSheetId',
    'sessionBriefStagingSheetId'
  ]) {
    const number = Number(workspace[key]);
    if (!Number.isInteger(number) || number < 0) {
      throw new Error(key + ' must be a non-negative integer');
    }
    workspace[key] = number;
  }

  return workspace;
}

export function createWorkspaceFileStore({
  filePath = '.enpal/workspaces.json'
} = {}) {
  const resolved = path.resolve(filePath);

  async function readState() {
    try {
      const parsed = JSON.parse(await readFile(resolved, 'utf8'));
      const workspaces = Array.isArray(parsed?.workspaces)
        ? parsed.workspaces.map(normalizePlaywrightWorkspace)
        : [];
      const activeWorkspaceId = String(parsed?.activeWorkspaceId ?? '');
      return { workspaces, activeWorkspaceId };
    } catch (error) {
      if (error?.code === 'ENOENT') {
        return { workspaces: [], activeWorkspaceId: '' };
      }
      throw error;
    }
  }

  async function writeState(state) {
    await mkdir(path.dirname(resolved), { recursive: true });
    const temp = resolved + '.tmp-' + process.pid;
    await writeFile(temp, JSON.stringify(state, null, 2) + '\n', 'utf8');
    await rename(temp, resolved);
  }

  return {
    filePath: resolved,

    async list() {
      const state = await readState();
      return state.workspaces.map(clone);
    },

    async getActive() {
      const state = await readState();
      const found = state.workspaces.find(
        item => item.id === state.activeWorkspaceId
      ) ?? state.workspaces[0] ?? null;
      return found ? clone(found) : null;
    },

    async save(input, { makeActive = false } = {}) {
      const workspace = normalizePlaywrightWorkspace(input);
      const state = await readState();

      const protectedFields = [
        'projectUrl',
        'curriculumSpreadsheetId',
        'databaseSpreadsheetId',
        'sessionBriefSpreadsheetId',
        'reviewLedgerSpreadsheetId'
      ];

      for (const other of state.workspaces) {
        if (other.id === workspace.id) continue;
        for (const field of protectedFields) {
          if (other[field] === workspace[field]) {
            throw new Error(
              'workspace ' + field + ' is already used by ' + other.name
            );
          }
        }
      }

      const index = state.workspaces.findIndex(item => item.id === workspace.id);
      if (index >= 0) state.workspaces[index] = workspace;
      else state.workspaces.push(workspace);

      if (makeActive || !state.activeWorkspaceId) {
        state.activeWorkspaceId = workspace.id;
      }

      await writeState(state);
      return clone(workspace);
    },

    async setActive(id) {
      const state = await readState();
      const found = state.workspaces.find(item => item.id === id);
      if (!found) throw new Error('workspace not found: ' + id);
      state.activeWorkspaceId = id;
      await writeState(state);
      return clone(found);
    }
  };
}
