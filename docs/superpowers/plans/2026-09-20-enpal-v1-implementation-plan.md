# EnPal V1 Implementation Plan

**Status:** DRAFT FOR REVIEW

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the approved EnPal V1 Chrome Extension closed loop: setup → START/RESUME → Voice learning with optional Supervisor/Listening Mask → PAUSE or END → ANALYZE → UPDATE → Review Planner → Session Brief staging/promotion → READY, with deterministic recovery.

**Architecture:** Keep orchestration deterministic and testable in pure ES modules. Isolate all ChatGPT Web DOM/UI coupling behind one adapter/content-script boundary, all Google persistence behind repository modules, and all crash recovery behind durable Sheet state + `chrome.storage.local`. Manifest V3 service-worker work stays short/event-driven; no correctness depends on worker lifetime.

**Tech Stack:** Manifest V3, vanilla JavaScript ES modules, Chrome Extension APIs, Chrome Identity OAuth, Google Sheets API v4, Node.js built-in `node:test`, ChatGPT Web adapter/content script.

**Spec:** `docs/superpowers/specs/2026-09-20-enpal-v1-technical-spec.md`  
**Vietnamese Spec:** `docs/superpowers/specs/2026-09-20-enpal-v1-technical-spec-vi.md`

## Global Constraints

- Supported runtime: desktop Chrome + ChatGPT Web + configured Google Workspace files.
- No EnPal backend/server.
- No Observer LLM service.
- No scraping/parsing ChatGPT assistant prose as machine output.
- Google Sheets is durable runtime truth; `chrome.storage.local` is recovery journal only.
- Curriculum Sheet is the canonical fixed Base Lesson source.
- At most one active logical Session at a time.
- One Session has one authoritative bound `chat_url`.
- Session Brief uses `ACTIVE` + temporary `_STAGING`; staging promotion must be atomic.
- Required Listening Mask failure is fail-closed.
- Supervisor failure is fail-open.
- Rename failure is fail-open.
- `ENPAL_CONTROL` traffic is excluded from pedagogical evidence.
- Runtime sources use exact configured/allowlisted IDs or URLs; never discover by title.
- Manifest V3 service-worker lifetime must not be required for correctness.
- Use TDD for every implementation task; run the focused test before and after implementation.
- Keep vanilla JavaScript; do not introduce a framework or build step unless the approved spec is revised first.

## Pre-Execution Gates

These are **phase gates**, not a single all-or-nothing blocker before Task 1. This resolves the earlier circular dependency where Extension OAuth was required before the task that implements OAuth.

Current gate record:

- [ ] Target ChatGPT Project reads the exact canonical Teacher Role, Teaching Method, Session Brief, Curriculum, Review Ledger, and EnPal Database sources. — **OPEN: live Project reconfirmation required**
- [ ] Target ChatGPT Project can perform the required runtime Google Sheet writes without a manual approval dialog on every lesson transaction. — **OPEN: prior spike was conditional; exact target flow still requires live proof**
- [x] Extension Google OAuth can read/write the configured runtime Sheets. — **PASS 2026-09-20: live loaded-extension OAuth succeeded; CURRICULUM read returned HTTP 200; temporary test sheet was created, written, read back, and deleted successfully**
- [x] Voice START/STOP works with the trusted semantic mechanism. — **PASS from verified spike; reconfirm during live adapter/E2E acceptance**
- [x] Listening Mask prevents protected text exposure. — **PASS from verified spike; reconfirm during protected Listening E2E**
- [x] Runtime contracts START, PAUSE, END, ANALYZE, UPDATE, Review Planner, Supervisor, Teacher Role, Speaking Method, Listening Method, Session Brief, and exact-source registry are aligned with the approved spec. — **PASS 2026-09-20**
- [x] Production Google OAuth client ID for this Chrome Extension is available before Task 3 manifest configuration. — **PASS 2026-09-20: production Chrome Extension OAuth client is configured for stable Extension ID `lnnnbbkifillljlhcpaekmjaemljlmkd`**
- [x] Supervisor runtime contract supports fail-open DEGRADED mode when no verified live decision transport exists; a separate Observer/backend is not introduced. — **PASS**

Canonical source registry:
- Google Doc: `EnPal_Runtime_Source_Registry_V1`
- ID: `1Pov9MX_39iACYdt1ccEsOE9NJucJSlxoKuT_87vb44w`

Gate timing:
- **Task 1–2:** may proceed with contract alignment complete.
- **Task 3:** requires the production OAuth client ID before manifest configuration is finalized.
- **Task 4 and later Google integration:** may proceed; live Extension OAuth read/write verification passed on 2026-09-20.
- **Live ChatGPT Adapter / START / END acceptance:** requires the two target-Project read/write gates above.
- **Final release:** requires all gates plus the full live E2E acceptance checklist.

If any correctness-critical live gate fails, stop the affected integration phase and revisit the architecture. Never add assistant-output scraping as a fallback.

## File Structure to Build

```text
enpal-extension/
├── manifest.json
├── background/
│   ├── service-worker.js
│   └── voice-debugger.js
├── sidepanel/
│   ├── index.html
│   ├── sidepanel.css
│   ├── sidepanel.js
│   └── view-model.js
├── content/
│   └── chatgpt-runtime.js
├── adapters/
│   └── chatgpt-adapter.js
├── core/
│   ├── config.js
│   ├── control-envelope.js
│   ├── errors.js
│   ├── state.js
│   ├── recovery.js
│   └── workflow.js
├── storage/
│   ├── google-auth.js
│   ├── sheets-client.js
│   ├── curriculum-repository.js
│   ├── session-repository.js
│   ├── session-brief-repository.js
│   ├── review-ledger-repository.js
│   └── local-journal.js
├── supervisor/
│   └── supervisor-controller.js
├── listening/
│   └── listening-mask-controller.js
└── tests/
    ├── helpers/
    │   ├── fake-chrome.js
    │   ├── fake-chatgpt-adapter.js
    │   ├── fake-repositories.js
    │   └── load-classic-script.js
    ├── unit/
    ├── integration/
    └── live/
```

## Review Focus

1. Crash after ChatGPT creates a chat but before `chat_url` commit: keep the same `session_id`, recover the saved tab when safe, otherwise allow only an unbound orphan and create one replacement authoritative binding.
2. Two durable active Sessions: enter consistency ERROR and never choose one heuristically.
3. Protected Listening when masking cannot be confirmed: START/RESUME must fail closed before any control message can expose content.
4. Supervisor initialization/runtime failure: lesson continues in degraded mode and no fabricated decision is emitted.
5. END restarted after UPDATE or Session Brief promotion: do not apply Review Ledger twice, do not advance curriculum twice, and do not overwrite a valid ACTIVE brief with partial staging.

---

### Task 1: Lock Runtime State, Configuration, and Error Contracts

**Files:**
- Modify: `core/state.js`
- Create: `core/config.js`
- Create: `core/errors.js`
- Test: `tests/unit/state.test.js`
- Test: `tests/unit/config.test.js`
- Test: `tests/unit/errors.test.js`

**Interfaces:**
- Produces: `APP_STATES`, `SESSION_STATES`, `PIPELINE_PHASES`, `loadRuntimeConfig(raw)`, `EnpalError`, `ERROR_CODES`.
- Consumed by: every later workflow, repository, adapter, and UI task.

- [x] **Step 1: Expand the failing state-contract test**

Replace `tests/unit/state.test.js` with:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  APP_STATES,
  SESSION_STATES,
  PIPELINE_PHASES
} from '../../core/state.js';

test('exports approved app states', () => {
  assert.deepEqual(APP_STATES, [
    'SETUP_REQUIRED', 'READY', 'LEARNING', 'PAUSED', 'PROCESSING', 'ERROR'
  ]);
});

test('exports non-terminal session states used by one-active-session invariant', () => {
  assert.deepEqual(SESSION_STATES, [
    'STARTING', 'IN_PROGRESS', 'PAUSED', 'PROCESSING', 'COMPLETED', 'ERROR'
  ]);
});

test('exports durable pipeline phases in approved order', () => {
  assert.deepEqual(PIPELINE_PHASES, [
    'SESSION_STUB_CREATED',
    'CHAT_BOUND',
    'PAUSE_COMMITTED',
    'ANALYZE_COMMITTED',
    'UPDATE_COMMITTED',
    'BRIEF_STAGED',
    'BRIEF_PROMOTED',
    'SESSION_COMPLETED'
  ]);
});
```

- [x] **Step 2: Add failing config and error tests**

Create `tests/unit/config.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadRuntimeConfig } from '../../core/config.js';

const valid = {
  projectUrl: 'https://chatgpt.com/g/example-project',
  curriculumSpreadsheetId: 'curriculum-id',
  databaseSpreadsheetId: 'database-id',
  sessionBriefSpreadsheetId: 'brief-id',
  reviewLedgerSpreadsheetId: 'review-id',
  teacherRoleUrl: 'https://drive.google.com/file/d/teacher/view',
  speakingMethodUrl: 'https://drive.google.com/file/d/speaking/view',
  listeningMethodUrl: 'https://drive.google.com/file/d/listening/view'
};

test('accepts exact configured runtime sources', () => {
  assert.deepEqual(loadRuntimeConfig(valid), valid);
});

test('rejects missing required IDs instead of discovering files by title', () => {
  assert.throws(() => loadRuntimeConfig({ ...valid, curriculumSpreadsheetId: '' }), {
    message: /curriculumSpreadsheetId/
  });
});
```

Create `tests/unit/errors.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { EnpalError, ERROR_CODES } from '../../core/errors.js';

test('structured errors preserve code and recoverability', () => {
  const error = new EnpalError(ERROR_CODES.SHEET_WRITE_UNVERIFIED, 'write failed', true);
  assert.equal(error.code, 'SHEET_WRITE_UNVERIFIED');
  assert.equal(error.recoverable, true);
});
```

- [x] **Step 3: Run tests and confirm failure**

Run:

```bash
npm run test:unit
```

Expected: FAIL because the new exports/modules do not exist.

- [x] **Step 4: Implement the minimal contracts**

Set `core/state.js` to:

```js
export const APP_STATES = Object.freeze([
  'SETUP_REQUIRED', 'READY', 'LEARNING', 'PAUSED', 'PROCESSING', 'ERROR'
]);

export const SESSION_STATES = Object.freeze([
  'STARTING', 'IN_PROGRESS', 'PAUSED', 'PROCESSING', 'COMPLETED', 'ERROR'
]);

export const PIPELINE_PHASES = Object.freeze([
  'SESSION_STUB_CREATED',
  'CHAT_BOUND',
  'PAUSE_COMMITTED',
  'ANALYZE_COMMITTED',
  'UPDATE_COMMITTED',
  'BRIEF_STAGED',
  'BRIEF_PROMOTED',
  'SESSION_COMPLETED'
]);

export const ACTIVE_SESSION_STATES = Object.freeze([
  'STARTING', 'IN_PROGRESS', 'PAUSED', 'PROCESSING'
]);
```

Create `core/config.js`:

```js
const REQUIRED = [
  'projectUrl',
  'curriculumSpreadsheetId',
  'databaseSpreadsheetId',
  'sessionBriefSpreadsheetId',
  'reviewLedgerSpreadsheetId',
  'teacherRoleUrl',
  'speakingMethodUrl',
  'listeningMethodUrl'
];

export function loadRuntimeConfig(raw) {
  const config = { ...raw };
  for (const key of REQUIRED) {
    if (typeof config[key] !== 'string' || config[key].trim() === '') {
      throw new Error(`Missing required runtime config: ${key}`);
    }
  }
  return config;
}
```

Create `core/errors.js`:

```js
export const ERROR_CODES = Object.freeze({
  SETUP_REQUIRED: 'SETUP_REQUIRED',
  CONSISTENCY_ERROR: 'CONSISTENCY_ERROR',
  WRONG_CHAT: 'WRONG_CHAT',
  MASK_REQUIRED: 'MASK_REQUIRED',
  SHEET_READ_FAILED: 'SHEET_READ_FAILED',
  SHEET_WRITE_UNVERIFIED: 'SHEET_WRITE_UNVERIFIED',
  VOICE_START_FAILED: 'VOICE_START_FAILED',
  VOICE_STOP_FAILED: 'VOICE_STOP_FAILED',
  CHAT_UI_UNAVAILABLE: 'CHAT_UI_UNAVAILABLE'
});

export class EnpalError extends Error {
  constructor(code, message, recoverable = false) {
    super(message);
    this.name = 'EnpalError';
    this.code = code;
    this.recoverable = recoverable;
  }
}
```

- [x] **Step 5: Run tests and commit**

Run:

```bash
npm run test:unit
```

Expected: PASS.

Commit:

```bash
git add core tests/unit
git commit -m "feat: define EnPal V1 runtime contracts"
```

---

### Task 2: Implement the Recovery Journal

**Files:**
- Create: `storage/local-journal.js`
- Modify: `tests/helpers/fake-chrome.js`
- Create: `tests/unit/local-journal.test.js`

**Interfaces:**
- Consumes: Chrome `storage.local`.
- Produces: `createLocalJournal(chromeApi)` with `read()`, `write(patch)`, `clear()`.
- Journal key: `enpalRecovery`.

- [x] **Step 1: Write the failing journal test**

Create `tests/unit/local-journal.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeFakeChrome } from '../helpers/fake-chrome.js';
import { createLocalJournal } from '../../storage/local-journal.js';

test('persists recoverable workflow intent under one namespaced key', async () => {
  const chromeApi = makeFakeChrome();
  const journal = createLocalJournal(chromeApi);

  await journal.write({
    appState: 'PROCESSING',
    sessionId: 'S-001',
    phase: 'ANALYZE_COMMITTED',
    pendingTabId: 42
  });

  assert.deepEqual(await journal.read(), {
    appState: 'PROCESSING',
    sessionId: 'S-001',
    phase: 'ANALYZE_COMMITTED',
    pendingTabId: 42
  });
});

test('patches without erasing existing recovery fields', async () => {
  const chromeApi = makeFakeChrome({
    enpalRecovery: { sessionId: 'S-001', phase: 'SESSION_STUB_CREATED' }
  });
  const journal = createLocalJournal(chromeApi);

  await journal.write({ pendingTabId: 7 });

  assert.deepEqual(await journal.read(), {
    sessionId: 'S-001',
    phase: 'SESSION_STUB_CREATED',
    pendingTabId: 7
  });
});

test('clear removes only EnPal recovery state', async () => {
  const chromeApi = makeFakeChrome({
    enpalRecovery: { sessionId: 'S-001' },
    unrelated: 'keep'
  });
  const journal = createLocalJournal(chromeApi);

  await journal.clear();

  assert.equal(chromeApi.__storage.unrelated, 'keep');
  assert.equal(chromeApi.__storage.enpalRecovery, undefined);
});
```

- [x] **Step 2: Run the focused test and confirm failure**

Run:

```bash
node --test tests/unit/local-journal.test.js
```

Expected: FAIL because `storage/local-journal.js` does not exist.

- [x] **Step 3: Implement the journal**

Create `storage/local-journal.js`:

```js
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
```

- [x] **Step 4: Run focused + unit tests**

Run:

```bash
node --test tests/unit/local-journal.test.js
npm run test:unit
```

Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add storage/local-journal.js tests/helpers/fake-chrome.js tests/unit/local-journal.test.js
git commit -m "feat: add durable local recovery journal"
```

---

### Task 3: Add Chrome Identity OAuth and a Thin Sheets Client

**Files:**
- Modify: `manifest.json`
- Create: `storage/google-auth.js`
- Create: `storage/sheets-client.js`
- Modify: `tests/helpers/fake-chrome.js`
- Create: `tests/unit/google-auth.test.js`
- Create: `tests/unit/sheets-client.test.js`

**Interfaces:**
- Produces: `getGoogleAccessToken(chromeApi, interactive)`.
- Produces: `createSheetsClient({ getToken, fetchImpl })` with `getValues()`, `updateValues()`, `batchUpdate()`.
- Consumed by: all Google repositories.

- [x] **Step 1: Write failing OAuth and HTTP tests**

Create `tests/unit/google-auth.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { getGoogleAccessToken } from '../../storage/google-auth.js';

test('requests non-interactive token during normal runtime', async () => {
  let received;
  const chromeApi = {
    identity: {
      async getAuthToken(options) {
        received = options;
        return { token: 'abc' };
      }
    }
  };

  assert.equal(await getGoogleAccessToken(chromeApi, false), 'abc');
  assert.deepEqual(received, { interactive: false });
});
```

Create `tests/unit/sheets-client.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSheetsClient } from '../../storage/sheets-client.js';

test('reads an exact spreadsheet range with bearer auth', async () => {
  const calls = [];
  const client = createSheetsClient({
    getToken: async () => 'token-1',
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return { ok: true, json: async () => ({ values: [['READY']] }) };
    }
  });

  const result = await client.getValues('sheet-1', 'ACTIVE!A1:B2');

  assert.deepEqual(result, [['READY']]);
  assert.match(calls[0].url, /spreadsheets\/sheet-1\/values\/ACTIVE/);
  assert.equal(calls[0].options.headers.Authorization, 'Bearer token-1');
});
```

- [x] **Step 2: Run focused tests and confirm failure**

```bash
node --test tests/unit/google-auth.test.js tests/unit/sheets-client.test.js
```

Expected: FAIL because modules do not exist.

- [x] **Step 3: Implement OAuth + Sheets client**

Create `storage/google-auth.js`:

```js
export async function getGoogleAccessToken(chromeApi = chrome, interactive = false) {
  const result = await chromeApi.identity.getAuthToken({ interactive });
  const token = typeof result === 'string' ? result : result?.token;
  if (!token) throw new Error('Google OAuth token unavailable');
  return token;
}
```

Create `storage/sheets-client.js` with URL encoding and one request helper:

```js
const BASE = 'https://sheets.googleapis.com/v4/spreadsheets';

export function createSheetsClient({ getToken, fetchImpl = fetch }) {
  async function request(url, options = {}) {
    const token = await getToken();
    const response = await fetchImpl(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(options.headers ?? {})
      }
    });

    if (!response.ok) {
      throw new Error(`Google Sheets request failed: ${response.status ?? 'unknown'}`);
    }
    return response.json();
  }

  return {
    async getValues(spreadsheetId, range) {
      const data = await request(
        `${BASE}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}`
      );
      return data.values ?? [];
    },

    async updateValues(spreadsheetId, range, values) {
      return request(
        `${BASE}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}?valueInputOption=RAW`,
        { method: 'PUT', body: JSON.stringify({ values }) }
      );
    },

    async batchUpdate(spreadsheetId, requests) {
      return request(
        `${BASE}/${encodeURIComponent(spreadsheetId)}:batchUpdate`,
        { method: 'POST', body: JSON.stringify({ requests }) }
      );
    }
  };
}
```

**Execution note (2026-09-20):** OAuth + Sheets client implementation is complete. The manifest is pinned to stable Extension ID `lnnnbbkifillljlhcpaekmjaemljlmkd` via the public `key`, and uses the production Chrome OAuth client `75024264025-jfk5jl6gip980b1fubg5jvmsnsdbqcf5.apps.googleusercontent.com`. Live extension verification also passed: interactive OAuth succeeded, `CURRICULUM!A1:B3` read returned HTTP 200, and a temporary sheet was created, written with `ENPAL_WRITE_OK`, read back, then deleted successfully.

Modify `manifest.json` to:
- remove the unused generic `https://www.googleapis.com/*` host permission;
- add `oauth2.scopes = ["https://www.googleapis.com/auth/spreadsheets"]`;
- set `oauth2.client_id` to the **actual production Chrome Extension OAuth client ID established by Pre-Execution Gate 7**.

Before editing the manifest, run this explicit gate in the execution environment:

```bash
test -n "$ENPAL_GOOGLE_OAUTH_CLIENT_ID" || {
  echo "ENPAL_GOOGLE_OAUTH_CLIENT_ID is required before Task 3"
  exit 1
}
case "$ENPAL_GOOGLE_OAUTH_CLIENT_ID" in
  *.apps.googleusercontent.com) ;;
  *) echo "OAuth client ID must end in .apps.googleusercontent.com"; exit 1 ;;
esac
```

Then set that exact literal value in `manifest.json`. The value is an OAuth client identifier, not a secret; do not invent or commit a fake value.

- [x] **Step 4: Run tests**

```bash
node --test tests/unit/google-auth.test.js tests/unit/sheets-client.test.js
npm run test:unit
```

Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add manifest.json storage tests
git commit -m "feat: add Google OAuth and Sheets client"
```

---

### Task 4: Implement Durable Data Repositories

**Files:**
- Create: `storage/curriculum-repository.js`
- Create: `storage/session-repository.js`
- Create: `storage/session-brief-repository.js`
- Create: `storage/review-ledger-repository.js`
- Create: `tests/unit/curriculum-repository.test.js`
- Create: `tests/unit/session-repository.test.js`
- Create: `tests/unit/session-brief-repository.test.js`
- Create: `tests/unit/review-ledger-repository.test.js`

**Execution note (2026-09-20):** canonical workbook schema was read back before commit. The real `Sessions` tab uses `lifecycle_status` and `pipeline_phase`; the repository normalizes these to `status`/`phase` for workflow code while writing the canonical columns. `ACTIVE`/`_STAGING` sheet IDs are supplied explicitly from workbook metadata; no title discovery is used.

**Interfaces:**
- `createCurriculumRepository({ sheets, spreadsheetId })`: `getLesson(sequence)`, `getNextLesson(completedSequences)`.
- `createSessionRepository({ sheets, spreadsheetId })`: `listActive()`, `createStartingSession()`, `bindChat()`, `markState()`, `getById()`.
- `createSessionBriefRepository({ sheets, spreadsheetId })`: `readActive()`, `readStaging()`, `verifyStaging()`, `promoteStaging()`.
- `createReviewLedgerRepository({ sheets, spreadsheetId })`: `readAll()` only; durable UPDATE completion is verified on the active Session phase marker after ChatGPT has verified its Review Ledger write.

- [x] **Step 1: Write the failing repository tests**

Create concrete repository tests using in-memory fake Sheets clients.

`tests/unit/curriculum-repository.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createCurriculumRepository } from '../../storage/curriculum-repository.js';

test('curriculum chooses the smallest sequence not completed', async () => {
  const sheets = {
    async getValues() {
      return [
        ['curriculum_version', 'curriculum_sequence', 'lesson_id', 'primary_skill'],
        ['v1', '1', 'L1', 'Speaking'],
        ['v1', '2', 'L2', 'Listening'],
        ['v1', '3', 'L3', 'Speaking']
      ];
    }
  };
  const repo = createCurriculumRepository({ sheets, spreadsheetId: 'curriculum' });
  const lesson = await repo.getNextLesson([1, 2]);
  assert.equal(lesson.lesson_id, 'L3');
  assert.equal(lesson.curriculum_sequence, 3);
});
```

`tests/unit/session-repository.test.js` must include:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSessionRepository } from '../../storage/session-repository.js';

test('rejects more than one durable active session', async () => {
  const sheets = {
    async getValues() {
      return [
        ['session_id', 'status', 'chat_url'],
        ['S-001', 'PAUSED', 'https://chatgpt.com/c/1'],
        ['S-002', 'IN_PROGRESS', 'https://chatgpt.com/c/2']
      ];
    }
  };
  const repo = createSessionRepository({ sheets, spreadsheetId: 'db' });
  await assert.rejects(repo.listActive(), (error) => error.code === 'CONSISTENCY_ERROR');
});

test('bindChat is idempotent for the same authoritative URL', async () => {
  let writes = 0;
  const sheets = {
    async getValues() {
      return [
        ['session_id', 'status', 'chat_url'],
        ['S-001', 'STARTING', 'https://chatgpt.com/c/1']
      ];
    },
    async updateValues() {
      writes += 1;
    }
  };
  const repo = createSessionRepository({ sheets, spreadsheetId: 'db' });
  const result = await repo.bindChat('S-001', 'https://chatgpt.com/c/1');
  assert.equal(result.chat_url, 'https://chatgpt.com/c/1');
  assert.equal(writes, 0);
});

test('bindChat rejects a conflicting second URL', async () => {
  const sheets = {
    async getValues() {
      return [
        ['session_id', 'status', 'chat_url'],
        ['S-001', 'STARTING', 'https://chatgpt.com/c/1']
      ];
    }
  };
  const repo = createSessionRepository({ sheets, spreadsheetId: 'db' });
  await assert.rejects(
    repo.bindChat('S-001', 'https://chatgpt.com/c/2'),
    /already bound/
  );
});
```

`tests/unit/session-brief-repository.test.js` must include:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSessionBriefRepository } from '../../storage/session-brief-repository.js';

test('staging verification rejects curriculum identity mismatch', async () => {
  const sheets = {
    async getValues() {
      return [
        ['key', 'value'],
        ['curriculum_version', 'v1'],
        ['curriculum_sequence', '3'],
        ['lesson_id', 'L-WRONG'],
        ['status', 'READY'],
        ['Primary Skill', 'Speaking'],
        ['Communicative Goal', 'Explain a root cause']
      ];
    }
  };
  const repo = createSessionBriefRepository({
    sheets,
    spreadsheetId: 'brief',
    activeSheetId: 1,
    stagingSheetId: 2
  });
  await assert.rejects(
    repo.verifyStaging({ curriculum_version: 'v1', curriculum_sequence: 3, lesson_id: 'L3' }),
    /identity mismatch/
  );
});

test('promotion is one atomic batchUpdate call', async () => {
  const calls = [];
  const sheets = {
    async batchUpdate(spreadsheetId, requests) {
      calls.push({ spreadsheetId, requests });
      return { replies: [] };
    }
  };
  const repo = createSessionBriefRepository({
    sheets,
    spreadsheetId: 'brief',
    activeSheetId: 1,
    stagingSheetId: 2
  });
  await repo.promoteStaging({ rowCount: 12, columnCount: 2 });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].spreadsheetId, 'brief');
  assert.equal(calls[0].requests.length, 3);
});
```

`tests/unit/review-ledger-repository.test.js` must verify `readAll()` maps headers to rows without mutating review state; UPDATE commit verification belongs to the Session durable phase marker, not to a second Review Ledger marker.

Use an inline fake `sheets` object in each test; do not hit Google.

- [x] **Step 2: Run repository tests and confirm failure**

```bash
node --test tests/unit/*repository.test.js
```

Expected: FAIL because repository modules do not exist.

- [x] **Step 3: Implement repositories with explicit row mapping**

Use one header-row mapper per repository:

```js
function rowsToObjects(values) {
  const [headers = [], ...rows] = values;
  return rows.map((row) =>
    Object.fromEntries(headers.map((header, index) => [header, row[index] ?? '']))
  );
}
```

For Session Brief promotion, implement `promoteStaging()` as exactly one `sheets.batchUpdate(spreadsheetId, requests)` call whose requests:

1. clear ACTIVE values;
2. copy the verified staging grid into ACTIVE;
3. clear staging values.

The exact sheet IDs/ranges are read from the workbook metadata/config produced during setup; never search by file title.

- [x] **Step 4: Run repository tests**

```bash
node --test tests/unit/*repository.test.js
npm run test:unit
```

Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add storage tests/unit
git commit -m "feat: add EnPal durable data repositories"
```

---

### Task 5: Define ENPAL_CONTROL and the ChatGPT Adapter Boundary

**Files:**
- Create: `core/control-envelope.js`
- Create: `adapters/chatgpt-adapter.js`
- Create: `content/chatgpt-runtime.js`
- Create: `tests/helpers/fake-chatgpt-adapter.js`
- Create: `tests/unit/control-envelope.test.js`
- Create: `tests/unit/chatgpt-adapter.test.js`
- Create: `tests/unit/chatgpt-runtime.test.js`
- Modify: `manifest.json`

**Interfaces:**
- `makeControl({ type, sessionId, body })` returns deterministic `ENPAL_CONTROL` text envelope.
- `createChatGptAdapter(chromeApi)` exposes:
  - `openProject(projectUrl)`
  - `createConversation(tabId)`
  - `openConversation(url)`
  - `sendControl(tabId, controlText)`
  - `waitUntilIdle(tabId)`
  - `getConversationUrl(tabId)`
  - `startVoice(tabId)`
  - `stopVoice(tabId)`
  - `renameConversation(tabId, title)`
  - `getRealtimeFeed(tabId)`
- Content script owns only DOM/UI semantics; workflow code never receives selectors.

- [x] **Step 1: Write the failing control-envelope test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeControl, isEnpalControl } from '../../core/control-envelope.js';

test('creates a deterministic ENPAL_CONTROL envelope', () => {
  const text = makeControl({
    type: 'PAUSE',
    sessionId: 'S-001',
    body: 'Create and persist the Pause Checkpoint.'
  });

  assert.match(text, /^ENPAL_CONTROL\n/);
  assert.match(text, /type=PAUSE/);
  assert.match(text, /session_id=S-001/);
  assert.equal(isEnpalControl(text), true);
});
```

- [x] **Step 2: Write adapter/runtime message tests**

Test that adapter methods send named messages such as:

```js
{ target: 'ENPAL_CHATGPT', action: 'WAIT_IDLE' }
{ target: 'ENPAL_CHATGPT', action: 'SEND_CONTROL', text: controlText }
{ target: 'ENPAL_CHATGPT', action: 'GET_CONVERSATION_URL' }
```

Test the classic content script with `loadClassicScript()` and a fake `chrome.runtime.onMessage` listener so each action returns structured results rather than raw DOM text.

- [x] **Step 3: Run tests and confirm failure**

```bash
node --test tests/unit/control-envelope.test.js tests/unit/chatgpt-adapter.test.js tests/unit/chatgpt-runtime.test.js
```

Expected: FAIL.

- [x] **Step 4: Implement the boundary**

`core/control-envelope.js`:

```js
export function makeControl({ type, sessionId, body }) {
  return [
    'ENPAL_CONTROL',
    `type=${type}`,
    `session_id=${sessionId}`,
    'BEGIN_BODY',
    body,
    'END_BODY',
    'END_ENPAL_CONTROL'
  ].join('\n');
}

export function isEnpalControl(text) {
  return typeof text === 'string' && text.startsWith('ENPAL_CONTROL\n');
}
```

Add `content/chatgpt-runtime.js` as a manifest content script for `https://chatgpt.com/*`. Keep all selector/DOM knowledge inside that file. Responses must use structured shapes such as:

```js
{ ok: true, idle: true }
{ ok: true, url: location.href }
{ ok: false, code: 'CHAT_UI_UNAVAILABLE' }
```

Never return assistant message text for workflow parsing.

- [x] **Step 5: Run tests and commit**

```bash
node --test tests/unit/control-envelope.test.js tests/unit/chatgpt-adapter.test.js tests/unit/chatgpt-runtime.test.js
npm run test:unit
git add core adapters content manifest.json tests
git commit -m "feat: isolate ChatGPT Web adapter and control envelope"
```

---

### Task 6: Isolate Trusted Voice Activation and Listening Mask

**Files:**
- Create: `background/voice-debugger.js`
- Modify: `background/service-worker.js`
- Create: `listening/listening-mask-controller.js`
- Modify: `content/chatgpt-runtime.js`
- Create: `tests/unit/voice-debugger.test.js`
- Create: `tests/unit/listening-mask-controller.test.js`

**Interfaces:**
- `activateFocusedControlWithDebugger(chromeApi, tabId)`.
- `createListeningMaskController(chatGptAdapter)`: `arm(tabId)`, `disarm(tabId)`.
- Background message: `ENPAL_TRUSTED_ACTIVATE`.

- [x] **Step 1: Write failing debugger cleanup test**

Test the exact invariant:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { activateFocusedControlWithDebugger } from '../../background/voice-debugger.js';

test('always detaches debugger after trusted activation failure', async () => {
  let detachCount = 0;
  const chromeApi = {
    debugger: {
      async attach() {},
      async sendCommand() {
        throw new Error('dispatch failed');
      },
      async detach() {
        detachCount += 1;
      }
    }
  };

  await assert.rejects(
    activateFocusedControlWithDebugger(chromeApi, 9),
    /dispatch failed/
  );
  assert.equal(detachCount, 1);
});
```

- [x] **Step 2: Write failing mask tests**

Create concrete controller tests:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createListeningMaskController } from '../../listening/listening-mask-controller.js';

test('arm confirms protected state before START can continue', async () => {
  const adapter = {
    async setListeningMask() {
      return { ok: true, armed: true };
    }
  };
  const mask = createListeningMaskController(adapter);
  assert.deepEqual(await mask.arm(4), { armed: true });
});

test('required mask failure is surfaced as MASK_REQUIRED', async () => {
  const adapter = {
    async setListeningMask() {
      return { ok: false, armed: false };
    }
  };
  const mask = createListeningMaskController(adapter);
  await assert.rejects(mask.arm(4), (error) => error.code === 'MASK_REQUIRED');
});

test('pause does not disarm the mask', async () => {
  const calls = [];
  const adapter = {
    async setListeningMask(tabId, armed) {
      calls.push({ tabId, armed });
      return { ok: true, armed };
    }
  };
  const mask = createListeningMaskController(adapter);
  await mask.arm(4);
  assert.deepEqual(calls, [{ tabId: 4, armed: true }]);
});
```

- [x] **Step 3: Run focused tests and confirm failure**

```bash
node --test tests/unit/voice-debugger.test.js tests/unit/listening-mask-controller.test.js
```

Expected: FAIL.

- [x] **Step 4: Implement minimal debugger + mask controller**

`background/voice-debugger.js` must use `try/finally`:

```js
export async function activateFocusedControlWithDebugger(chromeApi, tabId) {
  const target = { tabId };
  await chromeApi.debugger.attach(target, '1.3');
  try {
    await chromeApi.debugger.sendCommand(target, 'Input.dispatchKeyEvent', {
      type: 'keyDown',
      key: 'Enter',
      code: 'Enter',
      windowsVirtualKeyCode: 13
    });
    await chromeApi.debugger.sendCommand(target, 'Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: 'Enter',
      code: 'Enter',
      windowsVirtualKeyCode: 13
    });
  } finally {
    await chromeApi.debugger.detach(target).catch(() => {});
  }
}
```

Mask controller delegates DOM work to the ChatGPT content runtime and requires a positive `{ armed: true }` acknowledgment before returning success.

- [x] **Step 5: Run tests and commit**

```bash
node --test tests/unit/voice-debugger.test.js tests/unit/listening-mask-controller.test.js
npm run test:unit
git add background listening content tests
git commit -m "feat: isolate trusted voice and listening mask controls"
```

---

### Task 7: Implement Supervisor Degraded Mode and Feed Filtering

**Files:**
- Create: `supervisor/supervisor-controller.js`
- Create: `tests/unit/supervisor-controller.test.js`

**Interfaces:**
- `createSupervisorController({ decisionProvider, deliverInstruction })`.
- `start({ sessionId, lessonBrief, teachingMethod })`.
- `observe(turns)`.
- `stop()`.
- `status()`.
- The controller accepts only filtered teacher/learner turns; `ENPAL_CONTROL` items are removed before `decisionProvider`.

- [x] **Step 1: Write failing supervisor tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSupervisorController } from '../../supervisor/supervisor-controller.js';

test('filters ENPAL_CONTROL traffic before requesting a decision', async () => {
  let observed;
  const controller = createSupervisorController({
    decisionProvider: async ({ turns }) => {
      observed = turns;
      return { action: 'CONTINUE', instruction: 'NONE' };
    },
    deliverInstruction: async () => {}
  });

  await controller.start({
    sessionId: 'S-001',
    lessonBrief: { lesson_id: 'L1' },
    teachingMethod: 'speaking'
  });
  await controller.observe([
    { role: 'learner', text: 'I work as an engineer.' },
    { role: 'user', text: 'ENPAL_CONTROL\ntype=PAUSE\nEND_ENPAL_CONTROL' }
  ]);

  assert.deepEqual(observed, [
    { role: 'learner', text: 'I work as an engineer.' }
  ]);
});

test('NUDGE delivers exactly one instruction', async () => {
  const delivered = [];
  const controller = createSupervisorController({
    decisionProvider: async () => ({
      action: 'NUDGE',
      instruction: 'Ask one shorter follow-up.'
    }),
    deliverInstruction: async (instruction) => delivered.push(instruction)
  });

  await controller.start({
    sessionId: 'S-001',
    lessonBrief: { lesson_id: 'L1' },
    teachingMethod: 'speaking'
  });
  await controller.observe([{ role: 'learner', text: 'Because machine stop.' }]);

  assert.deepEqual(delivered, ['Ask one shorter follow-up.']);
});

test('provider failure sets degraded status without fabricating a rubric decision', async () => {
  const controller = createSupervisorController({
    decisionProvider: async () => {
      throw new Error('supervisor unavailable');
    },
    deliverInstruction: async () => {
      throw new Error('must not deliver');
    }
  });

  await controller.start({
    sessionId: 'S-001',
    lessonBrief: { lesson_id: 'L1' },
    teachingMethod: 'speaking'
  });
  const result = await controller.observe([{ role: 'learner', text: 'Hello.' }]);

  assert.deepEqual(result, {
    action: 'CONTINUE_WITHOUT_SUPERVISOR',
    degraded: true
  });
  assert.equal(controller.status(), 'DEGRADED');
});
```

- [x] **Step 2: Run tests and confirm failure**

```bash
node --test tests/unit/supervisor-controller.test.js
```

Expected: FAIL.

- [x] **Step 3: Implement controller**

Use status values:

```js
const STATUS = Object.freeze({
  OFF: 'OFF',
  ON: 'ON',
  DEGRADED: 'DEGRADED'
});
```

When `decisionProvider` throws, catch it, set `DEGRADED`, and return:

```js
{ action: 'CONTINUE_WITHOUT_SUPERVISOR', degraded: true }
```

This value is internal orchestration status, not a fake Supervisor rubric decision.

- [x] **Step 4: Run tests**

```bash
node --test tests/unit/supervisor-controller.test.js
npm run test:unit
```

Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add supervisor tests/unit/supervisor-controller.test.js
git commit -m "feat: add fail-open supervisor controller"
```

---

### Task 8: Implement Recovery Decisions Before Full Workflow Actions

**Files:**
- Create: `core/recovery.js`
- Create: `tests/unit/recovery.test.js`
- Create: `tests/helpers/fake-repositories.js`

**Interfaces:**
- `decideRecovery({ journal, activeSessions, activeBrief })`.
- Returns one action:
  - `SETUP_REQUIRED`
  - `READY`
  - `RECOVER_STARTING`
  - `RESUME_PAUSED`
  - `RESUME_PROCESSING`
  - `CONSISTENCY_ERROR`.

- [x] **Step 1: Write the crash-matrix decision tests**

At minimum:

```js
test('two active sessions produce CONSISTENCY_ERROR', () => {});
test('STARTING without chat_url produces RECOVER_STARTING', () => {});
test('PAUSED produces RESUME_PAUSED before a future ACTIVE brief', () => {});
test('PROCESSING produces RESUME_PROCESSING', () => {});
test('no active session and valid ACTIVE brief produces READY', () => {});
```

- [x] **Step 2: Run focused test and confirm failure**

```bash
node --test tests/unit/recovery.test.js
```

Expected: FAIL.

- [x] **Step 3: Implement pure recovery decision logic**

Keep `core/recovery.js` free of Chrome/Google calls. It receives already-read state and returns a decision only.

Example:

```js
export function decideRecovery({ journal, activeSessions, activeBrief }) {
  if (activeSessions.length > 1) return { action: 'CONSISTENCY_ERROR' };
  const active = activeSessions[0];

  if (!active) {
    return activeBrief?.ready
      ? { action: 'READY' }
      : { action: 'SETUP_REQUIRED' };
  }

  if (active.status === 'STARTING') {
    return { action: 'RECOVER_STARTING', session: active, journal };
  }
  if (active.status === 'PAUSED') {
    return { action: 'RESUME_PAUSED', session: active };
  }
  if (active.status === 'PROCESSING') {
    return { action: 'RESUME_PROCESSING', session: active };
  }
  return { action: 'READY', session: active };
}
```

- [x] **Step 4: Run tests**

```bash
node --test tests/unit/recovery.test.js
npm run test:unit
```

Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add core/recovery.js tests
git commit -m "feat: add deterministic workflow recovery decisions"
```

---

### Task 9: Implement START and RESUME Workflow

**Files:**
- Create: `core/workflow.js`
- Create: `tests/integration/start-workflow.test.js`
- Modify: `tests/helpers/fake-repositories.js`
- Modify: `tests/helpers/fake-chatgpt-adapter.js`

**Interfaces:**
- `createWorkflow(deps)`.
- `workflow.start()`.
- Dependencies:
  - `config`
  - `journal`
  - `sessions`
  - `curriculum`
  - `briefs`
  - `chatgpt`
  - `mask`
  - `supervisor`.

- [x] **Step 1: Write failing new-START integration test**

The fake event log must prove this order:

```text
read active sessions
→ verify ACTIVE brief
→ create STARTING session
→ journal session/tab intent
→ open Project
→ create chat
→ arm mask when required
→ send Teacher Role + Method + Brief control
→ wait idle
→ capture URL
→ bind URL
→ mark IN_PROGRESS
→ start Supervisor
→ start Voice
```

Assert Voice never starts before `bindChat`.

- [x] **Step 2: Write failing chat-creation recovery test**

Model:

- durable Session = `STARTING`, no `chat_url`;
- journal contains `pendingTabId=77`;
- fake adapter confirms tab 77 belongs to pending conversation.

Expected: bind recovered URL and do not call `createConversation()`.

Add the complementary case: pending tab cannot be proven safe → create replacement conversation with the same `session_id`; no second Session row.

- [x] **Step 3: Write failing RESUME test**

Assert:

- exact stored `chat_url` opened;
- brief identity equals bound lesson identity;
- required mask arms before control;
- Teacher Role + Method + ACTIVE Brief + checkpoint instruction are sent;
- no `createConversation()` call occurs.

- [x] **Step 4: Implement `workflow.start()` minimally**

The method may delegate to private functions `startNew()`, `recoverStarting()`, and `resumePaused()`, but the public interface remains one START action.

On Supervisor failure, continue to Voice and record degraded status.

On required mask failure, throw `EnpalError(ERROR_CODES.MASK_REQUIRED, ..., true)` before sending lesson control.

- [x] **Step 5: Run tests and commit**

```bash
node --test tests/integration/start-workflow.test.js
npm test
git add core/workflow.js tests
git commit -m "feat: implement EnPal START and RESUME workflow"
```

---

### Task 10: Implement PAUSE Workflow

**Files:**
- Modify: `core/workflow.js`
- Create: `tests/integration/pause-workflow.test.js`

**Interfaces:**
- Adds `workflow.pause()`.

- [x] **Step 1: Write failing PAUSE success test**

Assert order:

```text
verify active bound chat
→ stop Voice
→ stop Supervisor
→ keep mask armed if protected Listening
→ send ENPAL_CONTROL type=PAUSE
→ wait for durable Session checkpoint/status
→ journal PAUSED
```

The Extension must not generate checkpoint content itself.

- [x] **Step 2: Write failing PAUSE verification-error test**

If Session repository never verifies checkpoint + `PAUSED` state:

- `workflow.pause()` throws recoverable `SHEET_WRITE_UNVERIFIED`;
- no ANALYZE/UPDATE/Planner methods are called;
- same Session/chat remain authoritative.

- [x] **Step 3: Run focused test and confirm failure**

```bash
node --test tests/integration/pause-workflow.test.js
```

Expected: FAIL.

- [x] **Step 4: Implement `workflow.pause()`**

Use one `ENPAL_CONTROL` PAUSE envelope instructing ChatGPT to create/write the semantic checkpoint for the active Session. Poll only the configured bounded Session state fields, never assistant prose.

- [x] **Step 5: Run tests and commit**

```bash
node --test tests/integration/pause-workflow.test.js
npm test
git add core/workflow.js tests/integration/pause-workflow.test.js
git commit -m "feat: implement durable PAUSE workflow"
```

---

### Task 11: Implement END Pipeline and Idempotent Recovery

**Files:**
- Modify: `core/workflow.js`
- Create: `tests/integration/end-workflow.test.js`

**Interfaces:**
- Adds `workflow.end()`.
- Adds `workflow.resumeProcessing()`.

- [x] **Step 1: Write failing happy-path END test**

Assert exact phase order:

```text
stop Voice
→ stop Supervisor
→ ANALYZE control
→ verify ANALYZE
→ UPDATE control
→ verify Review Ledger update
→ curriculum.getNextLesson()
→ Review Planner control
→ verify _STAGING
→ promote _STAGING to ACTIVE
→ mark Session COMPLETED
→ best-effort rename
→ READY
```

Assert current Session is not marked COMPLETED before brief promotion succeeds.

- [x] **Step 2: Write failing idempotent restart tests**

Create separate tests for restart after:

- ANALYZE committed: skip ANALYZE, begin UPDATE.
- UPDATE committed: skip UPDATE, begin next Base Lesson / Planner.
- BRIEF_PROMOTED: skip Planner and promotion, mark Session COMPLETED.
- SESSION_COMPLETED: do not re-run core pipeline; rename may retry once as best-effort metadata.

- [x] **Step 3: Write failing rename and Voice-stop policy tests**

Assert:

- rename failure still resolves app to READY;
- Voice-stop failure prevents ANALYZE and returns recoverable ERROR.

- [x] **Step 4: Implement END as phase-driven orchestration**

Store phase after each durable verification:

```js
await journal.write({ phase: 'ANALYZE_COMMITTED' });
```

Never advance phase based on ChatGPT's visible response.

Review Planner control must refer only to:

- exact next Base Lesson from Curriculum Sheet;
- exact Review Ledger source.

Session Brief staging verification is machine structure/identity only.

- [x] **Step 5: Run tests and commit**

```bash
node --test tests/integration/end-workflow.test.js
npm test
git add core/workflow.js tests/integration/end-workflow.test.js
git commit -m "feat: implement recoverable EnPal END pipeline"
```

---

### Task 12: Build Setup Gate and Side Panel State UI

**Files:**
- Modify: `sidepanel/index.html`
- Modify: `sidepanel/sidepanel.css`
- Modify: `sidepanel/sidepanel.js`
- Create: `sidepanel/view-model.js`
- Create: `tests/unit/sidepanel-state.test.js`
- Create: `tests/integration/setup-flow.test.js`

**Interfaces:**
- Side Panel invokes only public workflow methods: `start()`, `pause()`, `end()`, `recover()`.
- No repository/DOM access directly from UI.

- [ ] **Step 1: Write failing UI-state tests**

Test the pure `getSidePanelView(state, recoverable)` function:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { getSidePanelView } from '../../sidepanel/view-model.js';

test('maps approved states to legal learner actions', () => {
  assert.deepEqual(getSidePanelView('SETUP_REQUIRED', false).actions, ['SETUP']);
  assert.deepEqual(getSidePanelView('READY', false).actions, ['START']);
  assert.deepEqual(getSidePanelView('LEARNING', false).actions, ['PAUSE', 'END']);
  assert.deepEqual(getSidePanelView('PAUSED', false).actions, ['START']);
  assert.deepEqual(getSidePanelView('PROCESSING', false).actions, []);
  assert.deepEqual(getSidePanelView('ERROR', true).actions, ['RETRY']);
  assert.deepEqual(getSidePanelView('ERROR', false).actions, []);
});
```

- [ ] **Step 2: Write failing setup integration test**

Setup succeeds only when:

- runtime config validates;
- interactive Google OAuth succeeds;
- required Sheets can be read/written;
- platform-gate marker is present;
- ACTIVE Session Brief exists and is valid.

Expected app state: `READY`.

Missing any one requirement: `SETUP_REQUIRED`.

- [ ] **Step 3: Implement minimal learner UI**

Create `sidepanel/view-model.js` as the only state-to-copy/action mapping:

```js
const ACTIONS = Object.freeze({
  SETUP_REQUIRED: ['SETUP'],
  READY: ['START'],
  LEARNING: ['PAUSE', 'END'],
  PAUSED: ['START'],
  PROCESSING: [],
  ERROR: []
});

export function getSidePanelView(state, recoverable = false) {
  const actions = state === 'ERROR' && recoverable ? ['RETRY'] : (ACTIONS[state] ?? []);
  return { state, actions };
}
```

Keep learner-facing copy non-technical. Do not expose ANALYZE/UPDATE/Planner labels.

Use buttons with stable IDs:

```html
<button id="setup-action">Verify setup</button>
<button id="start-action">START</button>
<button id="pause-action">PAUSE</button>
<button id="end-action">END</button>
<button id="retry-action">Retry</button>
```

Only the valid buttons for the current state are visible/enabled.

- [ ] **Step 4: Run tests**

```bash
node --test tests/unit/sidepanel-state.test.js tests/integration/setup-flow.test.js
npm test
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add sidepanel tests
git commit -m "feat: add setup gate and learner side panel states"
```

---

### Task 13: Wire the Event-Driven Service Worker and Extension Messaging

**Files:**
- Modify: `background/service-worker.js`
- Modify: `sidepanel/sidepanel.js`
- Create: `tests/unit/service-worker.test.js`

**Interfaces:**
- Background performs short privileged actions only:
  - side-panel configuration;
  - trusted Voice activation via debugger;
  - no long-lived workflow loop.
- Side panel/workflow owns recoverable orchestration.

- [ ] **Step 1: Write failing service-worker tests**

Using `loadClassicScript` is not required because service worker is an ES module; import it with a fake global `chrome`.

Assert:

- `onInstalled` configures panel behavior;
- `ENPAL_TRUSTED_ACTIVATE` delegates to debugger helper;
- no START/PAUSE/END pipeline is stored in module-global worker state.

- [ ] **Step 2: Run test and confirm failure**

```bash
node --test tests/unit/service-worker.test.js
```

Expected: FAIL until message routing exists.

- [ ] **Step 3: Implement short event handlers**

Keep the worker roughly:

```js
import { activateFocusedControlWithDebugger } from './voice-debugger.js';

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel?.setPanelBehavior?.({ openPanelOnActionClick: true }).catch(() => {});
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== 'ENPAL_TRUSTED_ACTIVATE') return false;

  activateFocusedControlWithDebugger(chrome, message.tabId)
    .then(() => sendResponse({ ok: true }))
    .catch((error) => sendResponse({ ok: false, message: error.message }));

  return true;
});
```

- [ ] **Step 4: Run tests**

```bash
node --test tests/unit/service-worker.test.js
npm test
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add background sidepanel tests/unit/service-worker.test.js
git commit -m "feat: wire MV3 event-driven extension runtime"
```

---

### Task 14: Add Full Crash-Window Integration Matrix

**Files:**
- Create: `tests/integration/crash-recovery-matrix.test.js`
- Modify: `tests/helpers/fake-repositories.js`
- Modify: `tests/helpers/fake-chatgpt-adapter.js`

**Interfaces:**
- Tests only; validates approved invariants across Tasks 8–13.

- [ ] **Step 1: Encode all nine required crash windows**

Create one table-driven test with cases:

```js
const cases = [
  'SESSION_STUB_CREATED',
  'CHAT_CREATED_NOT_BOUND',
  'CHAT_BOUND_BEFORE_VOICE',
  'PAUSE_COMMITTED',
  'ANALYZE_COMMITTED',
  'UPDATE_COMMITTED',
  'BRIEF_STAGED',
  'BRIEF_PROMOTED',
  'SESSION_COMPLETED_BEFORE_RENAME'
];
```

Each case supplies durable Sheet state + local journal state and asserts the first legal recovery action.

- [ ] **Step 2: Add invariant assertions**

Every case must assert:

- number of logical Session rows remains one;
- Review Ledger apply count never exceeds one for the same session;
- curriculum advancement count never exceeds one;
- once `chat_url` is bound, no new conversation is created;
- only `CHAT_CREATED_NOT_BOUND` may leave an orphan external chat.

- [ ] **Step 3: Run the matrix and fix any workflow defects**

Run:

```bash
node --test tests/integration/crash-recovery-matrix.test.js
```

Expected: PASS. If it fails, fix the owning workflow/repository module rather than weakening the test.

- [ ] **Step 4: Run the whole automated suite**

```bash
npm test
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add core storage tests
git commit -m "test: cover EnPal V1 crash recovery matrix"
```

---

### Task 15: Live Production-Like E2E Acceptance

**Files:**
- Create: `tests/live/README.md`
- Create: `tests/live/enpal-v1-e2e-checklist.md`
- Modify: `package.json`

**Interfaces:**
- Manual/live acceptance against the actual configured ChatGPT Project + Google Workspace.
- This task does not replace automated tests.

- [ ] **Step 1: Create the exact live checklist**

`tests/live/enpal-v1-e2e-checklist.md` must contain one checkbox for each approved acceptance gate:

1. Setup → READY.
2. Extension OAuth read/write.
3. ChatGPT connected Google read/write without per-lesson approval.
4. deterministic Curriculum selection.
5. START creates one Session + one authoritative bound chat.
6. protected Listening has no content flash.
7. PAUSE writes semantic checkpoint.
8. RESUME reuses exact bound chat.
9. Supervisor failure degrades but does not block lesson.
10. `ENPAL_CONTROL` excluded from evidence.
11. ANALYZE → UPDATE → Planner order verified.
12. Session Brief staging + atomic promotion verified.
13. curriculum advances once.
14. each crash-window scenario recovered.
15. rename failure does not block READY.
16. no assistant-prose parsing used.

- [ ] **Step 2: Add explicit evidence fields**

For each checklist item include:

```text
Result: PASS | FAIL
Evidence:
Session ID:
Chat URL:
Relevant Sheet range/marker:
Notes:
```

This is test evidence, not product telemetry.

- [ ] **Step 3: Add a package script that prints the live-test location**

Modify `package.json`:

```json
"scripts": {
  "test": "node --test 'tests/**/*.test.js'",
  "test:unit": "node --test 'tests/unit/*.test.js'",
  "test:integration": "node --test 'tests/integration/*.test.js'",
  "test:live": "node -e \"console.log('Run tests/live/enpal-v1-e2e-checklist.md in the configured production-like Chrome profile')\""
}
```

- [ ] **Step 4: Run automated tests before live execution**

```bash
npm test
npm run test:integration
npm run test:live
```

Expected: automated suites PASS; live command prints checklist instructions.

Then execute the checklist in the actual EnPal Project. Any FAIL blocks V1 release.

- [ ] **Step 5: Commit**

```bash
git add package.json tests/live
git commit -m "test: add EnPal V1 live acceptance checklist"
```

---

### Task 16: Final Permission, Privacy, and Release Audit

**Files:**
- Modify: `manifest.json`
- Create: `docs/release/enpal-v1-release-checklist.md`
- Create: `tests/unit/manifest-permissions.test.js`

**Interfaces:**
- Release-only validation; no new runtime subsystem.

- [ ] **Step 1: Write a manifest permission test**

Read `manifest.json` and assert:

- `https://chatgpt.com/*` is present;
- `https://sheets.googleapis.com/*` is present;
- generic `https://www.googleapis.com/*` is absent;
- no permission outside the approved set is silently added;
- `debugger` remains only if trusted Voice activation still requires it.

Represent the approved set explicitly in the test so any new permission forces a review.

- [ ] **Step 2: Create the release checklist**

Include:

- full `npm test` PASS;
- live E2E checklist PASS;
- OAuth client ID configured;
- exact production file IDs configured;
- no transcript content in local diagnostics;
- no auth token in `chrome.storage.local`;
- debugger attach/detach verified;
- privacy disclosure matches stored/transmitted data;
- Chrome Web Store permission copy matches actual permissions;
- approved spec + implementation plan commit IDs recorded.

- [ ] **Step 3: Run tests and inspect manifest**

```bash
node --test tests/unit/manifest-permissions.test.js
npm test
```

Expected: PASS.

- [ ] **Step 4: Perform a final repository scan**

Run:

```bash
grep -R "Next Session\|Target Bank" -n core storage adapters content supervisor listening sidepanel background tests
```

Expected: no active-runtime implementation references to deprecated architecture. Historical audit/spec text may be excluded deliberately.

- [ ] **Step 5: Commit**

```bash
git add manifest.json docs/release tests/unit/manifest-permissions.test.js
git commit -m "chore: complete EnPal V1 release audit"
```

---

## Implementation Order Summary

```text
Pre-execution platform + contract gates
        ↓
1. Runtime contracts
        ↓
2. Recovery journal
        ↓
3. OAuth + Sheets client
        ↓
4. Durable repositories
        ↓
5. ENPAL_CONTROL + ChatGPT Adapter
        ↓
6. Voice + Listening Mask isolation
        ↓
7. Supervisor degraded mode
        ↓
8. Pure recovery decisions
        ↓
9. START / RESUME
        ↓
10. PAUSE
        ↓
11. END pipeline
        ↓
12. Setup + Side Panel
        ↓
13. MV3 event wiring
        ↓
14. Crash recovery matrix
        ↓
15. Live E2E acceptance
        ↓
16. Release / permission audit
```

## Definition of Done

EnPal V1 implementation is done only when:

- all automated tests pass;
- all 16 live acceptance gates pass in the configured production-like account;
- no platform gate requires per-lesson manual intervention;
- no workflow parses assistant prose;
- crash matrix proves deterministic recovery;
- protected Listening is fail-closed;
- Supervisor and rename failures are fail-open as specified;
- one-active-session and one-authoritative-chat-binding invariants hold;
- Session Brief promotion is atomic;
- the final permission/privacy audit passes;
- implementation remains within the approved V1 scope.
