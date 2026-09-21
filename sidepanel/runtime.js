import { createWorkflow } from '../core/workflow.js';
import { createSetupGate } from '../core/setup-gate.js';
import { createChatGptAdapter } from '../adapters/chatgpt-adapter.js';
import { createListeningMaskController } from '../listening/listening-mask-controller.js';
import { getGoogleAccessToken } from '../storage/google-auth.js';
import { createSheetsClient } from '../storage/sheets-client.js';
import { createCurriculumRepository } from '../storage/curriculum-repository.js';
import { createSessionRepository } from '../storage/session-repository.js';
import { createSessionBriefRepository } from '../storage/session-brief-repository.js';
import { createLocalJournal, workspaceStorageKey } from '../storage/local-journal.js';

export const DEFAULT_WORKSPACE = Object.freeze({
  id: 'english-engineering',
  name: 'English Engineering',
  projectUrl: 'https://chatgpt.com/g/g-p-6aa9f3ea98a481918727756027f94208-test',
  curriculumSpreadsheetId: '19Q6x9dOJVY-yRxuInThBj1gODQWAmyV1-EbeOh-2JLU',
  databaseSpreadsheetId: '13zDzNQSgxicIUBm8oE0CVAXzheTJ45KeeRrsaT3pJv4',
  sessionBriefSpreadsheetId: '1MsD-v6olhkecgBxFzWZg61f1WPo42u7hFhNQRgYk-QU',
  reviewLedgerSpreadsheetId: '1sQRdyjVvmQCOXPx6w-HHwGP1xeP8mjy5n2aHojJjzDs',
  teacherRoleUrl: 'https://drive.google.com/file/d/10NgizUp3AnnUSAZBqLexzu46sYqRqEO6/view',
  speakingMethodUrl: 'https://drive.google.com/file/d/1TeCJGwJmPlOSKZDHffid0iPreeSdxXWN/view',
  listeningMethodUrl: 'https://drive.google.com/file/d/1rYg8dYxlJNwAltjPn9dg8xz3_bkTTSZL/view',
  sessionBriefActiveSheetId: 498055014,
  sessionBriefStagingSheetId: 873615671
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

function platformGateFingerprint(workspace) {
  return JSON.stringify({
    projectUrl: workspace.projectUrl,
    curriculumSpreadsheetId: workspace.curriculumSpreadsheetId,
    databaseSpreadsheetId: workspace.databaseSpreadsheetId,
    sessionBriefSpreadsheetId: workspace.sessionBriefSpreadsheetId,
    reviewLedgerSpreadsheetId: workspace.reviewLedgerSpreadsheetId,
    teacherRoleUrl: workspace.teacherRoleUrl,
    speakingMethodUrl: workspace.speakingMethodUrl,
    listeningMethodUrl: workspace.listeningMethodUrl
  });
}

async function readPlatformGateMarker(chromeApi, workspace) {
  const key = workspaceStorageKey(workspace.id, 'platformGate');
  const result = await chromeApi.storage.local.get(key);
  const marker = result?.[key];
  return (
    marker?.status === 'PASS' &&
    marker?.fingerprint === platformGateFingerprint(workspace)
  );
}

async function writePlatformGateMarker(chromeApi, workspace) {
  const key = workspaceStorageKey(workspace.id, 'platformGate');
  await chromeApi.storage.local.set({
    [key]: {
      status: 'PASS',
      source: 'manual-live-confirmation',
      verifiedAt: new Date().toISOString(),
      fingerprint: platformGateFingerprint(workspace)
    }
  });
}

async function verifyRequiredSheets({ workspace, token, fetchImpl }) {
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
    probe.getValues(workspace.curriculumSpreadsheetId, 'CURRICULUM!A1:A1'),
    probe.getValues(workspace.databaseSpreadsheetId, 'Sessions!A1:A1'),
    probe.getValues(workspace.sessionBriefSpreadsheetId, 'ACTIVE!A1:A1'),
    probe.getValues(workspace.reviewLedgerSpreadsheetId, 'A1:A1')
  ]);

  const readable = [
    curriculumHeader,
    databaseHeader,
    briefHeader,
    reviewHeader
  ].every(values => Array.isArray(values));

  const databaseMarker = databaseHeader?.[0]?.[0];
  if (!readable || typeof databaseMarker !== 'string' || databaseMarker === '') {
    return { read: readable, write: false };
  }

  await probe.updateValues(
    workspace.databaseSpreadsheetId,
    'Sessions!A1',
    [[databaseMarker]]
  );

  return { read: true, write: true };
}

export function createRuntimeWorkflow({
  chromeApi = chrome,
  fetchImpl = fetch,
  workspace
} = {}) {
  if (!workspace?.id) {
    throw new Error('A complete Workspace is required for runtime');
  }

  const getToken = (interactive = false) =>
    getGoogleAccessToken(chromeApi, interactive);

  const sheets = createSheetsClient({
    getToken: () => getToken(false),
    fetchImpl
  });

  const curriculum = createCurriculumRepository({ sheets, workspace });
  const sessions = createSessionRepository({ sheets, workspace });
  const briefs = createSessionBriefRepository({ sheets, workspace });
  const journal = createLocalJournal(chromeApi, workspace.id);
  const chatgpt = createChatGptAdapter(chromeApi);
  const mask = createListeningMaskController(chatgpt);
  const supervisor = createDegradedSupervisor();

  const setupGate = createSetupGate({
    rawConfig: workspace,
    authorizeGoogle: interactive => getToken(interactive),
    verifySheetsAccess: ({ token }) =>
      verifyRequiredSheets({ workspace, token, fetchImpl }),
    hasPlatformGateMarker: () =>
      readPlatformGateMarker(chromeApi, workspace),
    markPlatformGateVerified: () =>
      writePlatformGateMarker(chromeApi, workspace),
    readActiveBrief: () => briefs.readActive()
  });

  return createWorkflow({
    config: workspace,
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
