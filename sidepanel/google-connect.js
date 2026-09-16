import { createGoogleAuth } from '../storage/google-auth.js';

const DEFAULT_GOOGLE_AUTH_TIMEOUT_MS = 60_000;

export async function connectGoogle({
  auth = createGoogleAuth(),
  timeoutMs = DEFAULT_GOOGLE_AUTH_TIMEOUT_MS
} = {}) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(
        'Google authorization did not return to EnPal. Close any Google sign-in window, then try again.'
      ));
    }, timeoutMs);
  });

  try {
    await Promise.race([
      auth.getToken({ interactive: true }),
      timeout
    ]);
    return { ok: true };
  } finally {
    clearTimeout(timeoutId);
  }
}
