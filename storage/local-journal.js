const KEY = 'enpalRecovery';

export function createLocalJournal(chromeApi = chrome) {
  return {
    async read() {
      const result = await chromeApi.storage.local.get(KEY);
      return result[KEY] ?? {};
    },

    async write(patch) {
      const current = await this.read();
      const next = { ...current, ...patch };
      await chromeApi.storage.local.set({ [KEY]: next });
      return next;
    },

    async clear() {
      await chromeApi.storage.local.remove(KEY);
    }
  };
}
