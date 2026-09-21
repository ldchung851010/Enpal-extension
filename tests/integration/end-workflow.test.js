import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorkflow } from '../../core/workflow.js';
import { EnpalError, ERROR_CODES } from '../../core/errors.js';

const PROJECT_URL = 'https://chatgpt.com/g/g-p-enpal';
const CHAT_URL = PROJECT_URL + '/c/end-1';

function makeSession(overrides = {}) {
  return {
    session_id: 'S-END',
    status: 'IN_PROGRESS',
    phase: 'CHAT_BOUND',
    chat_url: CHAT_URL,
    curriculum_version: 'v1',
    curriculum_sequence: 2,
    lesson_id: 'L2',
    primary_skill: 'Speaking',
    ...overrides
  };
}

function controlType(text) {
  return text.match(/\ntype=([^\n]+)/)?.[1] ?? '';
}

function makeHarness({
  session = makeSession(),
  journal = {},
  voiceStopError = null,
  renameError = null,
  autoCommit = true,
  stagingReady = false,
  activeBriefIsNext = false,
  promotionError = null
} = {}) {
  const events = [];
  const controls = [];
  const journalWrites = [];
  let sessionState = { ...session };
  let journalState = { ...journal };
  let stagingIsReady = stagingReady || session.phase === 'BRIEF_STAGED';
  let promoted = session.phase === 'BRIEF_PROMOTED' || session.phase === 'SESSION_COMPLETED';
  let renameCalls = 0;

  const nextLesson = {
    curriculum_version: 'v1',
    curriculum_sequence: 3,
    lesson_id: 'L3',
    'Primary Skill': 'Listening',
    'Communicative Goal': 'Follow a short project update.'
  };

  const sessions = {
    async listActive() {
      events.push('sessions.listActive');
      return ['STARTING', 'IN_PROGRESS', 'PAUSED', 'PROCESSING'].includes(sessionState.status)
        ? [{ ...sessionState }]
        : [];
    },
    async getById(sessionId) {
      events.push('sessions.getById');
      assert.equal(sessionId, sessionState.session_id);
      return { ...sessionState };
    },
    async markState(sessionId, status, patch = {}) {
      const phase = patch.phase ?? sessionState.phase;
      events.push('sessions.markState:' + status + ':' + phase);
      assert.equal(sessionId, sessionState.session_id);
      sessionState = { ...sessionState, ...patch, status };
      return { ...sessionState };
    }
  };

  const journalRepo = {
    async read() {
      events.push('journal.read');
      return { ...journalState };
    },
    async write(patch) {
      events.push('journal.write:' + (patch.phase ?? patch.appState ?? 'metadata'));
      journalWrites.push({ ...patch });
      journalState = { ...journalState, ...patch };
      return { ...journalState };
    }
  };

  const chatgpt = {
    async openConversation(url) {
      events.push('chatgpt.openConversation');
      assert.equal(url, sessionState.chat_url);
      return 70;
    },
    async getConversationUrl(tabId) {
      events.push('chatgpt.getConversationUrl');
      assert.equal(tabId, 70);
      return sessionState.chat_url;
    },
    async stopVoice(tabId) {
      events.push('chatgpt.stopVoice');
      assert.equal(tabId, 70);
      if (voiceStopError) throw voiceStopError;
      return { ok: true, active: false };
    },
    async sendControl(tabId, text) {
      assert.equal(tabId, 70);
      const type = controlType(text);
      events.push('chatgpt.sendControl:' + type);
      controls.push(text);

      if (autoCommit) {
        if (type === 'ANALYZE') {
          sessionState = {
            ...sessionState,
            status: 'PROCESSING',
            phase: 'ANALYZE_COMMITTED',
            analyze_result: 'durable analyze result'
          };
        }
        if (type === 'UPDATE') {
          sessionState = {
            ...sessionState,
            status: 'PROCESSING',
            phase: 'UPDATE_COMMITTED'
          };
        }
        if (type === 'REVIEW_PLANNER') {
          stagingIsReady = true;
        }
      }

      return { ok: true, sent: true };
    },
    async waitUntilIdle(tabId) {
      events.push('chatgpt.waitUntilIdle');
      assert.equal(tabId, 70);
      return { ok: true, idle: true };
    },
    async renameConversation(tabId, title) {
      events.push('chatgpt.renameConversation');
      renameCalls += 1;
      assert.equal(tabId, 70);
      assert.match(title, /L2/);
      if (renameError) throw renameError;
      return { ok: true };
    }
  };

  const supervisor = {
    stop() {
      events.push('supervisor.stop');
      return { status: 'OFF' };
    }
  };

  const curriculum = {
    async getNextLesson(completedSequences) {
      events.push('curriculum.getNextLesson');
      assert.deepEqual(completedSequences, [1, 2]);
      return { ...nextLesson };
    }
  };

  const briefs = {
    async readActive() {
      events.push('briefs.readActive');
      return activeBriefIsNext
        ? { ...nextLesson, ready: true }
        : {
            ready: true,
            curriculum_version: sessionState.curriculum_version,
            curriculum_sequence: sessionState.curriculum_sequence,
            lesson_id: sessionState.lesson_id
          };
    },
    async verifyStaging(expected) {
      events.push('briefs.verifyStaging');
      assert.deepEqual(expected, nextLesson);
      if (!stagingIsReady) throw new Error('staging not ready');
      return { ...nextLesson, ready: true };
    },
    async promoteStaging(range) {
      events.push('briefs.promoteStaging');
      assert.deepEqual(range, { rowCount: 14, columnCount: 2 });
      assert.notEqual(sessionState.status, 'COMPLETED');
      if (promotionError) throw promotionError;
      promoted = true;
      return { ok: true };
    }
  };

  const deps = {
    config: {
      projectUrl: PROJECT_URL,
      curriculumSpreadsheetId: 'curriculum-sheet',
      databaseSpreadsheetId: 'database-sheet',
      sessionBriefSpreadsheetId: 'brief-sheet',
      reviewLedgerSpreadsheetId: 'review-ledger-sheet',
      teacherRoleUrl: 'https://drive.google.com/teacher-role',
      speakingMethodUrl: 'https://drive.google.com/speaking-method',
      listeningMethodUrl: 'https://drive.google.com/listening-method'
    },
    journal: journalRepo,
    sessions,
    curriculum,
    briefs,
    chatgpt,
    mask: {},
    supervisor,
    endVerifyAttempts: 2,
    endPollMs: 0,
    sleep: async () => {},
    briefPromotionRange: { rowCount: 14, columnCount: 2 }
  };

  return {
    deps,
    events,
    controls,
    journalWrites,
    nextLesson,
    get session() {
      return { ...sessionState };
    },
    get journal() {
      return { ...journalState };
    },
    get promoted() {
      return promoted;
    },
    get renameCalls() {
      return renameCalls;
    }
  };
}

test('END runs durable phases in canonical order and completes only after brief promotion', async () => {
  const h = makeHarness();

  const result = await createWorkflow(h.deps).end();

  assert.equal(result.action, 'READY');
  assert.equal(h.session.status, 'COMPLETED');
  assert.equal(h.session.phase, 'SESSION_COMPLETED');
  assert.equal(h.promoted, true);

  const canonical = h.events.filter((event) => [
    'chatgpt.stopVoice',
    'supervisor.stop',
    'chatgpt.sendControl:ANALYZE',
    'sessions.getById',
    'chatgpt.sendControl:UPDATE',
    'curriculum.getNextLesson',
    'chatgpt.sendControl:REVIEW_PLANNER',
    'briefs.verifyStaging',
    'briefs.promoteStaging',
    'sessions.markState:COMPLETED:SESSION_COMPLETED',
    'chatgpt.renameConversation'
  ].includes(event));

  assert.deepEqual(canonical, [
    'chatgpt.stopVoice',
    'supervisor.stop',
    'chatgpt.sendControl:ANALYZE',
    'sessions.getById',
    'chatgpt.sendControl:UPDATE',
    'sessions.getById',
    'curriculum.getNextLesson',
    'chatgpt.sendControl:REVIEW_PLANNER',
    'briefs.verifyStaging',
    'briefs.promoteStaging',
    'sessions.markState:COMPLETED:SESSION_COMPLETED',
    'chatgpt.renameConversation'
  ]);

  const durablePhases = h.journalWrites
    .map((write) => write.phase)
    .filter(Boolean);
  assert.deepEqual(durablePhases.slice(-5), [
    'ANALYZE_COMMITTED',
    'UPDATE_COMMITTED',
    'BRIEF_STAGED',
    'BRIEF_PROMOTED',
    'SESSION_COMPLETED'
  ]);
});

test('restart after ANALYZE_COMMITTED skips ANALYZE and begins UPDATE', async () => {
  const h = makeHarness({
    session: makeSession({ status: 'PROCESSING', phase: 'ANALYZE_COMMITTED' }),
    journal: {
      appState: 'PROCESSING',
      sessionId: 'S-END',
      phase: 'ANALYZE_COMMITTED'
    }
  });

  await createWorkflow(h.deps).resumeProcessing();

  assert.deepEqual(h.controls.map(controlType), ['UPDATE', 'REVIEW_PLANNER']);
});

test('restart after UPDATE_COMMITTED skips UPDATE and begins next lesson planning', async () => {
  const h = makeHarness({
    session: makeSession({ status: 'PROCESSING', phase: 'UPDATE_COMMITTED' }),
    journal: {
      appState: 'PROCESSING',
      sessionId: 'S-END',
      phase: 'UPDATE_COMMITTED'
    }
  });

  await createWorkflow(h.deps).resumeProcessing();

  assert.deepEqual(h.controls.map(controlType), ['REVIEW_PLANNER']);
  assert.equal(h.events.includes('curriculum.getNextLesson'), true);
});

test('restart after promotion crash detects next ACTIVE brief and does not require cleared staging', async () => {
  const h = makeHarness({
    session: makeSession({ status: 'PROCESSING', phase: 'BRIEF_STAGED' }),
    journal: {
      appState: 'PROCESSING',
      sessionId: 'S-END',
      phase: 'BRIEF_STAGED'
    },
    stagingReady: false,
    activeBriefIsNext: true
  });

  await createWorkflow(h.deps).resumeProcessing();

  assert.deepEqual(h.controls, []);
  assert.equal(h.events.includes('briefs.verifyStaging'), false);
  assert.equal(h.events.includes('briefs.promoteStaging'), false);
  assert.equal(h.session.status, 'COMPLETED');
  assert.equal(h.session.phase, 'SESSION_COMPLETED');
});

test('restart after BRIEF_PROMOTED skips Planner and promotion then completes Session', async () => {
  const h = makeHarness({
    session: makeSession({ status: 'PROCESSING', phase: 'BRIEF_PROMOTED' }),
    journal: {
      appState: 'PROCESSING',
      sessionId: 'S-END',
      phase: 'BRIEF_PROMOTED'
    }
  });

  await createWorkflow(h.deps).resumeProcessing();

  assert.deepEqual(h.controls, []);
  assert.equal(h.events.includes('briefs.promoteStaging'), false);
  assert.equal(h.session.status, 'COMPLETED');
  assert.equal(h.session.phase, 'SESSION_COMPLETED');
});

test('restart after SESSION_COMPLETED never reruns core pipeline and may retry rename once', async () => {
  const h = makeHarness({
    session: makeSession({ status: 'COMPLETED', phase: 'SESSION_COMPLETED' }),
    journal: {
      appState: 'PROCESSING',
      sessionId: 'S-END',
      phase: 'SESSION_COMPLETED',
      renameAttempted: false
    }
  });

  const workflow = createWorkflow(h.deps);
  await workflow.resumeProcessing();
  await workflow.resumeProcessing();

  assert.deepEqual(h.controls, []);
  assert.equal(h.events.includes('briefs.promoteStaging'), false);
  assert.equal(h.renameCalls, 1);
  assert.equal(h.journal.renameAttempted, true);
});

test('rename failure is non-blocking and END still resolves READY', async () => {
  const h = makeHarness({
    renameError: new Error('rename rate-limited')
  });

  const result = await createWorkflow(h.deps).end();

  assert.equal(result.action, 'READY');
  assert.equal(h.session.status, 'COMPLETED');
  assert.equal(h.journal.appState, 'READY');
  assert.equal(h.journal.renameAttempted, true);
});

test('Voice-stop failure prevents ANALYZE and leaves Session authoritative for retry', async () => {
  const voiceError = new EnpalError(
    ERROR_CODES.VOICE_STOP_FAILED,
    'Voice did not stop',
    true
  );
  const h = makeHarness({ voiceStopError: voiceError });

  await assert.rejects(
    createWorkflow(h.deps).end(),
    (error) => error.code === ERROR_CODES.VOICE_STOP_FAILED && error.recoverable === true
  );

  assert.deepEqual(h.controls, []);
  assert.equal(h.session.status, 'IN_PROGRESS');
  assert.equal(h.session.chat_url, CHAT_URL);
  assert.equal(
    h.events.some((event) => event.startsWith('sessions.markState:PROCESSING')),
    false
  );
});

test('Review Planner control contains only deterministic next Base Lesson and exact Review Ledger source', async () => {
  const h = makeHarness();

  await createWorkflow(h.deps).end();

  const planner = h.controls.find((text) => controlType(text) === 'REVIEW_PLANNER');
  assert.ok(planner);
  assert.match(planner, /review-ledger-sheet/);
  assert.match(planner, /"curriculum_sequence":3/);
  assert.match(planner, /"lesson_id":"L3"/);
  assert.doesNotMatch(planner, /durable analyze result/);
  assert.doesNotMatch(planner, /pause_checkpoint/);
});

test('START automatically resumes a durable PROCESSING session through the END pipeline', async () => {
  const h = makeHarness({
    session: makeSession({ status: 'PROCESSING', phase: 'UPDATE_COMMITTED' }),
    journal: {
      appState: 'PROCESSING',
      sessionId: 'S-END',
      phase: 'UPDATE_COMMITTED'
    }
  });

  h.deps.briefs.readActive = async () => {
    h.events.push('briefs.readActive');
    return {
      ready: true,
      curriculum_version: 'v1',
      curriculum_sequence: 3,
      lesson_id: 'L3'
    };
  };

  const result = await createWorkflow(h.deps).start();

  assert.equal(result.action, 'READY');
  assert.deepEqual(h.controls.map(controlType), ['REVIEW_PLANNER']);
  assert.equal(h.session.status, 'COMPLETED');
});
