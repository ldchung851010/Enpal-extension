# EnPal Project Control Dashboard V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a read-only HTML dashboard that automatically derives EnPal V1 project progress from the GitHub repository.

**Architecture:** Static HTML/CSS/vanilla JavaScript. The browser fetches the approved Implementation Plan and specs from `raw.githubusercontent.com`, fetches recent commits from the GitHub public REST API, parses stable Markdown conventions, and renders progress without storing a second project-state database.

**Tech Stack:** HTML5, CSS, vanilla JavaScript ES modules, browser `fetch`, Node.js `node:test`.

**Spec:** `docs/superpowers/specs/2026-09-20-enpal-project-control-dashboard-design.md`

## Global Constraints

- Dashboard is outside EnPal learner runtime.
- GitHub repository content is the only project-progress source of truth.
- No backend, login, database, localStorage project state, or Google Sheets sync.
- Vietnamese-first labels.
- Implementation Plan task/checklist parsing must drive progress.
- Auto-refresh plan/spec sources every 60 seconds and commit activity every 5 minutes.
- Network failure must preserve the last successfully rendered in-memory state.

## Review Focus

1. Markdown task parsing must still return exactly 16 tasks.
2. Checkboxes outside task/gate sections must not inflate implementation progress.
3. One failed GitHub fetch must not blank the whole dashboard.
4. `ENPAL_BLOCKED` must override derived task status to BLOCKED.
5. A plan checkbox commit must alter displayed progress without editing dashboard source.

---

### Task 1: Build the Markdown Parser

**Files:**
- Create: `docs/project-control/parser.js`
- Create: `tests/project-control/parser.test.js`

**Interfaces:**
- Produces: `parseImplementationPlan(markdown)`, `parseDocumentStatus(markdown, language)`.

- [x] **Step 1: Write failing parser tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseImplementationPlan,
  parseDocumentStatus
} from '../../docs/project-control/parser.js';

const plan = `
## Pre-Execution Gates
- [x] Gate A
- [ ] Gate B

### Task 1: First Task
- [x] Step 1
- [ ] Step 2

### Task 2: Second Task
<!-- ENPAL_BLOCKED: Waiting for access -->
- [ ] Step 1
`;

test('parses gates, tasks, progress, and blockers', () => {
  const result = parseImplementationPlan(plan);

  assert.equal(result.gates.total, 2);
  assert.equal(result.gates.completed, 1);
  assert.equal(result.tasks.length, 2);

  assert.deepEqual(result.tasks[0], {
    number: 1,
    title: 'First Task',
    completed: 1,
    total: 2,
    percent: 50,
    status: 'IN PROGRESS',
    blocker: null
  });

  assert.equal(result.tasks[1].status, 'BLOCKED');
  assert.equal(result.tasks[1].blocker, 'Waiting for access');
  assert.equal(result.implementation.completed, 1);
  assert.equal(result.implementation.total, 3);
});

test('parses approved English and Vietnamese statuses', () => {
  assert.equal(
    parseDocumentStatus('**Status:** APPROVED', 'en'),
    'APPROVED'
  );
  assert.equal(
    parseDocumentStatus('**Trạng thái:** ĐÃ DUYỆT', 'vi'),
    'ĐÃ DUYỆT'
  );
});
```

- [x] **Step 2: Run test and verify failure**

```bash
node --test tests/project-control/parser.test.js
```

Expected: FAIL because parser module does not exist.

- [x] **Step 3: Implement parser**

Implement these rules only:

```text
### Task N: TITLE
- [ ] incomplete
- [x] complete
<!-- ENPAL_BLOCKED: reason -->
```

Derived status:

```text
BLOCKED     if blocker exists
DONE        if completed === total and total > 0
IN PROGRESS if completed > 0
NOT STARTED otherwise
```

Overall implementation progress uses task checkboxes only.

- [x] **Step 4: Run test**

```bash
node --test tests/project-control/parser.test.js
```

Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add docs/project-control/parser.js tests/project-control/parser.test.js
git commit -m "feat: add project dashboard markdown parser"
```

---

### Task 2: Build the GitHub Data Client

**Files:**
- Create: `docs/project-control/github-data.js`
- Create: `tests/project-control/github-data.test.js`

**Interfaces:**
- Produces: `createGithubDataClient({ fetchImpl })`.
- Methods: `loadPlan()`, `loadEnglishSpec()`, `loadVietnameseSpec()`, `loadRecentCommits()`.

- [x] **Step 1: Write failing client test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGithubDataClient } from '../../docs/project-control/github-data.js';

test('loads raw project documents and normalized commit activity', async () => {
  const fetchImpl = async (url) => {
    if (url.includes('/commits?')) {
      return {
        ok: true,
        json: async () => [{
          sha: 'abcdef123456',
          html_url: 'https://github.com/example/commit/abcdef123456',
          commit: {
            message: 'feat: finish task',
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
  const commits = await client.loadRecentCommits();
  assert.deepEqual(commits[0], {
    sha: 'abcdef1',
    message: 'feat: finish task',
    date: '2026-09-20T06:00:00Z',
    url: 'https://github.com/example/commit/abcdef123456'
  });
});
```

- [x] **Step 2: Run test and verify failure**

```bash
node --test tests/project-control/github-data.test.js
```

Expected: FAIL.

- [x] **Step 3: Implement exact public GitHub endpoints**

Repository constants:

```js
const OWNER = 'ldchung851010';
const REPO = 'Enpal-extension';
const BRANCH = 'main';
```

Use raw URLs for:

```text
docs/superpowers/plans/2026-09-20-enpal-v1-implementation-plan.md
docs/superpowers/specs/2026-09-20-enpal-v1-technical-spec.md
docs/superpowers/specs/2026-09-20-enpal-v1-technical-spec-vi.md
```

Use GitHub REST:

```text
https://api.github.com/repos/ldchung851010/Enpal-extension/commits?per_page=8
```

Any non-OK response throws a source-specific error.

- [x] **Step 4: Run test**

```bash
node --test tests/project-control/github-data.test.js
```

Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add docs/project-control/github-data.js tests/project-control/github-data.test.js
git commit -m "feat: add project dashboard GitHub data client"
```

---

### Task 3: Build the Read-Only Dashboard UI

**Files:**
- Create: `docs/project-control/index.html`
- Create: `docs/project-control/dashboard.css`
- Create: `docs/project-control/dashboard.js`
- Create: `tests/project-control/dashboard-state.test.js`

**Interfaces:**
- Produces: `deriveDashboardState({ planMarkdown, enSpecMarkdown, viSpecMarkdown, commits })`.
- Browser entrypoint: `refreshDashboard()`.

- [x] **Step 1: Write failing state-derivation test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveDashboardState } from '../../docs/project-control/dashboard.js';

test('derives overview from repository documents', () => {
  const state = deriveDashboardState({
    planMarkdown: `
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
  assert.equal(state.completedTasks, 0);
  assert.equal(state.totalTasks, 2);
  assert.equal(state.englishSpecStatus, 'APPROVED');
  assert.equal(state.vietnameseSpecStatus, 'ĐÃ DUYỆT');
});
```

- [x] **Step 2: Run test and verify failure**

```bash
node --test tests/project-control/dashboard-state.test.js
```

Expected: FAIL.

- [x] **Step 3: Implement UI and in-memory refresh behavior**

Render sections:

```text
Tổng quan
16 Implementation Tasks
Platform Gates
Technical Governance
Tests / Acceptance
Risks / Blockers
Recent Activity
```

Use a single in-memory variable:

```js
let lastGoodState = null;
```

On successful refresh, replace it. On failed refresh, keep rendering `lastGoodState` and show:

```text
Không thể cập nhật dữ liệu mới
```

Do not write project state to localStorage.

Timers:

```js
setInterval(refreshProjectDocuments, 60_000);
setInterval(refreshCommits, 300_000);
```

Add a `Refresh now` button.

- [x] **Step 4: Run dashboard tests and full suite**

```bash
node --test tests/project-control/*.test.js
npm test
```

Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add docs/project-control tests/project-control
git commit -m "feat: build EnPal project control dashboard"
```

---

### Task 4: Wire Project Progress Updates and Publish Readiness

**Files:**
- Modify: `docs/superpowers/plans/2026-09-20-enpal-v1-implementation-plan.md`
- Create: `docs/project-control/README.md`
- Test: `tests/project-control/parser.test.js`

**Interfaces:**
- Project work updates the existing Implementation Plan checkboxes in the same implementation commit.
- Dashboard remains read-only.

- [x] **Step 1: Convert Pre-Execution Gates to checkboxes**

Change each numbered gate from:

```markdown
1. Gate text
```

to:

```markdown
- [ ] Gate text
```

Do not mark a gate complete unless verified.

- [x] **Step 2: Add parser regression against the real Implementation Plan**

In `tests/project-control/parser.test.js`, read the real plan file and assert:

```js
test('real EnPal implementation plan exposes exactly 16 tasks', () => {
  const markdown = fs.readFileSync(
    'docs/superpowers/plans/2026-09-20-enpal-v1-implementation-plan.md',
    'utf8'
  );
  const parsed = parseImplementationPlan(markdown);
  assert.equal(parsed.tasks.length, 16);
});
```

- [x] **Step 3: Document the update convention**

`docs/project-control/README.md` must state:

```text
When implementation work completes a plan step, change its checkbox
from [ ] to [x] in the same commit. The dashboard derives progress
automatically; never edit dashboard status manually.
```

Include local preview:

```bash
python3 -m http.server 8000 --directory docs/project-control
```

Then open:

```text
http://localhost:8000
```

- [x] **Step 4: Run all tests and local smoke test**

```bash
node --test tests/project-control/*.test.js
npm test
python3 -m http.server 8000 --directory docs/project-control
```

Verify manually:

- all 16 tasks appear;
- specs show approved status;
- recent commits appear;
- refresh button works;
- progress matches real plan checkboxes;
- disconnecting network shows stale-state warning without clearing existing UI.

- [x] **Step 5: Commit**

```bash
git add docs/project-control docs/superpowers/plans tests/project-control
git commit -m "chore: wire automatic EnPal project progress dashboard"
```

## Definition of Done

- Dashboard source is static HTML/CSS/JS only.
- It derives all task progress from the real GitHub Implementation Plan.
- It shows 16 tasks, gates, approved specs, blockers, tests, and recent commits.
- New implementation commits that update plan checkboxes change dashboard progress without editing dashboard code.
- Network failure preserves last good in-memory state.
- No second project-state database exists.
- Project Control remains completely outside EnPal runtime.
