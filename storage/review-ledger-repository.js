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
  spreadsheetId,
  range = 'A:ZZ'
}) {
  return {
    async readAll() {
      return rowsToObjects(await sheets.getValues(spreadsheetId, range));
    }
  };
}
