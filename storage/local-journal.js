export const WORKSPACE_STORAGE_PREFIX = 'enpalWorkspace:';

export function workspaceStorageKey(workspaceId, name) {
  if (typeof workspaceId !== 'string' || workspaceId.trim() === '') {
    throw new Error('workspaceId is required');
  }
  if (!/^[A-Za-z0-9_-]+$/.test(workspaceId.trim())) {
    throw new Error('workspaceId is invalid');
  }
  if (typeof name !== 'string' || name.trim() === '') {
    throw new Error('workspace storage name is required');
  }

  return WORKSPACE_STORAGE_PREFIX + workspaceId.trim() + ':' + name.trim();
}

export function createLocalJournal(chromeApi = chrome, workspaceId) {
  const key = workspaceStorageKey(workspaceId, 'recovery');

  return {
    key,

    async read() {
      const result = await chromeApi.storage.local.get(key);
      return result[key] ?? {};
    },

    async write(patch) {
      const current = await this.read();
      const next = { ...current, ...(patch ?? {}) };
      await chromeApi.storage.local.set({ [key]: next });
      return next;
    },

    async clear() {
      await chromeApi.storage.local.remove(key);
    }
  };
}
