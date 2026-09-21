export async function getGoogleAccessToken(chromeApi = chrome, interactive = false) {
  if (!chromeApi?.identity?.getAuthToken) {
    throw new Error('Chrome Identity API unavailable');
  }

  const result = await chromeApi.identity.getAuthToken({ interactive });
  const token = typeof result === 'string' ? result : result?.token;

  if (typeof token !== 'string' || token.trim() === '') {
    throw new Error('Google OAuth token unavailable');
  }

  return token;
}
