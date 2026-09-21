export const REQUIRED_RUNTIME_STRING_FIELDS = Object.freeze([
  'projectUrl',
  'curriculumSpreadsheetId',
  'databaseSpreadsheetId',
  'sessionBriefSpreadsheetId',
  'reviewLedgerSpreadsheetId',
  'teacherRoleUrl',
  'speakingMethodUrl',
  'listeningMethodUrl'
]);

export const REQUIRED_RUNTIME_INTEGER_FIELDS = Object.freeze([
  'sessionBriefActiveSheetId',
  'sessionBriefStagingSheetId'
]);

export function normalizeProjectUrl(value) {
  let url;
  try {
    url = new URL(String(value ?? '').trim());
  } catch {
    throw new Error('projectUrl must be a ChatGPT Project URL');
  }

  const segments = url.pathname.split('/').filter(Boolean);
  if (
    url.origin !== 'https://chatgpt.com' ||
    segments[0] !== 'g' ||
    typeof segments[1] !== 'string' ||
    segments[1].trim() === ''
  ) {
    throw new Error('projectUrl must be a ChatGPT Project URL');
  }

  return url.origin + '/g/' + segments[1];
}

function normalizeRuntimeFields(raw) {
  const config = { ...(raw ?? {}) };
  config.projectUrl = normalizeProjectUrl(config.projectUrl);

  for (const key of REQUIRED_RUNTIME_STRING_FIELDS) {
    if (key === 'projectUrl') continue;
    config[key] = typeof config[key] === 'string'
      ? config[key].trim()
      : '';
  }

  for (const key of REQUIRED_RUNTIME_INTEGER_FIELDS) {
    const value = config[key];
    if (value == null || String(value).trim() === '') {
      config[key] = null;
      continue;
    }
    const number = Number(value);
    if (!Number.isInteger(number) || number < 0) {
      throw new Error(key + ' must be a non-negative integer');
    }
    config[key] = number;
  }

  return config;
}

export function isWorkspaceRuntimeReady(raw) {
  if (!raw) return false;

  let config;
  try {
    config = normalizeRuntimeFields(raw);
  } catch {
    return false;
  }

  return REQUIRED_RUNTIME_STRING_FIELDS.every(
    key => typeof config[key] === 'string' && config[key].trim() !== ''
  ) && REQUIRED_RUNTIME_INTEGER_FIELDS.every(
    key => Number.isInteger(config[key]) && config[key] >= 0
  );
}

export function loadWorkspaceConfig(raw, { allowDraft = true } = {}) {
  const workspace = normalizeRuntimeFields(raw);

  if (typeof workspace.id !== 'string' || workspace.id.trim() === '') {
    throw new Error('workspace id is required');
  }
  workspace.id = workspace.id.trim();
  if (!/^[A-Za-z0-9_-]+$/.test(workspace.id)) {
    throw new Error('workspace id may contain only letters, numbers, hyphen, and underscore');
  }

  if (typeof workspace.name !== 'string' || workspace.name.trim() === '') {
    throw new Error('workspace name is required');
  }
  workspace.name = workspace.name.trim();

  const ready = isWorkspaceRuntimeReady(workspace);
  if (!allowDraft && !ready) {
    for (const key of REQUIRED_RUNTIME_STRING_FIELDS) {
      if (typeof workspace[key] !== 'string' || workspace[key].trim() === '') {
        throw new Error('Missing required workspace runtime config: ' + key);
      }
    }
    for (const key of REQUIRED_RUNTIME_INTEGER_FIELDS) {
      if (!Number.isInteger(workspace[key]) || workspace[key] < 0) {
        throw new Error('Missing required workspace runtime config: ' + key);
      }
    }
  }

  workspace.configState = ready ? 'COMPLETE' : 'DRAFT';
  return workspace;
}

// Transitional compatibility for lower-level modules during the rebuild.
// New orchestration must pass a complete Workspace object instead.
export function loadRuntimeConfig(raw) {
  const config = normalizeRuntimeFields(raw);

  for (const key of REQUIRED_RUNTIME_STRING_FIELDS) {
    if (typeof config[key] !== 'string' || config[key].trim() === '') {
      throw new Error('Missing required runtime config: ' + key);
    }
  }

  return config;
}
