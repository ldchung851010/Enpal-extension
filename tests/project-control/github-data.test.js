import test from 'node:test';
import assert from 'node:assert/strict';
import { createGithubDataClient } from '../../docs/project-control/github-data.js';

test('loads raw project documents and normalized commit activity', async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    if (url.includes('/commits?')) {
      return {
        ok: true,
        json: async () => [{
          sha: 'abcdef123456',
          html_url: 'https://github.com/example/commit/abcdef123456',
          commit: {
            message: 'feat: finish task\n\nbody',
            author: { date: '2026-09-20T06:00:00Z' }
          }
        }]
      };
    }

    return {
      ok: true,
      text: async () => '# document'
    };
  };

  const client = createGithubDataClient({ fetchImpl });

  assert.equal(await client.loadPlan(), '# document');
  assert.equal(await client.loadEnglishSpec(), '# document');
  assert.equal(await client.loadVietnameseSpec(), '# document');
  const commits = await client.loadRecentCommits();
  assert.deepEqual(commits[0], {
    sha: 'abcdef1',
    message: 'feat: finish task',
    date: '2026-09-20T06:00:00Z',
    url: 'https://github.com/example/commit/abcdef123456'
  });
  assert.equal(calls.length, 4);
});

test('throws a source-specific error for a failed fetch', async () => {
  const client = createGithubDataClient({
    fetchImpl: async () => ({ ok: false, status: 503 })
  });

  await assert.rejects(client.loadPlan(), /implementation plan.*503/i);
});


test('cache-busts document URLs so refresh cannot reuse stale raw/main content', async () => {
  const calls = [];
  const client = createGithubDataClient({
    now: () => 123456,
    fetchImpl: async (url) => {
      calls.push(url);
      return { ok: true, text: async () => '# fresh document' };
    }
  });

  await client.loadPlan();

  assert.match(calls[0], /\?v=123456$/);
});


test('pins document fetches to the latest main commit after commit refresh', async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    if (url.includes('/commits?')) {
      return {
        ok: true,
        json: async () => [{
          sha: '1234567890abcdef',
          html_url: '#',
          commit: { message: 'latest', author: { date: '' } }
        }]
      };
    }
    return { ok: true, text: async () => '# pinned' };
  };

  const client = createGithubDataClient({ fetchImpl, now: () => 99 });
  await client.loadRecentCommits();
  await client.loadPlan();

  assert.match(
    calls.at(-1),
    /raw\.githubusercontent\.com\/ldchung851010\/Enpal-extension\/1234567890abcdef\//
  );
  assert.match(calls.at(-1), /\?v=99$/);
});
