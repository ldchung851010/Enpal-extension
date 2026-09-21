import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorkflow } from '../../core/workflow.js';
import { createCrashRecoveryRepositories } from '../helpers/fake-repositories.js';
import { makeCrashRecoveryChatGptAdapter } from '../helpers/fake-chatgpt-adapter.js';

const PROJECT_URL = 'https://chatgpt.com/g/g-p-enpal';
const SESSION_ID = 'S-MATRIX';
const BOUND_URL = PROJECT_URL + '/c/bound-matrix';

const currentBrief = Object.freeze({
  ready: true,
  curriculum_version: 'v1',
  curriculum_sequence: 2,
  lesson_id: 'L2',
  'Primary Skill': 'Speaking',
  'Communicative Goal': 'Handle a short project update.'
});

const nextLesson = Object.freeze({
  curriculum_version: 'v1',
  curriculum_sequence: 3,
  lesson_id: 'L3',
  'Primary Skill': 'Listening',
  'Communicative Goal': 'Follow a short project update.'
});

function session(overrides = {}) {
  return {
    session_id: SESSION_ID,
    status: 'STARTING',
    phase: 'SESSION_STUB_CREATED',
    chat_url: '',
    curriculum_version: 'v1',
    curriculum_sequence: 2,
    lesson_id: 'L2',
    primary_skill: 'Speaking',
    ...overrides
  };
}

const cases = [
  {
    name: 'SESSION_STUB_CREATED',
    session: session(),
    journal: { sessionId: SESSION_ID, phase: 'SESSION_STUB_CREATED', voiceActive: false },
    activeBrief: currentBrief,
    expectedState: 'LEARNING',
    expectedFirstEffect: 'chatgpt.createConversation',
    expectedCreateConversationCount: 1,
    expectedVoiceStarts: 1,
    priorReviewLedgerApplyCount: 0,
    priorCurriculumAdvanceCount: 0,
    expectedOrphans: 0
  },
  {
    name: 'CHAT_CREATED_NOT_BOUND',
    session: session(),
    journal: {
      sessionId: SESSION_ID,
      phase: 'SESSION_STUB_CREATED',
      pendingTabId: 77,
      voiceActive: false
    },
    activeBrief: currentBrief,
    pendingTabId: 77,
    pendingUrl: 'https://chatgpt.com/c/orphan-matrix',
    expectedState: 'LEARNING',
    expectedFirstEffect: 'chatgpt.createConversation',
    expectedCreateConversationCount: 1,
    expectedVoiceStarts: 1,
    priorReviewLedgerApplyCount: 0,
    priorCurriculumAdvanceCount: 0,
    expectedOrphans: 1
  },
  {
    name: 'CHAT_BOUND_BEFORE_VOICE',
    session: session({
      status: 'IN_PROGRESS',
      phase: 'CHAT_BOUND',
      chat_url: BOUND_URL
    }),
    journal: {
      sessionId: SESSION_ID,
      phase: 'SESSION_STUB_CREATED',
      pendingTabId: 77,
      voiceActive: false
    },
    activeBrief: currentBrief,
    expectedState: 'LEARNING',
    expectedFirstEffect: 'chatgpt.startVoice',
    expectedCreateConversationCount: 0,
    expectedVoiceStarts: 1,
    priorReviewLedgerApplyCount: 0,
    priorCurriculumAdvanceCount: 0,
    expectedOrphans: 0
  },
  {
    name: 'PAUSE_COMMITTED',
    session: session({
      status: 'PAUSED',
      phase: 'PAUSE_COMMITTED',
      chat_url: BOUND_URL,
      pause_checkpoint: 'Continue from clarification questions.'
    }),
    journal: {
      sessionId: SESSION_ID,
      phase: 'PAUSE_COMMITTED',
      status: 'PAUSED',
      chatUrl: BOUND_URL,
      voiceActive: false
    },
    activeBrief: currentBrief,
    expectedState: 'PAUSED',
    expectedFirstEffect: null,
    expectedCreateConversationCount: 0,
    expectedVoiceStarts: 0,
    priorReviewLedgerApplyCount: 0,
    priorCurriculumAdvanceCount: 0,
    expectedOrphans: 0
  },
  {
    name: 'ANALYZE_COMMITTED',
    session: session({
      status: 'PROCESSING',
      phase: 'ANALYZE_COMMITTED',
      chat_url: BOUND_URL
    }),
    journal: {
      appState: 'PROCESSING',
      sessionId: SESSION_ID,
      phase: 'ANALYZE_COMMITTED',
      chatUrl: BOUND_URL,
      renameAttempted: false
    },
    activeBrief: currentBrief,
    expectedState: 'READY',
    expectedFirstEffect: 'chatgpt.sendControl:UPDATE',
    expectedCreateConversationCount: 0,
    expectedVoiceStarts: 0,
    priorReviewLedgerApplyCount: 0,
    priorCurriculumAdvanceCount: 0,
    expectedOrphans: 0
  },
  {
    name: 'UPDATE_COMMITTED',
    session: session({
      status: 'PROCESSING',
      phase: 'UPDATE_COMMITTED',
      chat_url: BOUND_URL
    }),
    journal: {
      appState: 'PROCESSING',
      sessionId: SESSION_ID,
      phase: 'UPDATE_COMMITTED',
      chatUrl: BOUND_URL,
      renameAttempted: false
    },
    activeBrief: currentBrief,
    expectedState: 'READY',
    expectedFirstEffect: 'chatgpt.sendControl:REVIEW_PLANNER',
    expectedCreateConversationCount: 0,
    expectedVoiceStarts: 0,
    priorReviewLedgerApplyCount: 1,
    priorCurriculumAdvanceCount: 0,
    expectedOrphans: 0
  },
  {
    name: 'BRIEF_STAGED',
    session: session({
      status: 'PROCESSING',
      phase: 'BRIEF_STAGED',
      chat_url: BOUND_URL
    }),
    journal: {
      appState: 'PROCESSING',
      sessionId: SESSION_ID,
      phase: 'BRIEF_STAGED',
      chatUrl: BOUND_URL,
      renameAttempted: false
    },
    activeBrief: currentBrief,
    stagingReady: true,
    expectedState: 'READY',
    expectedFirstEffect: 'briefs.promoteStaging',
    expectedCreateConversationCount: 0,
    expectedVoiceStarts: 0,
    priorReviewLedgerApplyCount: 1,
    priorCurriculumAdvanceCount: 0,
    expectedOrphans: 0
  },
  {
    name: 'BRIEF_PROMOTED',
    session: session({
      status: 'PROCESSING',
      phase: 'BRIEF_PROMOTED',
      chat_url: BOUND_URL
    }),
    journal: {
      appState: 'PROCESSING',
      sessionId: SESSION_ID,
      phase: 'BRIEF_PROMOTED',
      chatUrl: BOUND_URL,
      renameAttempted: false
    },
    activeBrief: { ...nextLesson, ready: true },
    expectedState: 'READY',
    expectedFirstEffect: 'sessions.markState:COMPLETED:SESSION_COMPLETED',
    expectedCreateConversationCount: 0,
    expectedVoiceStarts: 0,
    priorReviewLedgerApplyCount: 1,
    priorCurriculumAdvanceCount: 1,
    expectedOrphans: 0
  },
  {
    name: 'SESSION_COMPLETED_BEFORE_RENAME',
    session: session({
      status: 'COMPLETED',
      phase: 'SESSION_COMPLETED',
      chat_url: BOUND_URL
    }),
    journal: {
      appState: 'PROCESSING',
      sessionId: SESSION_ID,
      phase: 'SESSION_COMPLETED',
      chatUrl: BOUND_URL,
      renameAttempted: false
    },
    activeBrief: { ...nextLesson, ready: true },
    expectedState: 'READY',
    expectedFirstEffect: 'chatgpt.renameConversation',
    expectedCreateConversationCount: 0,
    expectedVoiceStarts: 0,
    priorReviewLedgerApplyCount: 1,
    priorCurriculumAdvanceCount: 1,
    expectedOrphans: 0
  }
];

const mutationEffects = new Set([
  'chatgpt.createConversation',
  'chatgpt.startVoice',
  'chatgpt.sendControl:UPDATE',
  'chatgpt.sendControl:REVIEW_PLANNER',
  'briefs.promoteStaging',
  'sessions.markState:COMPLETED:SESSION_COMPLETED',
  'chatgpt.renameConversation'
]);

for (const entry of cases) {
  test(entry.name + ' recovers from the first incomplete safe phase', async () => {
    const events = [];
    const repos = createCrashRecoveryRepositories({
      events,
      session: entry.session,
      journal: entry.journal,
      activeBrief: entry.activeBrief,
      nextLesson,
      stagingReady: entry.stagingReady === true,
      priorReviewLedgerApplyCount: entry.priorReviewLedgerApplyCount,
      priorCurriculumAdvanceCount: entry.priorCurriculumAdvanceCount
    });

    const chatgpt = makeCrashRecoveryChatGptAdapter({
      events,
      projectUrl: PROJECT_URL,
      boundUrl: entry.session.chat_url,
      pendingTabId: entry.pendingTabId,
      pendingUrl: entry.pendingUrl,
      onControl: repos.commitControl,
      metrics: repos.metrics
    });

    const workflow = createWorkflow({
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
      journal: repos.journal,
      sessions: repos.sessions,
      curriculum: repos.curriculum,
      briefs: repos.briefs,
      chatgpt,
      mask: {
        async arm() {
          events.push('mask.arm');
          return { armed: true };
        }
      },
      supervisor: {
        async start() {
          events.push('supervisor.start');
          return { status: 'ON' };
        },
        stop() {
          events.push('supervisor.stop');
          return { status: 'OFF' };
        }
      },
      endVerifyAttempts: 2,
      endPollMs: 0,
      sleep: async () => {},
      briefPromotionRange: { rowCount: 14, columnCount: 2 }
    });

    const result = await workflow.recover();

    assert.equal(result.state, entry.expectedState, entry.name + ': learner state');
    assert.equal(repos.sessionsState.length, 1, entry.name + ': one logical Session row');
    assert.equal(
      repos.metrics.createStartingSessionCount,
      0,
      entry.name + ': recovery never creates a second Session row'
    );
    assert.ok(
      repos.metrics.reviewLedgerApplyCount <= 1,
      entry.name + ': Review Ledger transition applies at most once'
    );
    assert.ok(
      repos.metrics.curriculumAdvanceCount <= 1,
      entry.name + ': curriculum advances at most once'
    );
    assert.equal(
      repos.metrics.createConversationCount,
      entry.expectedCreateConversationCount,
      entry.name + ': conversation creation count'
    );
    assert.equal(
      repos.metrics.voiceStartCount,
      entry.expectedVoiceStarts,
      entry.name + ': Voice recovery count'
    );

    const finalBoundUrl = repos.sessionsState[0]?.chat_url ?? '';
    assert.equal(
      chatgpt.orphanCount(finalBoundUrl),
      entry.expectedOrphans,
      entry.name + ': orphan external chat count'
    );
    if (entry.name !== 'CHAT_CREATED_NOT_BOUND') {
      assert.equal(
        chatgpt.orphanCount(finalBoundUrl),
        0,
        entry.name + ': only CHAT_CREATED_NOT_BOUND may leave an orphan'
      );
    }

    const firstEffect = events.find((event) => mutationEffects.has(event)) ?? null;
    assert.equal(
      firstEffect,
      entry.expectedFirstEffect,
      entry.name + ': first legal recovery mutation'
    );
  });
}
