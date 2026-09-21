import { createWorkflow } from '../core/workflow.js';
import { createSetupGate } from '../core/setup-gate.js';
import { createChatGptAdapter } from '../adapters/chatgpt-adapter.js';
import { createListeningMaskController } from '../listening/listening-mask-controller.js';
import { getGoogleAccessToken } from '../storage/google-auth.js';
import { createSheetsClient } from '../storage/sheets-client.js';
import { createCurriculumRepository } from '../storage/curriculum-repository.js';
import { createSessionRepository } from '../storage/session-repository.js';
import { createSessionBriefRepository } from '../storage/session-brief-repository.js';
import { createLocalJournal } from '../storage/local-journal.js';

export const PLATFORM_GATE_KEY = 'enpalPlatformGate';

export const RUNTIME_CONFIG = Object.freeze({
  projectUrl: 'https://chatgpt.com/g/g-p-6aa9f3ea98a481918727756027f94208-test',
  curriculumSpreadsheetId: '19Q6x9dOJVY-yRxuInThBj1gODQWAmyV1-EbeOh-2JLU',
  databaseSpreadsheetId: '13zDzNQSgxicIUBm8oE0CVAXzheTJ45KeeRrsaT3pJv4',
  sessionBriefSpreadsheetId: '1MsD-v6olhkecgBxFzWZg61f1WPo42u7hFhNQRgYk-QU',
  reviewLedgerSpreadsheetId: '1sQRdyjVvmQCOXPx6w-HHwGP1xeP8mjy5n2aHojJjzDs',
  teacherRoleUrl: 'https://drive.google.com/file/d/10NgizUp3AnnUSAZBqLexzu46sYqRqEO6/view',
  speakingMethodUrl: 'https://drive.google.com/file/d/1TeCJGwJmPlOSKZDHffid0iPreeSdxXWN/view',
  listeningMethodUrl: 'https://drive.google.com/file/d/1rYg8dYxlJNwAltjPn9dg8xz3_bkTTSZL/view'
});

const SESSION_BRIEF_SHEET_IDS = Object.freeze({
  active: 498055014,
  staging: 873615671
});

function createDegradedSupervisor() {
  return {
    async start() {
      return { status: 'DEGRADED' };
    },
    stop() {
      return { status: 'OFF' };
    }
  };
}

async function readPlatformGateMarker(chromeApi) {
  const result = await chromeApi.storage.local.get(PLATFORM_GATE_KEY);
  const marker = result?.[PLATFORM_GATE_KEY];
  return marker === 'PASS' || marker?.status === 'PASS';
}

async function verifyRequiredSheets({ config, token, fetchImpl }) {
  const probe = createSheetsClient({
    getToken: async () => token,
    fetchImpl
  });

  const [
    curriculumHeader,
    databaseHeader,
    briefHeader,
    reviewHeader
  ] = await Promise.all([
    probe.getValues(config.curriculumSpreadsheetId, 'CURRICULUM!A1:A1'),
    probe.getValues(config.databaseSpreadsheetId, 'Sessions!A1:A1'),
    probe.getValues(config.sessionBriefSpreadsheetId, 'ACTIVE!A1:A1'),
    probe.getValues(config.reviewLedgerSpreadsheetId, 'A1:A1')
  ]);

  const readable = [
    curriculumHeader,
    databaseHeader,
    briefHeader,
    reviewHeader
  ].every((values) => Array.isArray(values));

  const databaseMarker = databaseHeader?.[0]?.[0];
  if (!readable || typeof databaseMarker !== 'string' || databaseMarker === '') {
    return { read: readable, write: false };
  }

  // Idempotent permission probe: write the existing Sessions header back unchanged.
  await probe.updateValues(
    config.databaseSpreadsheetId,
    'Sessions!A1',
    [[databaseMarker]]
  );

  return { read: true, write: true };
}

export function createRuntimeWorkflow({
  chromeApi = chrome,
  fetchImpl = fetch,
  config = RUNTIME_CONFIG
} = {}) {
  const getToken = (interactive = false) =>
    getGoogleAccessToken(chromeApi, interactive);

  const sheets = createSheetsClient({
    getToken: () => getToken(false),
    fetchImpl
  });

  const curriculum = createCurriculumRepository({
    sheets,
    spreadsheetId: config.curriculumSpreadsheetId
  });

  const sessions = createSessionRepository({
    sheets,
    spreadsheetId: config.databaseSpreadsheetId
  });

  const briefs = createSessionBriefRepository({
    sheets,
    spreadsheetId: config.sessionBriefSpreadsheetId,
    activeSheetId: SESSION_BRIEF_SHEET_IDS.active,
    stagingSheetId: SESSION_BRIEF_SHEET_IDS.staging
  });

  const journal = createLocalJournal(chromeApi);
  const chatgpt = createChatGptAdapter(chromeApi);
  const mask = createListeningMaskController(chatgpt);
  const supervisor = createDegradedSupervisor();

  const setupGate = createSetupGate({
    rawConfig: config,
    authorizeGoogle: (interactive) => getToken(interactive),
    verifySheetsAccess: ({ config: setupConfig, token }) =>
      verifyRequiredSheets({
        config: setupConfig,
        token,
        fetchImpl
      }),
    hasPlatformGateMarker: () => readPlatformGateMarker(chromeApi),
    readActiveBrief: () => briefs.readActive()
  });

  return createWorkflow({
    config,
    setupGate,
    journal,
    sessions,
    curriculum,
    briefs,
    chatgpt,
    mask,
    supervisor
  });
}
