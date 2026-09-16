import test from 'node:test';
import assert from 'node:assert/strict';
import { createLocalJournal } from '../../storage/local-journal.js';
import { makeFakeChrome } from '../helpers/fake-chrome.js';

test('checkpoint persists phase and timestamp', async () => {
  const chromeApi = makeFakeChrome();
  const journal = createLocalJournal(chromeApi, () => 12345);
  await journal.checkpoint('ANALYZE_REQUESTED');
  assert.deepEqual((await journal.load()).pipeline_phase, 'ANALYZE_REQUESTED');
  assert.equal((await journal.load()).updated_at, 12345);
});

test('clearActiveSession preserves setup configuration', async () => {
  const chromeApi = makeFakeChrome({
    enpal_journal_v1: {
      project_url:'https://chatgpt.com/g/g-p-enpal',
      active_session_id:'S1'
    }
  });
  const journal = createLocalJournal(chromeApi, () => 1);
  await journal.clearActiveSession();
  const state = await journal.load();
  assert.equal(state.project_url, 'https://chatgpt.com/g/g-p-enpal');
  assert.equal(state.active_session_id, null);
});
