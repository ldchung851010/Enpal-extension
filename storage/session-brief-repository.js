import { EnpalError, ERROR_CODES } from '../core/errors.js';

function rowsToObjects(values) {
  const [headers = [], ...rows] = values;
  return rows.map((row) =>
    Object.fromEntries(headers.map((header, index) => [header, row[index] ?? '']))
  );
}

function keyValueRowsToObject(values) {
  const rows = rowsToObjects(values);
  if (values[0]?.[0] === 'key' && values[0]?.[1] === 'value') {
    return Object.fromEntries(
      rows.filter((row) => row.key).map((row) => [row.key, row.value])
    );
  }
  return Object.fromEntries(
    values
      .filter((row) => row[0] && row[0] !== 'key')
      .map((row) => [row[0], row[1] ?? ''])
  );
}

function normalizeBrief(brief) {
  const sequence = Number(brief.curriculum_sequence);
  const readyMarker = brief.ready_marker ?? brief.status ?? '';
  return {
    ...brief,
    curriculum_sequence: Number.isFinite(sequence)
      ? sequence
      : brief.curriculum_sequence,
    ready: readyMarker === 'READY'
  };
}

export function createSessionBriefRepository({
  sheets,
  spreadsheetId,
  activeSheetId,
  stagingSheetId,
  activeRange = 'ACTIVE!A:B',
  stagingRange = '_STAGING!A:B'
}) {
  async function read(range) {
    return normalizeBrief(
      keyValueRowsToObject(await sheets.getValues(spreadsheetId, range))
    );
  }

  return {
    readActive() {
      return read(activeRange);
    },

    readStaging() {
      return read(stagingRange);
    },

    async verifyStaging(expected) {
      const staging = await read(stagingRange);
      const identityMatches =
        staging.curriculum_version === expected.curriculum_version &&
        Number(staging.curriculum_sequence) === Number(expected.curriculum_sequence) &&
        staging.lesson_id === expected.lesson_id;

      if (!identityMatches) {
        throw new EnpalError(
          ERROR_CODES.CONSISTENCY_ERROR,
          'Session Brief staging identity mismatch',
          false
        );
      }

      if (!staging.ready) {
        throw new Error('Session Brief staging is not READY');
      }

      if (!staging['Primary Skill'] || !staging['Communicative Goal']) {
        throw new Error('Session Brief staging is structurally incomplete');
      }

      return staging;
    },

    async promoteStaging({ rowCount, columnCount }) {
      if (
        !Number.isInteger(rowCount) ||
        rowCount <= 0 ||
        !Number.isInteger(columnCount) ||
        columnCount <= 0
      ) {
        throw new Error('rowCount and columnCount must be positive integers');
      }

      if (!Number.isInteger(activeSheetId) || !Number.isInteger(stagingSheetId)) {
        throw new Error('activeSheetId and stagingSheetId are required');
      }

      const activeGrid = {
        sheetId: activeSheetId,
        startRowIndex: 0,
        endRowIndex: rowCount,
        startColumnIndex: 0,
        endColumnIndex: columnCount
      };

      const stagingGrid = {
        sheetId: stagingSheetId,
        startRowIndex: 0,
        endRowIndex: rowCount,
        startColumnIndex: 0,
        endColumnIndex: columnCount
      };

      return sheets.batchUpdate(spreadsheetId, [
        {
          repeatCell: {
            range: activeGrid,
            cell: {},
            fields: 'userEnteredValue'
          }
        },
        {
          copyPaste: {
            source: stagingGrid,
            destination: {
              sheetId: activeSheetId,
              startRowIndex: 0,
              startColumnIndex: 0
            },
            pasteType: 'PASTE_VALUES',
            pasteOrientation: 'NORMAL'
          }
        },
        {
          repeatCell: {
            range: stagingGrid,
            cell: {},
            fields: 'userEnteredValue'
          }
        }
      ]);
    }
  };
}
