import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorkflow } from '../../core/workflow.js';
import { createFakeWorkflowRepositories } from '../helpers/fake-repositories.js';
import { makeFakeChatGptAdapter } from '../helpers/fake-chatgpt-adapter.js';

const PROJECT_URL = 'https://chatgpt.com/g/g-p-enpal';

function makeBrief(skill = 'Listening') {
  return {
    ready: true,
    curriculum_version: 'v1',
    curriculum_sequence: 1,
    lesson_id: 'L1',
    'Primary Skill': skill,
    'Communicative Goal': 'Handle a short workplace exchange.'
  };
}

function makeDeps({
  events = [],
  activeSessions = [],
  journal = {},
  brief = makeBrief(),
  chatOverrides = {},
  supervisorStart,
  maskArm
} = {}) {
  const repos = createFakeWorkflowRepositories({
    events,
    journal,
    activeSessions,
    activeBrief: brief,
    curriculumLesson: {
      curriculum_version: brief.curriculum_version,
      curriculum_sequence: brief.curriculum_sequence,
      lesson_id: brief.lesson_id
    }
  });
  const chatgpt = makeFakeChatGptAdapter(chatOverrides, { events });
  const mask = {
    async arm(tabId) {
      events.push('mask.arm');
      if (maskArm) return maskArm(tabId);
      return { armed: true };
    }
  };
  const supervisor = {
    async start(input) {
      events.push('supervisor.start');
      if (supervisorStart) return supervisorStart(input);
      return { status: 'ON' };
    }
  };

  return {
    repos,
    deps: {
      config: {
        projectUrl: PROJECT_URL,
        teacherRoleUrl: 'https://drive.google.com/teacher-role',
        speakingMethodUrl: 'https://drive.google.com/speaking-method',
        listeningMethodUrl: 'https://drive.google.com/listening-method'
      },
      journal: repos.journal,
      sessions: repos.sessions,
      curriculum: repos.curriculum,
      briefs: repos.briefs,
      chatgpt,
      mask,
      supervisor,
      createSessionId: () => 'S-NEW'
    }
  };
}

test('new START follows durable ordering and never starts Voice before chat binding', async () => {
  const events = [];
  const { deps, repos } = makeDeps({
    events,
    chatOverrides: {
      openProject: 41,
      waitForConversationUrl: 'https://chatgpt.com/g/g-p-enpal/c/new-1',
      startVoice: async () => {
        assert.ok(events.indexOf('sessions.bindChat') >= 0);
        return { ok: true, active: true };
      }
    }
  });

  const result = await createWorkflow(deps).start();

  assert.equal(result.action, 'STARTED');
  assert.equal(result.session.session_id, 'S-NEW');
  assert.equal(repos.createdCount, 1);

  const ordered = [
    'sessions.listActive',
    'briefs.readActive',
    'curriculum.getLesson',
    'sessions.createStartingSession',
    'journal.write',
    'chatgpt.openProject',
    'journal.write',
    'chatgpt.waitForProjectReady',
    'chatgpt.createConversation',
    'mask.arm',
    'chatgpt.sendControl',
    'chatgpt.waitForConversationUrl',
    'sessions.bindChat',
    'chatgpt.waitUntilIdle',
    'sessions.markState:IN_PROGRESS',
    'supervisor.start',
    'chatgpt.startVoice',
    'journal.write'
  ];
  assert.deepEqual(events, ordered);
  assert.equal(repos.journalState.learningReady, true);
  assert.equal(repos.journalState.phase, 'LEARNING_ACTIVE');
});

test('START waits for the configured Project new-chat surface before creating the conversation', async () => {
  const { deps } = makeDeps({
    chatOverrides: {
      openProject: 41,
      waitForProjectReady: async (tabId, projectUrl) => {
        assert.equal(tabId, 41);
        assert.equal(projectUrl, PROJECT_URL);
        return { ok: true, projectReady: true };
      },
      waitForConversationUrl: 'https://chatgpt.com/g/g-p-enpal/c/new-1'
    }
  });

  await createWorkflow(deps).start();

  const names = deps.chatgpt.calls.map(call => call.name);
  assert.ok(names.indexOf('waitForProjectReady') >= 0);
  assert.ok(names.indexOf('waitForProjectReady') < names.indexOf('createConversation'));
  assert.ok(names.indexOf('createConversation') < names.indexOf('sendControl'));
  assert.ok(names.indexOf('sendControl') < names.indexOf('waitForConversationUrl'));
  assert.ok(names.indexOf('waitForConversationUrl') < names.indexOf('waitUntilIdle'));
});

test('START sends approved Teacher Role, correct Method, and ACTIVE Brief in ENPAL_CONTROL', async () => {
  const { deps } = makeDeps({
    brief: makeBrief('Listening'),
    chatOverrides: {
      openProject: 41,
      waitForConversationUrl: 'https://chatgpt.com/g/g-p-enpal/c/new-1'
    }
  });

  await createWorkflow(deps).start();

  const control = deps.chatgpt.calls.find((call) => call.name === 'sendControl').args[1];
  assert.match(control, /^ENPAL_CONTROL\n/);
  assert.match(control, /type=START/);
  assert.match(control, /https:\/\/drive\.google\.com\/teacher-role/);
  assert.match(control, /https:\/\/drive\.google\.com\/listening-method/);
  assert.match(control, /"lesson_id":"L1"/);
});

test('STARTING recovery safely binds pending conversation and does not create another chat', async () => {
  const session = {
    session_id: 'S-001',
    status: 'STARTING',
    phase: 'SESSION_STUB_CREATED',
    chat_url: '',
    curriculum_version: 'v1',
    curriculum_sequence: 1,
    lesson_id: 'L1'
  };
  const events = [];
  const { deps, repos } = makeDeps({
    events,
    activeSessions: [session],
    journal: { sessionId: 'S-001', pendingTabId: 77 },
    chatOverrides: {
      getConversationUrl: async (tabId) => {
        assert.equal(tabId, 77);
        return 'https://chatgpt.com/g/g-p-enpal/c/recovered';
      }
    }
  });

  const result = await createWorkflow(deps).start();

  assert.equal(result.action, 'RECOVERED_START');
  assert.equal(repos.createdCount, 0);
  assert.equal(
    deps.chatgpt.calls.filter((call) => call.name === 'createConversation').length,
    0
  );
  assert.equal(
    repos.sessionsState[0].chat_url,
    'https://chatgpt.com/g/g-p-enpal/c/recovered'
  );
});

test('unsafe pending tab creates replacement conversation with same session_id and no second Session row', async () => {
  const session = {
    session_id: 'S-001',
    status: 'STARTING',
    phase: 'SESSION_STUB_CREATED',
    chat_url: '',
    curriculum_version: 'v1',
    curriculum_sequence: 1,
    lesson_id: 'L1'
  };
  const { deps, repos } = makeDeps({
    activeSessions: [session],
    journal: { sessionId: 'S-001', pendingTabId: 77 },
    chatOverrides: {
      openProject: 88,
      getConversationUrl: async (tabId) => (
        tabId === 77
          ? 'https://chatgpt.com/'
          : 'https://chatgpt.com/g/g-p-enpal/c/replacement'
      )
    }
  });

  const result = await createWorkflow(deps).start();

  assert.equal(result.action, 'RECOVERED_START');
  assert.equal(repos.createdCount, 0);
  assert.equal(
    deps.chatgpt.calls.filter((call) => call.name === 'createConversation').length,
    1
  );
  assert.equal(repos.sessionsState.length, 1);
  assert.equal(repos.sessionsState[0].session_id, 'S-001');
});

test('RESUME opens exact bound URL, validates brief, arms mask before control, and never creates chat', async () => {
  const session = {
    session_id: 'S-PAUSED',
    status: 'PAUSED',
    chat_url: 'https://chatgpt.com/g/g-p-enpal/c/paused-1',
    curriculum_version: 'v1',
    curriculum_sequence: 1,
    lesson_id: 'L1',
    pause_checkpoint: 'Learner finished greeting; continue with clarification questions.'
  };
  const events = [];
  const { deps } = makeDeps({
    events,
    activeSessions: [session],
    chatOverrides: {
      openConversation: 55,
      getConversationUrl: 'https://chatgpt.com/g/g-p-enpal/c/paused-1'
    }
  });

  const result = await createWorkflow(deps).start();

  assert.equal(result.action, 'RESUMED');
  assert.deepEqual(
    deps.chatgpt.calls.find((call) => call.name === 'openConversation').args,
    [session.chat_url]
  );
  assert.equal(
    deps.chatgpt.calls.filter((call) => call.name === 'createConversation').length,
    0
  );
  assert.ok(events.indexOf('mask.arm') < events.indexOf('chatgpt.sendControl'));

  const control = deps.chatgpt.calls.find((call) => call.name === 'sendControl').args[1];
  assert.match(control, /type=RESUME/);
  assert.match(control, /Pause Checkpoint/);
  assert.match(control, /S-PAUSED/);
});

test('RESUME fails closed when ACTIVE Brief identity does not match paused Session', async () => {
  const session = {
    session_id: 'S-PAUSED',
    status: 'PAUSED',
    chat_url: 'https://chatgpt.com/g/g-p-enpal/c/paused-1',
    curriculum_version: 'v1',
    curriculum_sequence: 1,
    lesson_id: 'L1'
  };
  const { deps } = makeDeps({
    activeSessions: [session],
    brief: {
      ...makeBrief(),
      lesson_id: 'L2'
    }
  });

  await assert.rejects(
    createWorkflow(deps).start(),
    (error) => error.code === 'CONSISTENCY_ERROR'
  );
  assert.equal(deps.chatgpt.calls.length, 0);
});

test('required Listening Mask failure stops before lesson control is sent', async () => {
  const { deps } = makeDeps({
    maskArm: async () => {
      const error = new Error('mask failed');
      error.code = 'MASK_REQUIRED';
      throw error;
    },
    chatOverrides: {
      openProject: 41
    }
  });

  await assert.rejects(
    createWorkflow(deps).start(),
    (error) => error.code === 'MASK_REQUIRED'
  );
  assert.equal(
    deps.chatgpt.calls.some((call) => call.name === 'sendControl'),
    false
  );
});

test('Supervisor start failure is fail-open and Voice still starts with degraded status recorded', async () => {
  const { deps, repos } = makeDeps({
    supervisorStart: async () => {
      throw new Error('supervisor unavailable');
    },
    chatOverrides: {
      openProject: 41,
      waitForConversationUrl: 'https://chatgpt.com/g/g-p-enpal/c/new-1'
    }
  });

  const result = await createWorkflow(deps).start();

  assert.equal(result.supervisorStatus, 'DEGRADED');
  assert.equal(repos.journalState.supervisorStatus, 'DEGRADED');
  assert.equal(
    deps.chatgpt.calls.filter((call) => call.name === 'startVoice').length,
    1
  );
});
