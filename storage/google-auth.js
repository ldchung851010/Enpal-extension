function normalizeHeaders(headers = {}) {
  if (typeof Headers !== 'undefined' && headers instanceof Headers) {
    return Object.fromEntries(headers.entries());
  }
  return { ...headers };
}

export function createGoogleAuth({ chromeApi = chrome, fetchImpl = fetch } = {}) {
  async function getToken({ interactive = false } = {}) {
    const result = await chromeApi.identity.getAuthToken({ interactive });
    const token = typeof result === 'string' ? result : result?.token;
    if (!token) {
      throw new Error('Google auth: no access token returned');
    }
    return token;
  }

  async function invalidateToken(token) {
    await chromeApi.identity.removeCachedAuthToken({ token });
  }

  async function requestWithToken(url, options, token) {
    const headers = normalizeHeaders(options?.headers);
    headers.Authorization = `Bearer ${token}`;
    return fetchImpl(url, { ...options, headers });
  }

  async function authorizedFetch(url, options = {}) {
    let token = await getToken();
    let response = await requestWithToken(url, options, token);

    if (response.status !== 401) {
      return response;
    }

    await invalidateToken(token);
    token = await getToken();
    response = await requestWithToken(url, options, token);
    return response;
  }

  return {
    getToken,
    authorizedFetch,
    invalidateToken
  };
}
