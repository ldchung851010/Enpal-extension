import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorkflow } from '../../core/workflow.js';

function makeWorkspaceHarness(id) {
  const projectUrl = 'https://chatgpt.com/g/g-p-' + id;
  const chatUrl = projectUrl + '/c/chat-' + id;
  const brief = {
    ready: true,
    curriculum_version: 'v1',
    curriculum_sequence: 1,
    lesson_id: 'L-' + id,
    'Primary Skill': 'Speaking',
    'Communicative Goal': 'Give a short update.'
  };

  let session = null;
  let journal = {};
  const controls = [];

  const sessions = {
    async listActive() {
      return session && ['STARTING', 'IN_PROGRESS', 'PAUSED', 'PROCESSING'].includes(session.status)
        ? [{ ...session }]
        : [];
    },
    async createStartingSession(value) {
      session = { ...value, status: 'STARTING' };
      return { ...session };
    },
    async bindChat(sessionId, url) {
      assert.equal(sessionId, session.session_id);
      session = { ...session, chat_url: url };
      return { ...session };
    },
    async markState(sessionId, status, patch = {}) {
      assert.equal(sessionId, session.session_id);
      session = { ...session, ...patch, status };
      return { ...session };
    },
    async getById(sessionId) {
      assert.equal(sessionId, session.session_id);
      return { ...session };
    }
  };

  const workflow = createWorkflow({
    config: {
      id,
      projectUrl,
      curriculumSpreadsheetId: 'curriculum-' + id,
      databaseSpreadsheetId: 'database-' + id,
      sessionBriefSpreadsheetId: 'brief-' + id,
      reviewLedgerSpreadsheetId: 'review-' + id,
      teacherRoleUrl: 'https://drive.google.com/teacher',
      speakingMethodUrl: 'https://drive.google.com/speaking',
      listeningMethodUrl: 'https://drive.google.com/listening'
    },
    journal: {
      async read() {
        return { ...journal };
      },
      async write(patch) {
        journal = { ...journal, ...patch };
        return { ...journal };
      }
    },
    sessions,
    curriculum: {
      async getLesson() {
        return {
          curriculum_version: brief.curriculum_version,
          curriculum_sequence: brief.curriculum_sequence,
          lesson_id: brief.lesson_id
        };
      }
    },
    briefs: {
      async readActive() {
        return { ...brief };
      }
    },
    chatgpt: {
      async openProject(url) {
        assert.equal(url, projectUrl);
        return id === 'A' ? 11 : 22;
      },
      async waitForProjectReady() {
        return { ok: true };
      },
      async createConversation() {
        return { ok: true };
      },
      async waitForConversationUrl() {
        return chatUrl;
      },
      async openConversation(url) {
        assert.equal(url, chatUrl);
        return id === 'A' ? 11 : 22;
      },
      async getConversationUrl() {
        return chatUrl;
      },
      async sendControl(_tabId, text) {
        controls.push(text);
        if (/\ntype=PAUSE\n/.test(text)) {
          session = {
            ...session,
            status: 'PAUSED',
            phase: 'PAUSE_COMMITTED',
            pause_checkpoint: 'Continue from workspace ' + id
          };
        }
        return { ok: true };
      },
      async waitUntilIdle() {
        return { ok: true };
      },
      async startVoice() {
        return { ok: true, active: true };
      },
      async stopVoice() {
        return { ok: true, active: false };
      }
    },
    mask: {
      async arm() {
        return { armed: true };
      }
    },
    supervisor: {
      async start() {
        return { status: 'DEGRADED' };
      },
      stop() {
        return { status: 'OFF' };
      }
    },
    createSessionId: () => 'S-' + id,
    pauseVerifyAttempts: 1,
    pausePollMs: 0
  });

  return {
    workflow,
    controls,
    get session() {
      return session ? { ...session } : null;
    },
    get journal() {
      return { ...journal };
    }
  };
}

test('A can pause, B can start independently, then A resumes its exact chat', async () => {
  const A = makeWorkspaceHarness('A');
  const B = makeWorkspaceHarness('B');

  assert.equal((await A.workflow.start()).action, 'STARTED');
  assert.equal(A.session.chat_url, 'https://chatgpt.com/g/g-p-A/c/chat-A');

  assert.equal((await A.workflow.pause()).action, 'PAUSED');
  assert.equal(A.session.status, 'PAUSED');

  assert.equal((await B.workflow.start()).action, 'STARTED');
  assert.equal(B.session.chat_url, 'https://chatgpt.com/g/g-p-B/c/chat-B');
  assert.equal(B.session.session_id, 'S-B');

  assert.equal((await A.workflow.start()).action, 'RESUMED');
  assert.equal(A.session.session_id, 'S-A');
  assert.equal(A.session.chat_url, 'https://chatgpt.com/g/g-p-A/c/chat-A');

  assert.equal(
    A.controls.every(text => text.includes('workspace_id=A')),
    true
  );
  assert.equal(
    B.controls.every(text => text.includes('workspace_id=B')),
    true
  );
});
