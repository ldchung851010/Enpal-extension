import { ACTIVE_SESSION_STATES } from '../core/state.js';
import { EnpalError, ERROR_CODES } from '../core/errors.js';

function rowsToObjects(values) {
  const [headers = [], ...rows] = values;
  return rows.map((row) =>
    Object.fromEntries(headers.map((header, index) => [header, row[index] ?? '']))
  );
}

function columnName(index) {
  let value = index + 1;
  let result = '';
  while (value > 0) {
    const remainder = (value - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    value = Math.floor((value - 1) / 26);
  }
  return result;
}

export function createSessionRepository({
  sheets,
  spreadsheetId,
  range = 'Sessions!A:ZZ',
  sheetName = 'Sessions'
}) {
  function fieldName(headers, canonical, legacy) {
    if (headers.includes(canonical)) return canonical;
    if (headers.includes(legacy)) return legacy;
    return null;
  }

  function normalizeSession(row, headers) {
    const statusField = fieldName(headers, 'lifecycle_status', 'status');
    const phaseField = fieldName(headers, 'pipeline_phase', 'phase');
    return {
      ...row,
      status: statusField ? row[statusField] ?? '' : '',
      phase: phaseField ? row[phaseField] ?? '' : ''
    };
  }

  async function readTable() {
    const values = await sheets.getValues(spreadsheetId, range);
    const [headers = []] = values;
    const rawRows = rowsToObjects(values);
    return {
      values,
      headers,
      rawRows,
      rows: rawRows.map((row) => normalizeSession(row, headers))
    };
  }

  function findRow(table, sessionId) {
    const index = table.rows.findIndex((row) => row.session_id === sessionId);
    if (index < 0) return null;
    return {
      row: table.rows[index],
      rawRow: table.rawRows[index],
      rowNumber: index + 2
    };
  }

  function requireColumn(headers, name) {
    const index = headers.indexOf(name);
    if (index < 0) throw new Error('Sessions sheet missing required column: ' + name);
    return index;
  }

  async function writeWholeRow(headers, rowNumber, row) {
    const lastColumn = columnName(Math.max(headers.length - 1, 0));
    const values = headers.map((header) => row[header] ?? '');
    await sheets.updateValues(
      spreadsheetId,
      sheetName + '!A' + rowNumber + ':' + lastColumn + rowNumber,
      [values]
    );
  }

  return {
    async listActive() {
      const table = await readTable();
      const active = table.rows.filter((row) =>
        ACTIVE_SESSION_STATES.includes(row.status)
      );
      if (active.length > 1) {
        throw new EnpalError(
          ERROR_CODES.CONSISTENCY_ERROR,
          'More than one durable active session found: ' +
            active.map((row) => row.session_id).join(', '),
          false
        );
      }
      return active;
    },

    async getById(sessionId) {
      const table = await readTable();
      return findRow(table, sessionId)?.row ?? null;
    },

    async createStartingSession(session) {
      if (!session || typeof session.session_id !== 'string' || session.session_id.trim() === '') {
        throw new Error('session_id is required');
      }

      const table = await readTable();
      requireColumn(table.headers, 'session_id');

      const statusField = fieldName(table.headers, 'lifecycle_status', 'status');
      if (!statusField) throw new Error('Sessions sheet missing required status column');

      if (findRow(table, session.session_id)) {
        throw new Error('Session already exists: ' + session.session_id);
      }

      const active = table.rows.filter((row) =>
        ACTIVE_SESSION_STATES.includes(row.status)
      );
      if (active.length > 0) {
        throw new EnpalError(
          ERROR_CODES.CONSISTENCY_ERROR,
          'Cannot create STARTING session while ' + active[0].session_id + ' is active',
          false
        );
      }

      const phaseField = fieldName(table.headers, 'pipeline_phase', 'phase');
      const row = {
        ...session,
        chat_url: session.chat_url ?? '',
        [statusField]: 'STARTING'
      };
      if (phaseField && session.phase !== undefined) {
        row[phaseField] = session.phase;
      }

      const rowNumber = table.values.length + 1;
      await writeWholeRow(table.headers, rowNumber, row);

      const stored = Object.fromEntries(
        table.headers.map((header) => [header, row[header] ?? ''])
      );
      return normalizeSession(stored, table.headers);
    },

    async bindChat(sessionId, chatUrl) {
      if (typeof chatUrl !== 'string' || chatUrl.trim() === '') {
        throw new Error('chatUrl is required');
      }

      const table = await readTable();
      const found = findRow(table, sessionId);
      if (!found) throw new Error('Session not found: ' + sessionId);

      const current = found.rawRow.chat_url ?? '';
      if (current === chatUrl) return found.row;
      if (current !== '') {
        throw new Error('Session ' + sessionId + ' is already bound to ' + current);
      }

      const chatColumn = requireColumn(table.headers, 'chat_url');
      await sheets.updateValues(
        spreadsheetId,
        sheetName + '!' + columnName(chatColumn) + found.rowNumber,
        [[chatUrl]]
      );

      return { ...found.row, chat_url: chatUrl };
    },

    async markState(sessionId, status, patch = {}) {
      const table = await readTable();
      const found = findRow(table, sessionId);
      if (!found) throw new Error('Session not found: ' + sessionId);

      const changes = typeof status === 'object' && status !== null
        ? { ...status }
        : { ...patch, status };

      const statusField = fieldName(table.headers, 'lifecycle_status', 'status');
      const phaseField = fieldName(table.headers, 'pipeline_phase', 'phase');
      const nextRaw = { ...found.rawRow };

      for (const [key, value] of Object.entries(changes)) {
        if (key === 'status' && statusField) nextRaw[statusField] = value;
        else if (key === 'phase' && phaseField) nextRaw[phaseField] = value;
        else if (table.headers.includes(key)) nextRaw[key] = value;
      }

      await writeWholeRow(table.headers, found.rowNumber, nextRaw);
      return normalizeSession(nextRaw, table.headers);
    }
  };
}
