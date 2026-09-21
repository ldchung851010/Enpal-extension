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
import { workspaceStorageKey } from '../storage/workspace-registry.js';

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

export const DEFAULT_WORKSPACE = Object.freeze({
  id: 'english-engineering',
  name: 'English Engineering',
  ...RUNTIME_CONFIG,
  sessionBriefActiveSheetId: SESSION_BRIEF_SHEET_IDS.active,
  sessionBriefStagingSheetId: SESSION_BRIEF_SHEET_IDS.staging
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

function platformGateFingerprint(config) {
  return JSON.stringify({
    projectUrl: config.projectUrl,
    curriculumSpreadsheetId: config.curriculumSpreadsheetId,
    databaseSpreadsheetId: config.databaseSpreadsheetId,
    sessionBriefSpreadsheetId: config.sessionBriefSpreadsheetId,
    reviewLedgerSpreadsheetId: config.reviewLedgerSpreadsheetId,
    teacherRoleUrl: config.teacherRoleUrl,
    speakingMethodUrl: config.speakingMethodUrl,
    listeningMethodUrl: config.listeningMethodUrl
  });
}

function platformGateKey(workspaceId) {
  return workspaceId
    ? workspaceStorageKey(workspaceId, 'platformGate')
    : PLATFORM_GATE_KEY;
}

async function readPlatformGateMarker(chromeApi, config, workspaceId = null) {
  const key = platformGateKey(workspaceId);
  const result = await chromeApi.storage.local.get(key);
  const marker = result?.[key];
  return (
    marker?.status === 'PASS' &&
    marker?.fingerprint === platformGateFingerprint(config)
  );
}

async function writePlatformGateMarker(chromeApi, config, workspaceId = null) {
  const key = platformGateKey(workspaceId);
  await chromeApi.storage.local.set({
    [key]: {
      status: 'PASS',
      source: 'manual-live-confirmation',
      verifiedAt: new Date().toISOString(),
      fingerprint: platformGateFingerprint(config)
    }
  });
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
  config = RUNTIME_CONFIG,
  workspace = null
} = {}) {
  const runtimeConfig = workspace
    ? {
        projectUrl: workspace.projectUrl,
        curriculumSpreadsheetId: workspace.curriculumSpreadsheetId,
        databaseSpreadsheetId: workspace.databaseSpreadsheetId,
        sessionBriefSpreadsheetId: workspace.sessionBriefSpreadsheetId,
        reviewLedgerSpreadsheetId: workspace.reviewLedgerSpreadsheetId,
        teacherRoleUrl: workspace.teacherRoleUrl,
        speakingMethodUrl: workspace.speakingMethodUrl,
        listeningMethodUrl: workspace.listeningMethodUrl
      }
    : config;
  const workspaceId = workspace?.id ?? null;
  const activeSheetId = workspace?.sessionBriefActiveSheetId
    ?? SESSION_BRIEF_SHEET_IDS.active;
  const stagingSheetId = workspace?.sessionBriefStagingSheetId
    ?? SESSION_BRIEF_SHEET_IDS.staging;

  const getToken = (interactive = false) =>
    getGoogleAccessToken(chromeApi, interactive);

  const sheets = createSheetsClient({
    getToken: () => getToken(false),
    fetchImpl
  });

  const curriculum = createCurriculumRepository({
    sheets,
    spreadsheetId: runtimeConfig.curriculumSpreadsheetId
  });

  const sessions = createSessionRepository({
    sheets,
    spreadsheetId: runtimeConfig.databaseSpreadsheetId
  });

  const briefs = createSessionBriefRepository({
    sheets,
    spreadsheetId: runtimeConfig.sessionBriefSpreadsheetId,
    activeSheetId,
    stagingSheetId
  });

  const journal = createLocalJournal(chromeApi, workspaceId);
  const chatgpt = createChatGptAdapter(chromeApi);
  const mask = createListeningMaskController(chatgpt);
  const supervisor = createDegradedSupervisor();

  const setupGate = createSetupGate({
    rawConfig: runtimeConfig,
    authorizeGoogle: (interactive) => getToken(interactive),
    verifySheetsAccess: ({ config: setupConfig, token }) =>
      verifyRequiredSheets({
        config: setupConfig,
        token,
        fetchImpl
      }),
    hasPlatformGateMarker: () =>
      readPlatformGateMarker(chromeApi, runtimeConfig, workspaceId),
    markPlatformGateVerified: () =>
      writePlatformGateMarker(chromeApi, runtimeConfig, workspaceId),
    readActiveBrief: () => briefs.readActive()
  });

  return createWorkflow({
    config: runtimeConfig,
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
