# EnPal Playwright V2 — Task 1 smoke gate

This branch introduces Playwright as a parallel runtime. The Chrome extension is intentionally left intact until the Playwright path proves the real ChatGPT flow.

## Task 1 scope

Task 1 proves exactly this real browser flow:

1. Launch a persistent Playwright browser profile.
2. Open the configured ChatGPT Project.
3. Wait for the Project new-chat surface.
4. Fill the ChatGPT composer.
5. Click the visible Send control.
6. Confirm the user turn exists.
7. Confirm ChatGPT created a conversation URL inside the configured Project.

Task 1 does **not** yet implement Voice, Pause, Resume, End, Google Sheets auth, Supervisor, or Listening Mask.

## Install

```bash
git checkout playwright-v2
npm install
npm run pw:install
```

## Run the unit gate

```bash
npm run test:playwright:unit
```

Expected: 4 passing tests.

## Run the real ChatGPT smoke gate

Use the exact ChatGPT Project URL already configured for EnPal.

macOS/Linux:

```bash
ENPAL_PROJECT_URL="https://chatgpt.com/g/g-p-..." \
npm run pw:smoke:start -- "EnPal Playwright smoke. Reply only OK."
```

PowerShell:

```powershell
$env:ENPAL_PROJECT_URL="https://chatgpt.com/g/g-p-..."
npm run pw:smoke:start -- "EnPal Playwright smoke. Reply only OK."
```

On the first run, Playwright uses a dedicated persistent browser profile at `.enpal/browser-profile`. If ChatGPT asks you to sign in, complete sign-in in the opened browser. The script waits for the authenticated Project surface.

Do not point Playwright at your normal Chrome user-data directory. A dedicated profile avoids profile-lock conflicts and keeps EnPal automation state isolated.

Optional environment variables:

- `ENPAL_BROWSER_PROFILE`: custom dedicated profile path.
- `ENPAL_BROWSER_CHANNEL=chrome`: use installed Google Chrome instead of bundled Chromium.
- `ENPAL_KEEP_OPEN=1`: keep the browser open after PASS.

## Acceptance

Task 1 is accepted only if both gates pass:

- `npm run test:playwright:unit` passes.
- The real smoke run prints `PASS: authoritative conversation created inside Project` and returns a URL under the configured Project path.

Do not continue to Task 2 if the real smoke gate fails.
