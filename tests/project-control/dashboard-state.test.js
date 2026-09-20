import test from 'node:test';
import assert from 'node:assert/strict';
import {
  deriveDashboardState,
  createDashboardController
} from '../../docs/project-control/dashboard.js';

test('derives overview from repository documents', () => {
  const state = deriveDashboardState({
    planMarkdown: `
**Status:** DRAFT FOR REVIEW

## Pre-Execution Gates
- [x] Gate one
- [ ] Gate two

### Task 1: A
- [x] one
- [ ] two
### Task 2: B
- [ ] one
`,
    enSpecMarkdown: '**Status:** APPROVED',
    viSpecMarkdown: '**Trạng thái:** ĐÃ DUYỆT',
    commits: [{ sha: 'abc1234', message: 'feat: A', date: '2026-09-20', url: '#' }]
  });

  assert.equal(state.overallPercent, 33);
  assert.equal(state.completedSteps, 1);
  assert.equal(state.totalSteps, 3);
  assert.equal(state.completedTasks, 0);
  assert.equal(state.totalTasks, 2);
  assert.equal(state.currentTask.title, 'A');
  assert.equal(state.implementationPlanStatus, 'DRAFT FOR REVIEW');
  assert.equal(state.englishSpecStatus, 'APPROVED');
  assert.equal(state.vietnameseSpecStatus, 'ĐÃ DUYỆT');
  assert.equal(state.gates.items.length, 2);
});

test('controller preserves the last good source when one refresh fails', async () => {
  let failPlan = false;
  const warnings = [];
  const states = [];
  const client = {
    async loadPlan() {
      if (failPlan) throw new Error('plan unavailable');
      return '### Task 1: A\n- [x] done';
    },
    async loadEnglishSpec() { return '**Status:** APPROVED'; },
    async loadVietnameseSpec() { return '**Trạng thái:** ĐÃ DUYỆT'; },
    async loadRecentCommits() { return []; }
  };

  const controller = createDashboardController({
    client,
    onState: (state) => states.push(state),
    onWarning: (message) => warnings.push(message),
    now: () => new Date('2026-09-20T06:00:00Z')
  });

  const first = await controller.refreshAll();
  assert.equal(first.overallPercent, 100);

  failPlan = true;
  const second = await controller.refreshDocuments();
  assert.equal(second.overallPercent, 100);
  assert.equal(states.length, 2);
  assert.match(warnings.at(-1), /plan unavailable/i);
});


test('initial plan failure does not invent zero progress', async () => {
  const states = [];
  const warnings = [];
  const controller = createDashboardController({
    client: {
      async loadPlan() { throw new Error('plan unavailable'); },
      async loadEnglishSpec() { return '**Status:** APPROVED'; },
      async loadVietnameseSpec() { return '**Trạng thái:** ĐÃ DUYỆT'; },
      async loadRecentCommits() { return []; }
    },
    onState: (state) => states.push(state),
    onWarning: (message) => warnings.push(message)
  });

  const result = await controller.refreshAll();
  assert.equal(result, null);
  assert.deepEqual(states, []);
  assert.match(warnings.at(-1), /plan unavailable/i);
});


test('malformed plan refresh preserves the last good progress', async () => {
  let malformed = false;
  const warnings = [];
  const controller = createDashboardController({
    expectedTaskCount: 1,
    client: {
      async loadPlan() {
        return malformed ? '# truncated plan' : '### Task 1: A\n- [x] done';
      },
      async loadEnglishSpec() { return '**Status:** APPROVED'; },
      async loadVietnameseSpec() { return '**Trạng thái:** ĐÃ DUYỆT'; },
      async loadRecentCommits() { return []; }
    },
    onWarning: (message) => warnings.push(message)
  });

  const first = await controller.refreshAll();
  assert.equal(first.overallPercent, 100);

  malformed = true;
  const second = await controller.refreshDocuments();
  assert.equal(second.overallPercent, 100);
  assert.match(warnings.at(-1), /expected 1 task/i);
});


test('commit API failure is non-critical and does not show a dashboard warning', async () => {
  const warnings = [];
  const controller = createDashboardController({
    client: {
      async loadPlan() { return '### Task 1: A\n- [x] done'; },
      async loadEnglishSpec() { return '**Status:** APPROVED'; },
      async loadVietnameseSpec() { return '**Trạng thái:** ĐÃ DUYỆT'; },
      async loadRecentCommits() { throw new Error('Commits HTTP 403'); }
    },
    onWarning: (message) => warnings.push(message)
  });

  const state = await controller.refreshAll();

  assert.equal(state.overallPercent, 100);
  assert.equal(warnings.at(-1), '');
});

test('commit refresh failure keeps last good commits and stays silent', async () => {
  let failCommits = false;
  const warnings = [];
  const controller = createDashboardController({
    client: {
      async loadPlan() { return '### Task 1: A\n- [x] done'; },
      async loadEnglishSpec() { return '**Status:** APPROVED'; },
      async loadVietnameseSpec() { return '**Trạng thái:** ĐÃ DUYỆT'; },
      async loadRecentCommits() {
        if (failCommits) throw new Error('Commits HTTP 403');
        return [{ sha: 'abc1234', message: 'ok', date: '', url: '#' }];
      }
    },
    onWarning: (message) => warnings.push(message)
  });

  const first = await controller.refreshAll();
  assert.equal(first.commits.length, 1);

  failCommits = true;
  const second = await controller.refreshCommits();

  assert.equal(second.commits.length, 1);
  assert.equal(warnings.at(-1), '');
});
