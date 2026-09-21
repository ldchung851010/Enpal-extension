const BASE = 'https://sheets.googleapis.com/v4/spreadsheets';

function requiredString(value, name) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(name + ' is required');
  }
  return value.trim();
}

export function createSheetsClient({ getToken, fetchImpl = fetch }) {
  if (typeof getToken !== 'function') {
    throw new Error('getToken is required');
  }

  async function request(url, options = {}) {
    const token = await getToken();
    if (typeof token !== 'string' || token.trim() === '') {
      throw new Error('Google OAuth token unavailable');
    }

    const response = await fetchImpl(url, {
      ...options,
      headers: {
        Authorization: 'Bearer ' + token,
        'Content-Type': 'application/json',
        ...(options.headers ?? {})
      }
    });

    if (!response?.ok) {
      throw new Error(
        'Google Sheets request failed: ' + (response?.status ?? 'unknown')
      );
    }

    return response.json();
  }

  return {
    async getValues(spreadsheetId, range) {
      const id = requiredString(spreadsheetId, 'spreadsheetId');
      const exactRange = requiredString(range, 'range');
      const data = await request(
        BASE + '/' + encodeURIComponent(id) +
        '/values/' + encodeURIComponent(exactRange)
      );
      return data.values ?? [];
    },

    async updateValues(spreadsheetId, range, values) {
      const id = requiredString(spreadsheetId, 'spreadsheetId');
      const exactRange = requiredString(range, 'range');
      if (!Array.isArray(values)) throw new Error('values must be an array');

      return request(
        BASE + '/' + encodeURIComponent(id) +
        '/values/' + encodeURIComponent(exactRange) +
        '?valueInputOption=RAW',
        {
          method: 'PUT',
          body: JSON.stringify({ values })
        }
      );
    },

    async batchUpdate(spreadsheetId, requests) {
      const id = requiredString(spreadsheetId, 'spreadsheetId');
      if (!Array.isArray(requests) || requests.length === 0) {
        throw new Error('requests must be a non-empty array');
      }

      return request(
        BASE + '/' + encodeURIComponent(id) + ':batchUpdate',
        {
          method: 'POST',
          body: JSON.stringify({ requests })
        }
      );
    }
  };
}
