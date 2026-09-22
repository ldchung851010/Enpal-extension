import { createGoogleOAuthTokenProvider } from './google-oauth.js';

const provider = createGoogleOAuthTokenProvider({
  credentialsPath:
    process.env.ENPAL_GOOGLE_OAUTH_CLIENT ||
    '.enpal/google-oauth-client.json',
  tokenPath:
    process.env.ENPAL_GOOGLE_TOKEN_FILE ||
    '.enpal/google-token.json'
});

try {
  await provider.authorizeInteractive();
  console.log('PASS: Google Sheets authorization stored for EnPal.');
  console.log('Token file:', provider.tokenPath);
} catch (error) {
  console.error('FAIL:', error?.message || String(error));
  process.exitCode = 1;
}
