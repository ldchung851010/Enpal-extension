import { EnpalError, ERROR_CODES } from '../core/errors.js';
import { loadWorkspaceConfig } from '../core/config.js';

const REQUIRED_KEYS = [
  'schema_version',
  'curriculum_version',
  'curriculum_sequence',
  'lesson_id',
  'ready_marker',
  'Primary Skill',
  'Communicative Goal',
  'Focus',
  'Review Focus',
  'Situation',
  'Target Performance',
  'Completion Criteria',
  'Mask Policy'
];

const PRIMARY_SKILLS = new Set(['Speaking', 'Listening']);
const MASK_POLICIES = new Set(['ON', 'OFF']);

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

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function parseJsonArray(value, fieldName, { allowEmpty = false } = {}) {
  let parsed;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error('Session Brief ' + fieldName + ' must be valid JSON');
  }

  if (!Array.isArray(parsed) || (!allowEmpty && parsed.length === 0)) {
    throw new Error(
      'Session Brief ' +
        fieldName +
        ' must be a ' +
        (allowEmpty ? '' : 'non-empty ') +
        'JSON array'
    );
  }

  return parsed;
}

function validateReviewFocus(items) {
  const requiredKeys = [
    'Review Item ID',
    'Review Item',
    'Weakness Detail'
  ];

  for (const item of items) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error('Session Brief Review Focus entries must be objects');
    }

    const keys = Object.keys(item).sort();
    const expectedKeys = [...requiredKeys].sort();

    if (
      keys.length !== expectedKeys.length ||
      keys.some((key, index) => key !== expectedKeys[index])
    ) {
      throw new Error(
        'Session Brief Review Focus entries must contain exactly ' +
          'Review Item ID, Review Item, and Weakness Detail'
      );
    }

    if (!requiredKeys.every((key) => isNonEmptyString(item[key]))) {
      throw new Error(
        'Session Brief Review Focus entry values must be non-empty strings'
      );
    }
  }
}

function validateStructuredBrief(brief) {
  for (const key of REQUIRED_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(brief, key)) {
      throw new Error(
        'Session Brief staging is missing required key: ' + key
      );
    }
  }

  if (
    !isNonEmptyString(brief.schema_version) ||
    !isNonEmptyString(brief.curriculum_version) ||
    !isNonEmptyString(brief.lesson_id) ||
    !isNonEmptyString(brief['Communicative Goal']) ||
    !isNonEmptyString(brief.Situation) ||
    !isNonEmptyString(brief['Target Performance'])
  ) {
    throw new Error(
      'Session Brief staging contains an empty required text field'
    );
  }

  if (
    !Number.isInteger(Number(brief.curriculum_sequence)) ||
    Number(brief.curriculum_sequence) <= 0
  ) {
    throw new Error(
      'Session Brief curriculum_sequence must be a positive integer'
    );
  }

  if (!PRIMARY_SKILLS.has(brief['Primary Skill'])) {
    throw new Error(
      'Session Brief Primary Skill must be Speaking or Listening'
    );
  }

  if (!MASK_POLICIES.has(brief['Mask Policy'])) {
    throw new Error('Session Brief Mask Policy must be ON or OFF');
  }

  const focus = parseJsonArray(brief.Focus, 'Focus');
  if (!focus.every(isNonEmptyString)) {
    throw new Error(
      'Session Brief Focus entries must be non-empty strings'
    );
  }

  const completionCriteria = parseJsonArray(
    brief['Completion Criteria'],
    'Completion Criteria'
  );
  if (!completionCriteria.every(isNonEmptyString)) {
    throw new Error(
      'Session Brief Completion Criteria entries must be non-empty strings'
    );
  }

  const reviewFocus = parseJsonArray(
    brief['Review Focus'],
    'Review Focus',
    { allowEmpty: true }
  );
  validateReviewFocus(reviewFocus);
}

export function createSessionBriefRepository({
  sheets,
  workspace,
  activeRange = 'ACTIVE!A:B',
  stagingRange = '_STAGING!A:B'
}) {
  if (!sheets?.getValues || !sheets?.batchUpdate) {
    throw new Error('sheets client is required');
  }

  const config = loadWorkspaceConfig(workspace, { allowDraft: false });
  const spreadsheetId = config.sessionBriefSpreadsheetId;
  const activeSheetId = config.sessionBriefActiveSheetId;
  const stagingSheetId = config.sessionBriefStagingSheetId;

  async function read(range) {
    return normalizeBrief(
      keyValueRowsToObject(
        await sheets.getValues(spreadsheetId, range)
      )
    );
  }

  return {
    workspaceId: config.id,

    readActive() {
      return read(activeRange);
    },

    async verifyActive(expected = null) {
      const active = await read(activeRange);
      if (!active.ready || active.ready_marker !== 'READY') {
        throw new Error('ACTIVE Session Brief is not READY');
      }
      validateStructuredBrief(active);

      if (expected) {
        const identityMatches =
          active.curriculum_version === expected.curriculum_version &&
          Number(active.curriculum_sequence) ===
            Number(expected.curriculum_sequence) &&
          active.lesson_id === expected.lesson_id;
        if (!identityMatches) {
          throw new EnpalError(
            ERROR_CODES.CONSISTENCY_ERROR,
            'ACTIVE Session Brief identity mismatch',
            false
          );
        }
      }
      return active;
    },

    readStaging() {
      return read(stagingRange);
    },

    async verifyStaging(expected) {
      const staging = await read(stagingRange);
      const identityMatches =
        staging.curriculum_version === expected.curriculum_version &&
        Number(staging.curriculum_sequence) ===
          Number(expected.curriculum_sequence) &&
        staging.lesson_id === expected.lesson_id;

      if (!identityMatches) {
        throw new EnpalError(
          ERROR_CODES.CONSISTENCY_ERROR,
          'Session Brief staging identity mismatch',
          false
        );
      }

      if (!staging.ready || staging.ready_marker !== 'READY') {
        throw new Error('Session Brief staging is not READY');
      }

      validateStructuredBrief(staging);
      return staging;
    },

    async promoteStaging({ rowCount, columnCount }) {
      if (
        !Number.isInteger(rowCount) ||
        rowCount <= 0 ||
        !Number.isInteger(columnCount) ||
        columnCount <= 0
      ) {
        throw new Error(
          'rowCount and columnCount must be positive integers'
        );
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
