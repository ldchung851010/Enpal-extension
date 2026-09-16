import {
  TARGET_BANK_COLUMNS,
  SESSION_COLUMNS,
  CURRICULUM_COLUMNS,
  NEXT_SESSION_KEYS
} from '../core/schemas.js';
import { validateAnalyzeCommit, validateReadyNextSession } from '../core/validator.js';

const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets';
const DATABASE_TITLE = 'EnPal Database';
const TAB_NAMES = Object.freeze([
  'Learner',
  'Target Bank',
  'Sessions',
  'Curriculum',
  'Next Session'
]);

const LEARNER_PROFILE_KEYS = Object.freeze([
  'learner_id',
  'long_term_goal',
  'current_level',
  'main_contexts',
  'strengths',
  'weaknesses',
  'current_curriculum_position',
  'updated_at'
]);

export const EXTENSION_SESSION_FIELDS = new Set([
  'session_id','session_number','curriculum_sequence','lesson_id','unit_id',
  'lesson_type','title','chat_url','chat_title_expected','lifecycle_status',
  'pipeline_phase','started_at','paused_at','completed_at','rename_status',
  'rename_last_error'
]);

const EXTENSION_NEXT_SESSION_FIELDS = new Set([
  'session_id',
  'session_number',
  'curriculum_sequence',
  'prepared_from_session_id',
  'prepare_version',
  'status'
]);

function quoteSheet(name) {
  return `'${String(name).replaceAll("'", "''")}'`;
}

function encodeRange(range) {
  return encodeURIComponent(range);
}

function columnLetter(index) {
  let value = index + 1;
  let result = '';
  while (value > 0) {
    const remainder = (value - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    value = Math.floor((value - 1) / 26);
  }
  return result;
}

function serializeCell(value) {
  if (value === undefined || value === null) return '';
  if (Array.isArray(value) || typeof value === 'object') return JSON.stringify(value);
  return value;
}

function parseCell(value) {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if ((trimmed.startsWith('[') && trimmed.endsWith(']')) ||
      (trimmed.startsWith('{') && trimmed.endsWith('}'))) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return value;
    }
  }
  return value;
}

function rowsToObjects(rows) {
  if (!rows.length) return [];
  const headers = rows[0];
  return rows.slice(1).map((row, index) => {
    const object = { __rowNumber: index + 2 };
    headers.forEach((header, columnIndex) => {
      if (header) object[header] = parseCell(row[columnIndex] ?? '');
    });
    return object;
  });
}

function keyValueRowsToObject(rows) {
  const object = {};
  for (const row of rows.slice(1)) {
    const key = row[0];
    if (!key) continue;
    object[key] = parseCell(row[1] ?? '');
  }
  return object;
}

function assertOwnedPatch(patch, allowedFields, label) {
  for (const key of Object.keys(patch)) {
    if (!allowedFields.has(key)) {
      throw new Error(`${label}: writer ownership violation for ${key}`);
    }
  }
}

async function responseJson(response, label) {
  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  if (!response.ok) {
    const detail = body?.error?.message || `${response.status}`;
    throw new Error(`${label}: ${detail}`);
  }
  return body;
}

export function createSheetsRepository({
  authorizedFetch,
  sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
  now = Date.now,
  defaultWaitMs = 120_000,
  defaultPollMs = 2_500
} = {}) {
  if (typeof authorizedFetch !== 'function') {
    throw new Error('Sheets repository requires authorizedFetch');
  }

  async function fetchJson(url, options = {}, label = 'Google Sheets') {
    const response = await authorizedFetch(url, options);
    return responseJson(response, label);
  }

  async function readRows(spreadsheetId, sheetName) {
    const range = `${quoteSheet(sheetName)}!A:ZZ`;
    const url = `${SHEETS_API}/${spreadsheetId}/values/${encodeRange(range)}`;
    const body = await fetchJson(url, {}, `Read ${sheetName}`);
    return body.values || [];
  }

  async function updateValues(spreadsheetId, range, values) {
    const url = `${SHEETS_API}/${spreadsheetId}/values/${encodeRange(range)}?valueInputOption=RAW`;
    return fetchJson(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ range, majorDimension: 'ROWS', values })
    }, `Update ${range}`);
  }

  async function appendValues(spreadsheetId, range, values) {
    const url = `${SHEETS_API}/${spreadsheetId}/values/${encodeRange(range)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`;
    return fetchJson(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ range, majorDimension: 'ROWS', values })
    }, `Append ${range}`);
  }

  async function readTable(spreadsheetId, sheetName) {
    return rowsToObjects(await readRows(spreadsheetId, sheetName));
  }

  async function readKeyValue(spreadsheetId, sheetName) {
    return keyValueRowsToObject(await readRows(spreadsheetId, sheetName));
  }

  async function setKeyValue(spreadsheetId, sheetName, key, value) {
    const rows = await readRows(spreadsheetId, sheetName);
    const existingIndex = rows.findIndex((row, index) => index > 0 && row[0] === key);
    const serialized = serializeCell(value);
    if (existingIndex >= 0) {
      const rowNumber = existingIndex + 1;
      await updateValues(spreadsheetId, `${quoteSheet(sheetName)}!B${rowNumber}`, [[serialized]]);
      return;
    }
    await appendValues(spreadsheetId, `${quoteSheet(sheetName)}!A1`, [[key, serialized]]);
  }

  async function ensureTableHeaders(spreadsheetId, sheetName, requiredHeaders) {
    const rows = await readRows(spreadsheetId, sheetName);
    if (rows.length === 0 || rows[0].length === 0) {
      await updateValues(
        spreadsheetId,
        `${quoteSheet(sheetName)}!A1`,
        [requiredHeaders]
      );
      return;
    }
    const existing = rows[0].filter(Boolean);
    const missing = requiredHeaders.filter(header => !existing.includes(header));
    if (!missing.length) return;
    const startColumn = columnLetter(rows[0].length);
    await updateValues(
      spreadsheetId,
      `${quoteSheet(sheetName)}!${startColumn}1`,
      [missing]
    );
  }

  async function ensureKeyValueKeys(spreadsheetId, sheetName, requiredKeys) {
    const rows = await readRows(spreadsheetId, sheetName);
    if (rows.length === 0) {
      await updateValues(spreadsheetId, `${quoteSheet(sheetName)}!A1`, [['key', 'value']]);
    } else if (rows[0][0] !== 'key') {
      throw new Error(`${sheetName}: expected key/value header`);
    } else if (rows[0][1] !== 'value') {
      await updateValues(spreadsheetId, `${quoteSheet(sheetName)}!B1`, [['value']]);
    }
    const refreshed = rows.length === 0 ? [['key', 'value']] : rows;
    const existingKeys = new Set(refreshed.slice(1).map(row => row[0]).filter(Boolean));
    const missingRows = requiredKeys
      .filter(key => !existingKeys.has(key))
      .map(key => [key, '']);
    if (missingRows.length) {
      await appendValues(spreadsheetId, `${quoteSheet(sheetName)}!A1`, missingRows);
    }
  }

  async function createDatabase() {
    const body = {
      properties: { title: DATABASE_TITLE },
      sheets: TAB_NAMES.map(title => ({ properties: { title } }))
    };
    return fetchJson(SHEETS_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }, 'Create EnPal Database');
  }

  async function ensureDatabaseSchema(spreadsheetId) {
    await ensureKeyValueKeys(spreadsheetId, 'Learner', LEARNER_PROFILE_KEYS);
    await ensureTableHeaders(spreadsheetId, 'Target Bank', TARGET_BANK_COLUMNS);
    await ensureTableHeaders(spreadsheetId, 'Sessions', SESSION_COLUMNS);
    await ensureTableHeaders(spreadsheetId, 'Curriculum', CURRICULUM_COLUMNS);
    await ensureKeyValueKeys(spreadsheetId, 'Next Session', NEXT_SESSION_KEYS);
  }

  async function getLearner(spreadsheetId) {
    return readKeyValue(spreadsheetId, 'Learner');
  }

  async function getCurriculum(spreadsheetId) {
    return readTable(spreadsheetId, 'Curriculum');
  }

  async function getNextSession(spreadsheetId) {
    return readKeyValue(spreadsheetId, 'Next Session');
  }

  async function upsertSessionStub(spreadsheetId, session) {
    if (!session?.session_id) throw new Error('Session stub: missing session_id');
    assertOwnedPatch(session, EXTENSION_SESSION_FIELDS, 'Session stub');
    const rows = await readRows(spreadsheetId, 'Sessions');
    const headers = rows[0] || SESSION_COLUMNS;
    const matches = rows
      .slice(1)
      .map((row, index) => ({ row, rowNumber: index + 2 }))
      .filter(({ row }) => row[headers.indexOf('session_id')] === session.session_id);
    if (matches.length > 1) throw new Error(`Session ${session.session_id}: duplicate rows`);

    if (matches.length === 1) {
      const object = {};
      headers.forEach((header, index) => { object[header] = parseCell(matches[0].row[index] ?? ''); });
      const merged = { ...object, ...session };
      const values = headers.map(header => serializeCell(merged[header]));
      await updateValues(
        spreadsheetId,
        `${quoteSheet('Sessions')}!A${matches[0].rowNumber}`,
        [values]
      );
      return merged;
    }

    const values = headers.map(header => serializeCell(session[header]));
    await appendValues(spreadsheetId, `${quoteSheet('Sessions')}!A1`, [values]);
    return session;
  }

  async function patchSessionExtensionFields(spreadsheetId, sessionId, patch) {
    assertOwnedPatch(patch, EXTENSION_SESSION_FIELDS, 'Session patch');
    const rows = await readRows(spreadsheetId, 'Sessions');
    const headers = rows[0] || [];
    const idIndex = headers.indexOf('session_id');
    const matches = rows
      .slice(1)
      .map((row, index) => ({ row, rowNumber: index + 2 }))
      .filter(({ row }) => row[idIndex] === sessionId);
    if (matches.length !== 1) {
      throw new Error(`Session ${sessionId}: expected exactly one row, found ${matches.length}`);
    }
    const object = {};
    headers.forEach((header, index) => { object[header] = parseCell(matches[0].row[index] ?? ''); });
    const merged = { ...object, ...patch };
    await updateValues(
      spreadsheetId,
      `${quoteSheet('Sessions')}!A${matches[0].rowNumber}`,
      [headers.map(header => serializeCell(merged[header]))]
    );
    return merged;
  }

  async function setNextSessionExtensionFields(spreadsheetId, patch) {
    assertOwnedPatch(patch, EXTENSION_NEXT_SESSION_FIELDS, 'Next Session patch');
    if ('status' in patch && !['PREPARING', 'CONSUMED'].includes(patch.status)) {
      throw new Error(`Next Session patch: writer ownership violation for status ${patch.status}`);
    }
    for (const [key, value] of Object.entries(patch)) {
      await setKeyValue(spreadsheetId, 'Next Session', key, value);
    }
    return getNextSession(spreadsheetId);
  }

  async function waitForAnalysisDone(spreadsheetId, sessionId, options = {}) {
    const timeoutMs = options.timeoutMs ?? defaultWaitMs;
    const pollMs = options.pollMs ?? defaultPollMs;
    const startedAt = now();
    let elapsed = 0;
    while (true) {
      const rows = await readTable(spreadsheetId, 'Sessions');
      const matches = rows.filter(row => row.session_id === sessionId);
      if (matches.length > 1) throw new Error(`Session ${sessionId}: duplicate rows`);
      if (matches.length === 1 && matches[0].analysis_status === 'DONE') {
        return validateAnalyzeCommit(matches[0]);
      }
      if (elapsed >= timeoutMs || now() - startedAt >= timeoutMs) {
        throw new Error(`Analyze wait timed out for ${sessionId}`);
      }
      const waitMs = Math.min(pollMs, Math.max(1, timeoutMs - elapsed));
      await sleep(waitMs);
      elapsed += waitMs;
    }
  }

  async function waitForNextSessionReady(spreadsheetId, identity, options = {}) {
    const timeoutMs = options.timeoutMs ?? defaultWaitMs;
    const pollMs = options.pollMs ?? defaultPollMs;
    const startedAt = now();
    let elapsed = 0;
    while (true) {
      const next = await getNextSession(spreadsheetId);
      if (next.status === 'READY') {
        const exactKeys = [
          'session_id',
          'session_number',
          'curriculum_sequence',
          'prepared_from_session_id'
        ];
        for (const key of exactKeys) {
          if (String(next[key]) !== String(identity[key])) {
            throw new Error(`Next Session identity mismatch for ${key}`);
          }
        }
        return validateReadyNextSession(next);
      }
      if (elapsed >= timeoutMs || now() - startedAt >= timeoutMs) {
        throw new Error(`Next Session wait timed out for ${identity.session_id}`);
      }
      const waitMs = Math.min(pollMs, Math.max(1, timeoutMs - elapsed));
      await sleep(waitMs);
      elapsed += waitMs;
    }
  }

  async function advanceCurriculumPosition(spreadsheetId, completedSequence) {
    const learner = await getLearner(spreadsheetId);
    const existing = Number(learner.current_curriculum_position || 0);
    const completed = Number(completedSequence);
    const next = Math.max(existing, completed);
    if (next > existing) {
      await setKeyValue(spreadsheetId, 'Learner', 'current_curriculum_position', next);
    }
    return next;
  }

  async function findPausedOrProcessingSession(spreadsheetId) {
    const rows = await readTable(spreadsheetId, 'Sessions');
    const active = rows.filter(row => ['PAUSED', 'PROCESSING'].includes(row.lifecycle_status));
    if (active.length > 1) {
      throw new Error(`Sessions invariant: expected at most one PAUSED/PROCESSING session, found ${active.length}`);
    }
    return active[0] || null;
  }

  return {
    createDatabase,
    ensureDatabaseSchema,
    getLearner,
    getCurriculum,
    getNextSession,
    upsertSessionStub,
    patchSessionExtensionFields,
    setNextSessionExtensionFields,
    waitForAnalysisDone,
    waitForNextSessionReady,
    advanceCurriculumPosition,
    findPausedOrProcessingSession
  };
}
