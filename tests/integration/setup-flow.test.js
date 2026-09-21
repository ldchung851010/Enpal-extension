import test from 'node:test';
import assert from 'node:assert/strict';
import { createSetupGate } from '../../core/setup-gate.js';
import { createWorkflow } from '../../core/workflow.js';

function validConfig() {
  return {
    id: 'A',
    name: 'Workspace A',
    projectUrl: 'https://chatgpt.com/g/g-p-enpal',
    curriculumSpreadsheetId: 'curriculum',
    databaseSpreadsheetId: 'database',
    sessionBriefSpreadsheetId: 'brief',
    reviewLedgerSpreadsheetId: 'review',
    teacherRoleUrl: 'https://drive.google.com/teacher-role',
    speakingMethodUrl: 'https://drive.google.com/speaking-method',
    listeningMethodUrl: 'https://drive.google.com/listening-method',
    sessionBriefActiveSheetId: 101,
    sessionBriefStagingSheetId: 202
  };
}

function validBrief() {
  return {
    ready: true,
    curriculum_version: 'v1',
    curriculum_sequence: 1,
    lesson_id: 'L1',
    'Primary Skill': 'Speaking',
    'Communicative Goal': 'Handle a short workplace exchange.'
  };
}

function makeSetup(overrides = {}) {
  const calls = [];
  const gate = createSetupGate({
    rawConfig: overrides.rawConfig ?? validConfig(),
    authorizeGoogle: overrides.authorizeGoogle ?? (async (interactive) => {
      calls.push(['authorizeGoogle', interactive]);
      return 'token';
    }),
    verifySheetsAccess: overrides.verifySheetsAccess ?? (async ({ config, token }) => {
      calls.push(['verifySheetsAccess', token, [
        config.curriculumSpreadsheetId,
        config.databaseSpreadsheetId,
        config.sessionBriefSpreadsheetId,
        config.reviewLedgerSpreadsheetId
      ]]);
      return { read: true, write: true };
    }),
    hasPlatformGateMarker: overrides.hasPlatformGateMarker ?? (async () => {
      calls.push(['hasPlatformGateMarker']);
      return true;
    }),
    markPlatformGateVerified: overrides.markPlatformGateVerified ?? (async () => {
      calls.push(['markPlatformGateVerified']);
    }),
    readActiveBrief: overrides.readActiveBrief ?? (async () => {
      calls.push(['readActiveBrief']);
      return validBrief();
    })
  });
  return { gate, calls };
}

test('setup reaches READY only after all five setup requirements verify', async () => {
  const { gate, calls } = makeSetup();
  const result = await gate.verify({ interactive: true });

  assert.equal(result.state, 'READY');
  assert.equal(result.brief.lesson_id, 'L1');
  assert.deepEqual(calls, [
    ['authorizeGoogle', true],
    ['verifySheetsAccess', 'token', ['curriculum', 'database', 'brief', 'review']],
    ['hasPlatformGateMarker'],
    ['readActiveBrief']
  ]);
});

test('missing any setup requirement keeps app in SETUP_REQUIRED', async () => {
  const cases = [
    {
      name: 'runtime config',
      overrides: { rawConfig: { ...validConfig(), projectUrl: '' } }
    },
    {
      name: 'interactive Google OAuth',
      overrides: {
        authorizeGoogle: async () => {
          throw new Error('oauth denied');
        }
      }
    },
    {
      name: 'Sheets read/write',
      overrides: {
        verifySheetsAccess: async () => ({ read: true, write: false })
      }
    },
    {
      name: 'ACTIVE Session Brief',
      overrides: {
        readActiveBrief: async () => ({ ...validBrief(), ready: false })
      }
    }
  ];

  for (const entry of cases) {
    const { gate } = makeSetup(entry.overrides);
    const result = await gate.verify({ interactive: true });
    assert.equal(result.state, 'SETUP_REQUIRED', entry.name);
  }
});

test('workflow.recover exposes setup state without letting the Side Panel reach repositories directly', async () => {
  const readyGate = makeSetup().gate;
  const workflow = createWorkflow({
    setupGate: readyGate,
    sessions: {
      async listActive() {
        return [];
      }
    },
    briefs: {
      async readActive() {
        return validBrief();
      }
    },
    journal: {
      async read() {
        return {};
      }
    }
  });

  const ready = await workflow.recover({ interactiveSetup: true });
  assert.equal(ready.state, 'READY');

  const blockedWorkflow = createWorkflow({
    setupGate: makeSetup({
      hasPlatformGateMarker: async () => false
    }).gate,
    sessions: {
      async listActive() {
        throw new Error('repositories must not be read when setup is blocked');
      }
    },
    briefs: {},
    journal: {}
  });

  const blocked = await blockedWorkflow.recover({ interactiveSetup: true });
  assert.equal(blocked.state, 'PLATFORM_VERIFICATION_REQUIRED');
});


test('missing platform gate requests explicit live confirmation instead of looking like a dead setup button', async () => {
  const { gate } = makeSetup({
    hasPlatformGateMarker: async () => false
  });

  const result = await gate.verify({ interactive: true });

  assert.equal(result.state, 'PLATFORM_VERIFICATION_REQUIRED');
  assert.match(result.reason, /project access/i);
});

test('workflow confirms live Project access through setup gate, then re-runs setup to READY', async () => {
  let marker = false;
  const { gate } = makeSetup({
    hasPlatformGateMarker: async () => marker,
    markPlatformGateVerified: async () => {
      marker = true;
    }
  });

  const workflow = createWorkflow({
    setupGate: gate,
    sessions: {
      async listActive() {
        return [];
      }
    },
    briefs: {
      async readActive() {
        return validBrief();
      }
    },
    journal: {
      async read() {
        return {};
      }
    }
  });

  const blocked = await workflow.recover({ interactiveSetup: true });
  assert.equal(blocked.state, 'PLATFORM_VERIFICATION_REQUIRED');

  const ready = await workflow.confirmPlatformGate();
  assert.equal(ready.state, 'READY');
  assert.equal(marker, true);
});


test('workflow.verifySetup is setup-only even when a STARTING Session exists', async () => {
  const { gate } = makeSetup();
  let repositoryReads = 0;
  let chatCalls = 0;
  const workflow = createWorkflow({
    setupGate: gate,
    sessions: {
      async listActive() {
        repositoryReads += 1;
        return [{ session_id: 'S-001', status: 'STARTING', chat_url: '' }];
      }
    },
    briefs: {
      async readActive() {
        repositoryReads += 1;
        return validBrief();
      }
    },
    journal: {
      async read() {
        repositoryReads += 1;
        return { sessionId: 'S-001', pendingTabId: 77 };
      }
    },
    chatgpt: new Proxy({}, {
      get() {
        return async () => {
          chatCalls += 1;
          throw new Error('Verify setup must not touch ChatGPT');
        };
      }
    })
  });

  const result = await workflow.verifySetup({ interactive: true });

  assert.equal(result.state, 'READY');
  assert.equal(repositoryReads, 0);
  assert.equal(chatCalls, 0);
});

test('workflow.inspect reports incomplete START as retryable without recovering it', async () => {
  const { gate } = makeSetup();
  let chatCalls = 0;
  const session = {
    session_id: 'S-001',
    status: 'STARTING',
    phase: 'SESSION_STUB_CREATED',
    chat_url: ''
  };
  const workflow = createWorkflow({
    setupGate: gate,
    sessions: {
      async listActive() {
        return [session];
      }
    },
    briefs: {
      async readActive() {
        return validBrief();
      }
    },
    journal: {
      async read() {
        return { sessionId: 'S-001', pendingTabId: 77 };
      }
    },
    chatgpt: new Proxy({}, {
      get() {
        return async () => {
          chatCalls += 1;
          throw new Error('Inspect must not touch ChatGPT');
        };
      }
    })
  });

  const result = await workflow.inspect();

  assert.equal(result.state, 'ERROR');
  assert.equal(result.recoverable, true);
  assert.match(result.reason, /incomplete START/i);
  assert.equal(chatCalls, 0);
});

test('confirmPlatformGate verifies setup but does not recover a STARTING Session', async () => {
  let marker = false;
  const { gate } = makeSetup({
    hasPlatformGateMarker: async () => marker,
    markPlatformGateVerified: async () => {
      marker = true;
    }
  });
  let repositoryReads = 0;
  const workflow = createWorkflow({
    setupGate: gate,
    sessions: {
      async listActive() {
        repositoryReads += 1;
        throw new Error('confirmation must not inspect or recover Sessions');
      }
    },
    briefs: {
      async readActive() {
        repositoryReads += 1;
        return validBrief();
      }
    },
    journal: {
      async read() {
        repositoryReads += 1;
        return {};
      }
    }
  });

  const result = await workflow.confirmPlatformGate();

  assert.equal(result.state, 'READY');
  assert.equal(marker, true);
  assert.equal(repositoryReads, 0);
});


test('workflow.inspect reports interrupted IN_PROGRESS recovery without restarting ChatGPT', async () => {
  const { gate } = makeSetup();
  let chatCalls = 0;
  const workflow = createWorkflow({
    setupGate: gate,
    sessions: {
      async listActive() {
        return [{
          session_id: 'S-002',
          status: 'IN_PROGRESS',
          phase: 'CHAT_BOUND',
          chat_url: 'https://chatgpt.com/g/g-p-enpal/c/abc'
        }];
      }
    },
    briefs: {
      async readActive() {
        return validBrief();
      }
    },
    journal: {
      async read() {
        return { sessionId: 'S-002', learningReady: false };
      }
    },
    chatgpt: new Proxy({}, {
      get() {
        return async () => {
          chatCalls += 1;
          throw new Error('Inspect must not restart ChatGPT');
        };
      }
    })
  });

  const result = await workflow.inspect();

  assert.equal(result.state, 'ERROR');
  assert.equal(result.recoverable, true);
  assert.match(result.reason, /interrupted learning/i);
  assert.equal(chatCalls, 0);
});
