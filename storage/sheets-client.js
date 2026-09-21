const BASE = 'https://sheets.googleapis.com/v4/spreadsheets';

export function createSheetsClient({ getToken, fetchImpl = fetch }) {
  async function request(url, options = {}) {
    const token = await getToken();
    const response = await fetchImpl(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(options.headers ?? {})
      }
    });

    if (!response.ok) {
      throw new Error(`Google Sheets request failed: ${response.status ?? 'unknown'}`);
    }
    return response.json();
  }

  return {
    async getValues(spreadsheetId, range) {
      const data = await request(
        `${BASE}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}`
      );
      return data.values ?? [];
    },

    async updateValues(spreadsheetId, range, values) {
      return request(
        `${BASE}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}?valueInputOption=RAW`,
        { method: 'PUT', body: JSON.stringify({ values }) }
      );
    },

    async batchUpdate(spreadsheetId, requests) {
      return request(
        `${BASE}/${encodeURIComponent(spreadsheetId)}:batchUpdate`,
        { method: 'POST', body: JSON.stringify({ requests }) }
      );
    }
  };
}
