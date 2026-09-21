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
