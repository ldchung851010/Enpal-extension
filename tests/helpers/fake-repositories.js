export function makeRecoveryInput({
  journal = {},
  activeSessions = [],
  activeBrief = null
} = {}) {
  return {
    journal: { ...journal },
    activeSessions: activeSessions.map((session) => ({ ...session })),
    activeBrief: activeBrief ? { ...activeBrief } : null
  };
}

export function createFakeRecoveryRepositories({
  journal = {},
  activeSessions = [],
  activeBrief = null
} = {}) {
  const events = [];

  return {
    events,
    journal: {
      async read() {
        events.push('journal.read');
        return { ...journal };
      }
    },
    sessions: {
      async listActive() {
        events.push('sessions.listActive');
        return activeSessions.map((session) => ({ ...session }));
      }
    },
    briefs: {
      async readActive() {
        events.push('briefs.readActive');
        return activeBrief ? { ...activeBrief } : null;
      }
    }
  };
}

export function createFakeWorkflowRepositories({
  events = [],
  journal = {},
  activeSessions = [],
  activeBrief,
  curriculumLesson
} = {}) {
  let journalState = { ...journal };
  const sessionsState = activeSessions.map((session) => ({ ...session }));
  let createdCount = 0;

  const journalRepo = {
    async read() {
      events.push('journal.read');
      return { ...journalState };
    },
    async write(patch) {
      events.push('journal.write');
      journalState = { ...journalState, ...patch };
      return { ...journalState };
    },
    async clear() {
      events.push('journal.clear');
      journalState = {};
    }
  };

  const sessions = {
    async listActive() {
      events.push('sessions.listActive');
      return sessionsState.filter((session) =>
        ['STARTING', 'IN_PROGRESS', 'PAUSED', 'PROCESSING'].includes(session.status)
      ).map((session) => ({ ...session }));
    },
    async createStartingSession(session) {
      events.push('sessions.createStartingSession');
      createdCount += 1;
      const stored = { ...session, status: 'STARTING', chat_url: session.chat_url ?? '' };
      sessionsState.push(stored);
      return { ...stored };
    },
    async bindChat(sessionId, chatUrl) {
      events.push('sessions.bindChat');
      const session = sessionsState.find((item) => item.session_id === sessionId);
      if (!session) throw new Error('Session not found: ' + sessionId);
      if (session.chat_url && session.chat_url !== chatUrl) {
        throw new Error('Session already bound to another chat');
      }
      session.chat_url = chatUrl;
      session.phase = 'CHAT_BOUND';
      return { ...session };
    },
    async markState(sessionId, status, patch = {}) {
      events.push('sessions.markState:' + status);
      const session = sessionsState.find((item) => item.session_id === sessionId);
      if (!session) throw new Error('Session not found: ' + sessionId);
      Object.assign(session, patch, { status });
      return { ...session };
    }
  };

  const briefs = {
    async readActive() {
      events.push('briefs.readActive');
      return activeBrief ? { ...activeBrief } : null;
    }
  };

  const curriculum = {
    async getLesson(sequence) {
      events.push('curriculum.getLesson');
      if (curriculumLesson && Number(curriculumLesson.curriculum_sequence) === Number(sequence)) {
        return { ...curriculumLesson };
      }
      return null;
    }
  };

  return {
    events,
    journal: journalRepo,
    sessions,
    briefs,
    curriculum,
    get createdCount() {
      return createdCount;
    },
    get journalState() {
      return { ...journalState };
    },
    get sessionsState() {
      return sessionsState.map((session) => ({ ...session }));
    }
  };
}


export function createCrashRecoveryRepositories({
  events = [],
  session,
  journal = {},
  activeBrief,
  nextLesson,
  stagingReady = false,
  priorReviewLedgerApplyCount = 0,
  priorCurriculumAdvanceCount = 0
} = {}) {
  const sessionsState = session ? [{ ...session }] : [];
  let journalState = { ...journal };
  let activeBriefState = activeBrief ? { ...activeBrief } : null;
  let stagingIsReady = stagingReady;
  const metrics = {
    reviewLedgerApplyCount: priorReviewLedgerApplyCount,
    curriculumAdvanceCount: priorCurriculumAdvanceCount,
    createStartingSessionCount: 0
  };

  function findSession(sessionId) {
    return sessionsState.find((item) => item.session_id === sessionId) ?? null;
  }

  const journalRepo = {
    async read() {
      events.push('journal.read');
      return { ...journalState };
    },
    async write(patch) {
      events.push('journal.write:' + (patch.phase ?? patch.appState ?? 'metadata'));
      journalState = { ...journalState, ...patch };
      return { ...journalState };
    },
    async clear() {
      events.push('journal.clear');
      journalState = {};
    }
  };

  const sessions = {
    async listActive() {
      events.push('sessions.listActive');
      return sessionsState
        .filter((item) => ['STARTING', 'IN_PROGRESS', 'PAUSED', 'PROCESSING'].includes(item.status))
        .map((item) => ({ ...item }));
    },
    async getById(sessionId) {
      events.push('sessions.getById');
      const found = findSession(sessionId);
      return found ? { ...found } : null;
    },
    async createStartingSession(nextSession) {
      events.push('sessions.createStartingSession');
      metrics.createStartingSessionCount += 1;
      const stored = {
        ...nextSession,
        status: 'STARTING',
        chat_url: nextSession.chat_url ?? ''
      };
      sessionsState.push(stored);
      return { ...stored };
    },
    async bindChat(sessionId, chatUrl) {
      events.push('sessions.bindChat');
      const found = findSession(sessionId);
      if (!found) throw new Error('Session not found: ' + sessionId);
      if (found.chat_url && found.chat_url !== chatUrl) {
        throw new Error('Session already bound to another chat');
      }
      found.chat_url = chatUrl;
      found.phase = 'CHAT_BOUND';
      return { ...found };
    },
    async markState(sessionId, status, patch = {}) {
      const phase = patch.phase ?? findSession(sessionId)?.phase ?? '';
      events.push('sessions.markState:' + status + ':' + phase);
      const found = findSession(sessionId);
      if (!found) throw new Error('Session not found: ' + sessionId);
      Object.assign(found, patch, { status });
      return { ...found };
    }
  };

  const curriculum = {
    async getLesson(sequence) {
      events.push('curriculum.getLesson');
      const wanted = Number(sequence);
      if (Number(activeBrief?.curriculum_sequence) === wanted) {
        return {
          curriculum_version: activeBrief.curriculum_version,
          curriculum_sequence: activeBrief.curriculum_sequence,
          lesson_id: activeBrief.lesson_id
        };
      }
      const current = sessionsState[0];
      if (current && Number(current.curriculum_sequence) === wanted) {
        return {
          curriculum_version: current.curriculum_version,
          curriculum_sequence: current.curriculum_sequence,
          lesson_id: current.lesson_id
        };
      }
      return null;
    },
    async getNextLesson() {
      events.push('curriculum.getNextLesson');
      return nextLesson ? { ...nextLesson } : null;
    }
  };

  const briefs = {
    async readActive() {
      events.push('briefs.readActive');
      return activeBriefState ? { ...activeBriefState } : null;
    },
    async verifyStaging(expected) {
      events.push('briefs.verifyStaging');
      if (!stagingIsReady) throw new Error('staging not ready');
      if (
        expected.curriculum_version !== nextLesson.curriculum_version ||
        Number(expected.curriculum_sequence) !== Number(nextLesson.curriculum_sequence) ||
        expected.lesson_id !== nextLesson.lesson_id
      ) {
        throw new Error('unexpected staging identity');
      }
      return { ...nextLesson, ready: true };
    },
    async promoteStaging() {
      events.push('briefs.promoteStaging');
      if (!stagingIsReady) throw new Error('staging not ready');
      metrics.curriculumAdvanceCount += 1;
      activeBriefState = { ...nextLesson, ready: true };
      stagingIsReady = false;
      return { ok: true };
    }
  };

  function commitControl(type) {
    const current = sessionsState[0];
    if (!current) return;
    if (type === 'ANALYZE') {
      current.status = 'PROCESSING';
      current.phase = 'ANALYZE_COMMITTED';
      current.analyze_result = 'durable analyze result';
    } else if (type === 'UPDATE') {
      metrics.reviewLedgerApplyCount += 1;
      current.status = 'PROCESSING';
      current.phase = 'UPDATE_COMMITTED';
    } else if (type === 'REVIEW_PLANNER') {
      stagingIsReady = true;
    }
  }

  return {
    events,
    journal: journalRepo,
    sessions,
    curriculum,
    briefs,
    commitControl,
    metrics,
    get journalState() {
      return { ...journalState };
    },
    get sessionsState() {
      return sessionsState.map((item) => ({ ...item }));
    },
    get activeBriefState() {
      return activeBriefState ? { ...activeBriefState } : null;
    },
    get stagingReady() {
      return stagingIsReady;
    }
  };
}
