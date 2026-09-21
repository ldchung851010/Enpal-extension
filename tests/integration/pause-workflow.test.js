import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorkflow } from '../../core/workflow.js';

const CHAT_URL = 'https://chatgpt.com/g/g-p-enpal/c/pause-1';

function makeSession(overrides = {}) {
  return {
    session_id: 'S-PAUSE',
    status: 'IN_PROGRESS',
    phase: 'CHAT_BOUND',
    chat_url: CHAT_URL,
    curriculum_version: 'v1',
    curriculum_sequence: 1,
    lesson_id: 'L1',
    primary_skill: 'Listening',
    pause_checkpoint: '',
    ...overrides
  };
}

function makeHarness({
  session = makeSession(),
  durableReads,
  actualUrl = CHAT_URL,
  maskArm,
  pauseVerifyAttempts = 3
} = {}) {
  const events = [];
  const controls = [];
  const journalWrites = [];
  let readIndex = 0;

  const reads = durableReads ?? [
    { ...session, status: 'IN_PROGRESS', pause_checkpoint: '' },
    {
      ...session,
      status: 'PAUSED',
      phase: 'PAUSE_COMMITTED',
      pause_checkpoint: 'Covered greeting. Continue with clarification questions.'
    }
  ];

  const sessions = {
    async listActive() {
      events.push('sessions.listActive');
      return [{ ...session }];
    },
    async getById(sessionId) {
      events.push('sessions.getById');
      assert.equal(sessionId, session.session_id);
      const value = reads[Math.min(readIndex, reads.length - 1)];
      readIndex += 1;
      return value ? { ...value } : null;
    }
  };

  const chatgpt = {
    async openConversation(url) {
      events.push('chatgpt.openConversation');
      assert.equal(url, session.chat_url);
      return 44;
    },
    async getConversationUrl(tabId) {
      events.push('chatgpt.getConversationUrl');
      assert.equal(tabId, 44);
      return actualUrl;
    },
    async stopVoice(tabId) {
      events.push('chatgpt.stopVoice');
      assert.equal(tabId, 44);
      return { ok: true, active: false };
    },
    async sendControl(tabId, text) {
      events.push('chatgpt.sendControl');
      assert.equal(tabId, 44);
      controls.push(text);
      return { ok: true, sent: true };
    }
  };

  const supervisor = {
    stop() {
      events.push('supervisor.stop');
      return { status: 'OFF' };
    }
  };

  const mask = {
    async arm(tabId) {
      events.push('mask.arm');
      assert.equal(tabId, 44);
      if (maskArm) return maskArm(tabId);
      return { armed: true };
    }
  };

  const journal = {
    async write(patch) {
      events.push('journal.write');
      journalWrites.push({ ...patch });
      return { ...patch };
    }
  };

  const deps = {
    config: {
      projectUrl: 'https://chatgpt.com/g/g-p-enpal',
      teacherRoleUrl: 'https://drive.google.com/teacher-role',
      speakingMethodUrl: 'https://drive.google.com/speaking-method',
      listeningMethodUrl: 'https://drive.google.com/listening-method'
    },
    journal,
    sessions,
    curriculum: {},
    briefs: {},
    chatgpt,
    mask,
    supervisor,
    pauseVerifyAttempts,
    pausePollMs: 0,
    sleep: async () => {}
  };

  return { deps, events, controls, journalWrites };
}

test('PAUSE verifies bound chat, stops live systems, preserves Listening mask, then verifies durable checkpoint', async () => {
  const h = makeHarness();

  const result = await createWorkflow(h.deps).pause();

  assert.equal(result.action, 'PAUSED');
  assert.equal(result.session.status, 'PAUSED');
  assert.equal(result.session.phase, 'PAUSE_COMMITTED');
  assert.equal(result.tabId, 44);

  assert.deepEqual(h.events, [
    'sessions.listActive',
    'chatgpt.openConversation',
    'chatgpt.getConversationUrl',
    'chatgpt.stopVoice',
    'supervisor.stop',
    'mask.arm',
    'chatgpt.sendControl',
    'sessions.getById',
    'sessions.getById',
    'journal.write'
  ]);

  assert.equal(h.controls.length, 1);
  assert.match(h.controls[0], /^ENPAL_CONTROL\n/);
  assert.match(h.controls[0], /type=PAUSE/);
  assert.match(h.controls[0], /session_id=S-PAUSE/);
  assert.match(h.controls[0], /Create and persist the Pause Checkpoint/);
  assert.doesNotMatch(h.controls[0], /Covered greeting/);

  assert.deepEqual(h.journalWrites, [{
    sessionId: 'S-PAUSE',
    chatUrl: CHAT_URL,
    status: 'PAUSED',
    phase: 'PAUSE_COMMITTED'
  }]);
});

test('PAUSE verification failure is recoverable and never claims a safe pause', async () => {
  const session = makeSession();
  const h = makeHarness({
    session,
    durableReads: [
      { ...session },
      { ...session },
      { ...session }
    ],
    pauseVerifyAttempts: 3
  });

  await assert.rejects(
    createWorkflow(h.deps).pause(),
    (error) => (
      error.code === 'SHEET_WRITE_UNVERIFIED' &&
      error.recoverable === true
    )
  );

  assert.equal(h.controls.length, 1);
  assert.match(h.controls[0], /type=PAUSE/);
  assert.doesNotMatch(h.controls[0], /type=ANALYZE|type=UPDATE|type=PLANNER/);
  assert.equal(h.events.filter((event) => event === 'sessions.getById').length, 3);
  assert.deepEqual(h.journalWrites, []);
  assert.equal(session.status, 'IN_PROGRESS');
  assert.equal(session.chat_url, CHAT_URL);
});

test('PAUSE refuses a mismatched chat before stopping Voice', async () => {
  const h = makeHarness({
    actualUrl: 'https://chatgpt.com/g/g-p-enpal/c/wrong'
  });

  await assert.rejects(
    createWorkflow(h.deps).pause(),
    (error) => error.code === 'WRONG_CHAT'
  );

  assert.deepEqual(h.events, [
    'sessions.listActive',
    'chatgpt.openConversation',
    'chatgpt.getConversationUrl'
  ]);
  assert.equal(h.controls.length, 0);
  assert.deepEqual(h.journalWrites, []);
});

test('Speaking PAUSE does not manipulate the Listening mask', async () => {
  const h = makeHarness({
    session: makeSession({ primary_skill: 'Speaking' })
  });

  await createWorkflow(h.deps).pause();

  assert.equal(h.events.includes('mask.arm'), false);
  assert.equal(h.controls.length, 1);
});
