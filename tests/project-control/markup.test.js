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

  assert.doesNotMatch(html, /<link[^>]+dashboard\.css/i);
  assert.doesNotMatch(html, /<script[^>]+src=/i);
  assert.doesNotMatch(html, /type="module"/i);
  assert.match(html, /https:\/\/github\.com\/ldchung851010\/Enpal-extension/);
  assert.match(html, /https:\/\/github\.com\/ldchung851010\/Enpal-extension\/blob\/main\/docs\/superpowers\/plans\/2026-09-20-enpal-v1-implementation-plan\.md/);
  assert.match(html, /raw\.githubusercontent\.com\/ldchung851010\/Enpal-extension\/main/);
  assert.doesNotMatch(html, /href=["']#["']/);
  assert.match(html, /Platform gates theo từng phase/);
  assert.match(html, /Task 1–2 có thể bắt đầu/);
  assert.doesNotMatch(html, /<form\b/i);
});
