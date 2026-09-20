export async function getGoogleAccessToken(chromeApi = chrome, interactive = false) {
  const result = await chromeApi.identity.getAuthToken({ interactive });
  const token = typeof result === 'string' ? result : result?.token;
  if (!token) throw new Error('Google OAuth token unavailable');
  return token;
}
