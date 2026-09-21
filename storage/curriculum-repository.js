import { loadWorkspaceConfig } from '../core/config.js';

function rowsToObjects(values) {
  const [headers = [], ...rows] = values;
  return rows
    .filter((row) => row.some((value) => value !== undefined && value !== ''))
    .map((row) => Object.fromEntries(
      headers.map((header, index) => [header, row[index] ?? ''])
    ));
}

function normalizeLesson(row) {
  const sequence = Number(row.curriculum_sequence);
  return {
    ...row,
    curriculum_sequence: Number.isFinite(sequence)
      ? sequence
      : row.curriculum_sequence
  };
}

export function createCurriculumRepository({
  sheets,
  workspace,
  range = 'CURRICULUM!A:ZZ'
}) {
  if (!sheets?.getValues) throw new Error('sheets client is required');
  const config = loadWorkspaceConfig(workspace, { allowDraft: false });
  const spreadsheetId = config.curriculumSpreadsheetId;

  async function readAll() {
    return rowsToObjects(
      await sheets.getValues(spreadsheetId, range)
    ).map(normalizeLesson);
  }

  return {
    workspaceId: config.id,

    async getLesson(sequence) {
      const wanted = Number(sequence);
      const rows = await readAll();
      return rows.find(
        (row) => Number(row.curriculum_sequence) === wanted
      ) ?? null;
    },

    async getNextLesson(completedSequences = []) {
      const completed = new Set(completedSequences.map(Number));
      const rows = await readAll();
      const candidates = rows
        .filter((row) => Number.isFinite(Number(row.curriculum_sequence)))
        .sort(
          (a, b) =>
            Number(a.curriculum_sequence) - Number(b.curriculum_sequence)
        );

      return candidates.find(
        (row) => !completed.has(Number(row.curriculum_sequence))
      ) ?? null;
    }
  };
}
