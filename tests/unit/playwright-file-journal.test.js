import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';

import { createFileJournal } from '../../playwright/file-journal.js';

test('file journal persists, merges, and clears one workspace namespace', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'enpal-journal-'));
  t.after(async () => rm(root, { recursive: true, force: true }));

  const a = createFileJournal({ workspaceId: 'english', rootDir: root });
  const b = createFileJournal({ workspaceId: 'german', rootDir: root });

  assert.deepEqual(await a.read(), {});

  await a.write({ sessionId: 'S-1', phase: 'CHAT_BOUND' });
  await a.write({ learningReady: true });
  await b.write({ sessionId: 'S-B' });

  assert.deepEqual(await a.read(), {
    sessionId: 'S-1',
    phase: 'CHAT_BOUND',
    learningReady: true
  });
  assert.deepEqual(await b.read(), { sessionId: 'S-B' });

  await a.clear();
  assert.deepEqual(await a.read(), {});
  assert.deepEqual(await b.read(), { sessionId: 'S-B' });
});

test('file journal rejects unsafe workspace ids', () => {
  assert.throws(
    () => createFileJournal({ workspaceId: '../escape' }),
    /workspaceId/
  );
});
