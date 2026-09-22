import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { chromium } from 'playwright';

import { createPlaywrightRuntime } from '../../playwright/runtime.js';

const projectRoot = 'https://chatgpt.com/g/g-p-runtime';
const projectUrl = projectRoot + '/project';

function columnIndex(name) {
  let value = 0;
  for (const char of name) {
    value = value * 26 + (char.charCodeAt(0) - 64);
  }
  return value - 1;
}

function createMemorySheets() {
  const sessionHeaders = [
    'session_id',
    'curriculum_version',
    'curriculum_sequence',
    'lesson_id',
    'primary_skill',
    'chat_url',
    'lifecycle_status',
    'pipeline_phase'
  ];
  const sessionRows = [];

  const curriculum = [[
    'curriculum_version',
    'curriculum_sequence',
    'lesson_id',
    'Primary Skill',
    'Communicative Goal'
  ], [
    'v1',
    '1',
    'L001',
    'Speaking',
    'Give a short workplace update.'
  ]];

  const activeBrief = [
    ['key', 'value'],
    ['schema_version', '1.0'],
    ['curriculum_version', 'v1'],
    ['curriculum_sequence', '1'],
    ['lesson_id', 'L001'],
    ['ready_marker', 'READY'],
    ['Primary Skill', 'Speaking'],
    ['Communicative Goal', 'Give a short workplace update.'],
    ['Focus', '["State status clearly"]'],
    ['Review Focus', '[]'],
    ['Situation', 'Team check-in'],
    ['Target Performance', 'Give a concise update.'],
    ['Completion Criteria', '["Status is clear"]'],
    ['Mask Policy', 'OFF']
  ];

  return {
    sessionRows,

    async getValues(spreadsheetId, range) {
      if (spreadsheetId === 'curriculum' && range.startsWith('CURRICULUM!')) {
        return curriculum.map(row => [...row]);
      }
      if (spreadsheetId === 'brief' && range.startsWith('ACTIVE!')) {
        return activeBrief.map(row => [...row]);
      }
      if (spreadsheetId === 'brief' && range.startsWith('_STAGING!')) {
        return [];
      }
      if (spreadsheetId === 'database' && range.startsWith('Sessions!')) {
        return [
          [...sessionHeaders],
          ...sessionRows.map(row => [...row])
        ];
      }
      throw new Error('unexpected sheet read: ' + spreadsheetId + ' ' + range);
    },

    async updateValues(spreadsheetId, range, values) {
      if (spreadsheetId !== 'database') {
        throw new Error('unexpected sheet write spreadsheet: ' + spreadsheetId);
      }

      const wholeRow = range.match(/^Sessions!A(\d+):([A-Z]+)\1$/);
      if (wholeRow) {
        const rowNumber = Number(wholeRow[1]);
        const index = rowNumber - 2;
        sessionRows[index] = [...values[0]];
        return { updatedRows: 1 };
      }

      const cell = range.match(/^Sessions!([A-Z]+)(\d+)$/);
      if (cell) {
        const col = columnIndex(cell[1]);
        const row = Number(cell[2]) - 2;
        if (!sessionRows[row]) {
          sessionRows[row] = Array(sessionHeaders.length).fill('');
        }
        sessionRows[row][col] = values[0][0];
        return { updatedCells: 1 };
      }

      throw new Error('unexpected sheet write range: ' + range);
    },

    async batchUpdate() {
      throw new Error('START must not batch-update Session Brief');
    }
  };
}

function fixtureHtml() {
  return `<!doctype html>
<html>
<head>
  <link rel="canonical" href="${projectUrl}">
</head>
<body>
  <div id="prompt-textarea" role="textbox" contenteditable="true" data-lexical-editor="true"></div>
  <button id="composer-submit-button" aria-disabled="true">Send</button>
  <button data-testid="voice-mode-button" aria-label="Start voice mode" aria-pressed="false">Voice</button>
  <div id="turns"></div>
<script>
(() => {
  const box = document.querySelector('#prompt-textarea');
  const send = document.querySelector('#composer-submit-button');
  const voice = document.querySelector('[data-testid="voice-mode-button"]');
  const canonical = document.querySelector('link[rel="canonical"]');

  box.addEventListener('input', () => {
    send.setAttribute('aria-disabled', box.innerText.trim() ? 'false' : 'true');
  });

  send.addEventListener('click', () => {
    if (send.getAttribute('aria-disabled') === 'true') return;
    const turn = document.createElement('div');
    turn.setAttribute('data-message-author-role', 'user');
    turn.textContent = box.innerText;
    document.querySelector('#turns').appendChild(turn);
    box.innerHTML = '';
    box.dispatchEvent(new InputEvent('input', { bubbles: true }));
    canonical.href = '${projectRoot}/c/runtime-start';
    history.pushState({}, '', '/g/g-p-runtime/c/runtime-start');
  });

  voice.addEventListener('click', () => {
    voice.setAttribute(
      'aria-pressed',
      voice.getAttribute('aria-pressed') === 'true' ? 'false' : 'true'
    );
  });
})();
</script>
</body>
</html>`;
}

test('standalone Playwright runtime START persists Session state and binds browser conversation', async t => {
  const browser = await chromium.launch({ headless: true });
  t.after(async () => browser.close());

  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'enpal-runtime-'));
  t.after(async () => rm(tempDir, { recursive: true, force: true }));

  const context = await browser.newContext();
  const firstPage = await context.newPage();

  await context.route('https://chatgpt.com/**', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: fixtureHtml()
    });
  });

  const sheets = createMemorySheets();

  const runtime = createPlaywrightRuntime({
    context,
    initialPage: firstPage,
    workspace: {
      id: 'english-engineering',
      name: 'English Engineering',
      projectUrl,
      curriculumSpreadsheetId: 'curriculum',
      databaseSpreadsheetId: 'database',
      sessionBriefSpreadsheetId: 'brief',
      reviewLedgerSpreadsheetId: 'review',
      teacherRoleUrl: 'https://drive.google.com/teacher',
      speakingMethodUrl: 'https://drive.google.com/speaking',
      listeningMethodUrl: 'https://drive.google.com/listening',
      sessionBriefActiveSheetId: 10,
      sessionBriefStagingSheetId: 11
    },
    sheetsClient: sheets,
    journalRoot: path.join(tempDir, 'recovery'),
    chatgptPageOptions: {
      projectReadyTimeoutMs: 2_000,
      conversationTimeoutMs: 2_000,
      submitTimeoutMs: 2_000
    },
    idleOptions: {
      timeoutMs: 1_000,
      activityGraceMs: 0,
      idleStabilityMs: 0
    },
    voiceOptions: {
      timeoutMs: 1_000,
      pollMs: 10
    }
  });

  const result = await runtime.workflow.start();

  assert.equal(result.action, 'STARTED');
  assert.equal(result.session.status, 'IN_PROGRESS');
  assert.equal(result.session.chat_url, projectRoot + '/c/runtime-start');

  assert.equal(sheets.sessionRows.length, 1);
  const row = sheets.sessionRows[0];
  assert.equal(row[0], result.session.session_id);
  assert.equal(row[5], projectRoot + '/c/runtime-start');
  assert.equal(row[6], 'IN_PROGRESS');
  assert.equal(row[7], 'CHAT_BOUND');

  const page = context.pages().find(p => p.url().includes('/c/runtime-start'));
  assert.ok(page);
  assert.equal(
    await page.locator('[data-testid="voice-mode-button"]').getAttribute('aria-pressed'),
    'true'
  );

  const journal = await runtime.dependencies.journal.read();
  assert.equal(journal.sessionId, result.session.session_id);
  assert.equal(journal.chatUrl, projectRoot + '/c/runtime-start');
  assert.equal(journal.learningReady, true);
  assert.equal(journal.phase, 'LEARNING_ACTIVE');
});
