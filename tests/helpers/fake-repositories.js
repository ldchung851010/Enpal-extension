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
