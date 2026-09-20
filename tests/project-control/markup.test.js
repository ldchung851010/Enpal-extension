import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const htmlPath = 'docs/project-control/index.html';

test('dashboard markup exposes all required read-only sections and controls', () => {
  const html = fs.readFileSync(htmlPath, 'utf8');
  const requiredIds = [
    'overall-percent',
    'overall-progress',
    'step-count',
    'task-count',
    'current-task',
    'last-refresh',
    'refresh-now',
    'refresh-warning',
    'tasks-grid',
    'gates-list',
    'gate-summary',
    'plan-status',
    'spec-en-status',
    'spec-vi-status',
    'blockers-list',
    'acceptance-list',
    'commits-list'
  ];

  for (const id of requiredIds) {
    assert.match(html, new RegExp(`id=["']${id}["']`), `missing #${id}`);
  }

  assert.match(html, /type="module" src="\.\/dashboard\.js"/);
  assert.doesNotMatch(html, /<form\b/i);
});
