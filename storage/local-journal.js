import { workspaceStorageKey } from './workspace-registry.js';

const LEGACY_KEY = 'enpalRecovery';

export function createLocalJournal(chromeApi = chrome, workspaceId = null) {
  const key = workspaceId
    ? workspaceStorageKey(workspaceId, 'recovery')
    : LEGACY_KEY;

  return {
    async read() {
      const result = await chromeApi.storage.local.get(key);
      return result[key] ?? {};
    },

    async write(patch) {
      const current = await this.read();
      const next = { ...current, ...patch };
      await chromeApi.storage.local.set({ [key]: next });
      return next;
    },

    async clear() {
      await chromeApi.storage.local.remove(key);
    }
  };
}
