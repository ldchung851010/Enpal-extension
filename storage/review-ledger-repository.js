import { loadWorkspaceConfig } from '../core/config.js';

function rowsToObjects(values) {
  const [headers = [], ...rows] = values;
  return rows
    .filter((row) => row.some((value) => value !== undefined && value !== ''))
    .map((row) => Object.fromEntries(
      headers.map((header, index) => [header, row[index] ?? ''])
    ));
}

export function createReviewLedgerRepository({
  sheets,
  workspace,
  range = 'A:ZZ'
}) {
  if (!sheets?.getValues) throw new Error('sheets client is required');
  const config = loadWorkspaceConfig(workspace, { allowDraft: false });
  const spreadsheetId = config.reviewLedgerSpreadsheetId;

  return {
    workspaceId: config.id,

    async readAll() {
      return rowsToObjects(await sheets.getValues(spreadsheetId, range));
    }
  };
}
