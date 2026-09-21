import { getGoogleAccessToken } from '../../storage/google-auth.js';
import { createSheetsClient } from '../../storage/sheets-client.js';

export const TASK3_LIVE_TARGET = Object.freeze({
  extensionId: 'lnnnbbkifillljlhcpaekmjaemljlmkd',
  curriculumSpreadsheetId: '19Q6x9dOJVY-yRxuInThBj1gODQWAmyV1-EbeOh-2JLU',
  databaseSpreadsheetId: '13zDzNQSgxicIUBm8oE0CVAXzheTJ45KeeRrsaT3pJv4'
});

export async function runTask3LiveProbe({
  chromeApi = chrome,
  fetchImpl = fetch,
  now = () => Date.now()
} = {}) {
  if (chromeApi.runtime?.id !== TASK3_LIVE_TARGET.extensionId) {
    throw new Error(
      `Unexpected Extension ID: ${chromeApi.runtime?.id || 'unavailable'}`
    );
  }

  const token = await getGoogleAccessToken(chromeApi, true);
  const sheets = createSheetsClient({
    getToken: async () => token,
    fetchImpl
  });

  const curriculumRows = await sheets.getValues(
    TASK3_LIVE_TARGET.curriculumSpreadsheetId,
    'CURRICULUM!A1:B3'
  );
  if (!Array.isArray(curriculumRows) || curriculumRows.length === 0) {
    throw new Error('Curriculum read returned no rows');
  }

  const title = `_ENPAL_TASK3_PROBE_${now()}`;
  const marker = `ENPAL_TASK3_WRITE_OK_${now()}`;
  let sheetId = null;
  let primaryError = null;
  let result = null;

  try {
    const created = await sheets.batchUpdate(
      TASK3_LIVE_TARGET.databaseSpreadsheetId,
      [{ addSheet: { properties: { title } } }]
    );
    sheetId = created?.replies?.[0]?.addSheet?.properties?.sheetId;
    if (!Number.isInteger(sheetId)) {
      throw new Error('Temporary probe sheet was not created');
    }

    await sheets.updateValues(
      TASK3_LIVE_TARGET.databaseSpreadsheetId,
      `${title}!A1`,
      [[marker]]
    );

    const readBack = await sheets.getValues(
      TASK3_LIVE_TARGET.databaseSpreadsheetId,
      `${title}!A1`
    );
    if (readBack?.[0]?.[0] !== marker) {
      throw new Error('Sheets write could not be verified by read-back');
    }

    result = {
      ok: true,
      extensionId: TASK3_LIVE_TARGET.extensionId,
      oauth: true,
      curriculumRead: true,
      databaseWriteRead: true,
      cleanup: false
    };
  } catch (error) {
    primaryError = error;
  }

  if (sheetId !== null) {
    try {
      await sheets.batchUpdate(
        TASK3_LIVE_TARGET.databaseSpreadsheetId,
        [{ deleteSheet: { sheetId } }]
      );
      if (result) result.cleanup = true;
    } catch (cleanupError) {
      if (!primaryError) {
        primaryError = new Error(
          'Temporary probe sheet cleanup failed: ' +
          (cleanupError?.message || String(cleanupError))
        );
      }
    }
  }

  if (primaryError) throw primaryError;
  if (!result?.cleanup) {
    throw new Error('Task 3 probe did not verify cleanup');
  }
  return result;
}
