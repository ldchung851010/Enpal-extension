# EnPal Playwright V2 — Task 1 smoke gate

This branch introduces Playwright as a parallel runtime. The Chrome extension is intentionally left intact until the Playwright path proves the real ChatGPT flow.

## Recommended Windows mode: attach to normal Chrome

Google may reject sign-in when Chrome/Chromium is launched directly by browser automation. For EnPal on Windows, the preferred flow is:

1. Start normal installed Chrome yourself with a dedicated profile and a remote-debugging port.
2. Sign in to Google/ChatGPT normally in that Chrome window.
3. Run EnPal Playwright and attach to that already-open Chrome.
4. Playwright controls ChatGPT only after authentication already exists.

Close all EnPal-debug Chrome windows first, then run in PowerShell:

```powershell
$chrome = "$env:ProgramFiles\Google\Chrome\Application\chrome.exe"
if (-not (Test-Path $chrome)) {
  $chrome = "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe"
}

& $chrome --remote-debugging-port=9222 --user-data-dir="$env:USERPROFILE\EnpalChromeProfile"
```

Keep that Chrome window open. In it, sign in to ChatGPT and confirm the target Project opens normally.

Then, in a second PowerShell window from the repository:

```powershell
$env:ENPAL_CDP_ENDPOINT="http://127.0.0.1:9222"
$env:ENPAL_PROJECT_URL="https://chatgpt.com/g/g-p-..."
$env:ENPAL_KEEP_OPEN="1"

npm run pw:smoke:start -- "EnPal Playwright smoke. Reply only OK."
```

The dedicated `EnpalChromeProfile` is intentional. Do not use your normal Chrome profile while Chrome is already running because Chrome locks active user-data directories.

## Task 1 scope

Task 1 proves exactly this real browser flow:

1. Connect to or launch a browser.
2. Open the configured ChatGPT Project.
3. Wait for the Project new-chat surface.
4. Fill the ChatGPT composer.
5. Click the visible Send control.
6. Confirm the user turn exists.
7. Confirm ChatGPT created a conversation URL inside the configured Project.

Task 1 does **not** yet implement Voice, Pause, Resume, End, Google Sheets auth, Supervisor, or Listening Mask.

## Install

```powershell
git checkout playwright-v2
npm install
npm run pw:install
```

## Run the unit gate

```powershell
npm run test:playwright:unit
```

Expected: 4 passing tests.

## Fallback: Playwright-launched browser

This mode remains available for environments where login succeeds:

```powershell
$env:ENPAL_BROWSER_CHANNEL="chrome"
$env:ENPAL_PROJECT_URL="https://chatgpt.com/g/g-p-..."
npm run pw:smoke:start -- "EnPal Playwright smoke. Reply only OK."
```

For the current EnPal Windows setup, attach mode is preferred.

## Acceptance

Task 1 is accepted only if both gates pass:

- `npm run test:playwright:unit` passes.
- The real smoke run prints `PASS: authoritative conversation created inside Project` and returns a URL under the configured Project path.

Do not continue to Task 2 if the real smoke gate fails.
