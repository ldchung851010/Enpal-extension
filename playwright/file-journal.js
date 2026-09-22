import path from 'node:path';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';

function safeWorkspaceId(value) {
  const id = String(value ?? '').trim();
  if (!/^[A-Za-z0-9_-]+$/.test(id)) {
    throw new Error('workspaceId may contain only letters, numbers, hyphen, and underscore');
  }
  return id;
}

async function readJson(filePath) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return {};
    throw error;
  }
}

export function createFileJournal({
  workspaceId,
  rootDir = '.enpal/recovery'
} = {}) {
  const id = safeWorkspaceId(workspaceId);
  const filePath = path.resolve(rootDir, id + '.json');

  async function writeWhole(value) {
    await mkdir(path.dirname(filePath), { recursive: true });
    const tempPath = filePath + '.tmp-' + process.pid;
    await writeFile(tempPath, JSON.stringify(value, null, 2) + '\n', 'utf8');
    await rename(tempPath, filePath);
  }

  return {
    filePath,

    async read() {
      const value = await readJson(filePath);
      return value && typeof value === 'object' && !Array.isArray(value)
        ? { ...value }
        : {};
    },

    async write(patch) {
      const current = await this.read();
      const next = { ...current, ...patch };
      await writeWhole(next);
      return { ...next };
    },

    async clear() {
      await rm(filePath, { force: true });
    }
  };
}
