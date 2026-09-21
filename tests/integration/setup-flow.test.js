import test from 'node:test';
import assert from 'node:assert/strict';
import { createSetupGate } from '../../core/setup-gate.js';
import { createWorkflow } from '../../core/workflow.js';

function validConfig() {
  return {
    projectUrl: 'https://chatgpt.com/g/g-p-enpal',
    curriculumSpreadsheetId: 'curriculum',
    databaseSpreadsheetId: 'database',
    sessionBriefSpreadsheetId: 'brief',
    reviewLedgerSpreadsheetId: 'review',
    teacherRoleUrl: 'https://drive.google.com/teacher-role',
    speakingMethodUrl: 'https://drive.google.com/speaking-method',
    listeningMethodUrl: 'https://drive.google.com/listening-method'
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
      name: 'platform gate marker',
      overrides: {
        hasPlatformGateMarker: async () => false
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
  assert.equal(blocked.state, 'SETUP_REQUIRED');
});
