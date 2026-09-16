import { createSheetsRepository } from '../../storage/sheets.js';

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

function decodeRange(url) {
  const marker = '/values/';
  const index = url.indexOf(marker);
  if (index === -1) return null;
  const tail = url.slice(index + marker.length).split('?')[0];
  return decodeURIComponent(tail);
}

function splitA1(range) {
  const bang = range.indexOf('!');
  if (bang === -1) return { sheet: range.replace(/^'|'$/g, ''), cells: '' };
  const sheet = range.slice(0, bang).replace(/^'|'$/g, '').replace(/''/g, "'");
  return { sheet, cells: range.slice(bang + 1) };
}

function colToIndex(col) {
  let value = 0;
  for (const char of col) value = value * 26 + char.charCodeAt(0) - 64;
  return value - 1;
}

function parseStart(cells) {
  const match = /^([A-Z]+)(\d+)/.exec(cells || 'A1');
  return match ? { row: Number(match[2]) - 1, col: colToIndex(match[1]) } : { row: 0, col: 0 };
}

function writeValues(rows, cells, values) {
  const { row: startRow, col: startCol } = parseStart(cells);
  for (let r = 0; r < values.length; r += 1) {
    const targetRow = startRow + r;
    while (rows.length <= targetRow) rows.push([]);
    for (let c = 0; c < values[r].length; c += 1) {
      rows[targetRow][startCol + c] = values[r][c];
    }
  }
}

function normalizeTable(rows = []) {
  return rows.map(row => [...row]);
}

export function makeSheetsRepoWithFixture(sessionRows = [], options = {}) {
  const fixture = {
    spreadsheetId: options.spreadsheetId || 'sheet1',
    title: options.title || 'EnPal Database',
    tabs: {
      Learner: options.learnerRows || [['key', 'value']],
      'Target Bank': options.targetRows || [],
      Sessions: normalizeTable(sessionRows),
      Curriculum: options.curriculumRows || [],
      'Next Session': options.nextSessionRows || [['key', 'value']]
    },
    writes: [],
    creates: []
  };

  const authorizedFetch = async (url, request = {}) => {
    const method = request.method || 'GET';
    const parsedBody = request.body ? JSON.parse(request.body) : null;

    if (url === 'https://sheets.googleapis.com/v4/spreadsheets' && method === 'POST') {
      fixture.creates.push(parsedBody);
      return jsonResponse({ spreadsheetId: fixture.spreadsheetId, ...parsedBody });
    }

    const spreadsheetPrefix = `https://sheets.googleapis.com/v4/spreadsheets/${fixture.spreadsheetId}`;
    if (url.startsWith(spreadsheetPrefix) && !url.includes('/values/')) {
      return jsonResponse({
        spreadsheetId: fixture.spreadsheetId,
        properties: { title: fixture.title },
        sheets: Object.keys(fixture.tabs).map((title, index) => ({
          properties: { sheetId: index, title }
        }))
      });
    }

    const range = decodeRange(url);
    if (range) {
      const { sheet, cells } = splitA1(range);
      const rows = fixture.tabs[sheet] || (fixture.tabs[sheet] = []);

      if (method === 'GET') {
        return jsonResponse({ range, majorDimension: 'ROWS', values: normalizeTable(rows) });
      }

      if (method === 'PUT') {
        const values = parsedBody?.values || [];
        fixture.writes.push({ method, range, values: normalizeTable(values) });
        writeValues(rows, cells, values);
        return jsonResponse({ updatedRange: range, updatedRows: values.length });
      }

      if (method === 'POST' && url.includes(':append')) {
        const values = parsedBody?.values || [];
        fixture.writes.push({ method: 'APPEND', range, values: normalizeTable(values) });
        rows.push(...normalizeTable(values));
        return jsonResponse({ updates: { updatedRows: values.length } });
      }
    }

    return jsonResponse({ error: { message: `Unhandled fake Sheets request: ${method} ${url}` } }, 500);
  };

  const repo = createSheetsRepository({
    authorizedFetch,
    sleep: options.sleep || (async () => {}),
    now: options.now || (() => 0),
    defaultWaitMs: options.defaultWaitMs ?? 10_000,
    defaultPollMs: options.defaultPollMs ?? 2_500
  });

  return Object.assign(repo, { fixture });
}
