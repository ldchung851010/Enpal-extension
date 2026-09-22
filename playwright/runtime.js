import { loadRuntimeConfig } from '../core/config.js';
import { createWorkflow } from '../core/workflow.js';
import { createListeningMaskController } from '../listening/listening-mask-controller.js';
import { createSheetsClient } from '../storage/sheets-client.js';
import { createCurriculumRepository } from '../storage/curriculum-repository.js';
import { createSessionRepository } from '../storage/session-repository.js';
import { createSessionBriefRepository } from '../storage/session-brief-repository.js';
import { createPlaywrightChatGptAdapter } from './chatgpt-adapter.js';
import { createFileJournal } from './file-journal.js';

function requireWorkspace(workspace) {
  if (!workspace || typeof workspace !== 'object') {
    throw new Error('Playwright workspace configuration is required');
  }
  if (typeof workspace.id !== 'string' || workspace.id.trim() === '') {
    throw new Error('Playwright workspace id is required');
  }

  const config = loadRuntimeConfig(workspace);

  const activeSheetId = Number(workspace.sessionBriefActiveSheetId);
  const stagingSheetId = Number(workspace.sessionBriefStagingSheetId);

  if (!Number.isInteger(activeSheetId) || activeSheetId < 0) {
    throw new Error('sessionBriefActiveSheetId must be a non-negative integer');
  }
  if (!Number.isInteger(stagingSheetId) || stagingSheetId < 0) {
    throw new Error('sessionBriefStagingSheetId must be a non-negative integer');
  }

  return {
    workspaceId: workspace.id.trim(),
    config,
    activeSheetId,
    stagingSheetId
  };
}

function degradedSupervisor() {
  return {
    async start() {
      return { status: 'DEGRADED' };
    },
    async stop() {
      return { status: 'OFF' };
    }
  };
}

export function createPlaywrightRuntime({
  context,
  initialPage = null,
  workspace,
  tokenProvider,
  fetchImpl = fetch,
  journalRoot = '.enpal/recovery',
  sheetsClient = null,
  chatgpt = null,
  supervisor = null,
  chatgptPageOptions = {},
  idleOptions = {},
  voiceOptions = {}
} = {}) {
  if (!context && !chatgpt) {
    throw new Error('Playwright BrowserContext is required');
  }

  const {
    workspaceId,
    config,
    activeSheetId,
    stagingSheetId
  } = requireWorkspace(workspace);

  const sheets = sheetsClient ?? createSheetsClient({
    getToken: async () => {
      if (!tokenProvider?.getAccessToken) {
        throw new Error('Google token provider is required');
      }
      return tokenProvider.getAccessToken({ interactive: false });
    },
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
    activeSheetId,
    stagingSheetId
  });

  const journal = createFileJournal({
    workspaceId,
    rootDir: journalRoot
  });

  const chat = chatgpt ?? createPlaywrightChatGptAdapter({
    context,
    initialPage,
    chatgptPageOptions,
    idleOptions,
    voiceOptions
  });

  const mask = createListeningMaskController(chat);
  const workflow = createWorkflow({
    config,
    journal,
    sessions,
    curriculum,
    briefs,
    chatgpt: chat,
    mask,
    supervisor: supervisor ?? degradedSupervisor()
  });

  return {
    workflow,
    config,
    workspaceId,
    dependencies: {
      sheets,
      journal,
      sessions,
      curriculum,
      briefs,
      chatgpt: chat,
      mask
    }
  };
}
