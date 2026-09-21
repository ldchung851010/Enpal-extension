# EnPal Playwright V2 — Task 1 smoke gate

This branch introduces Playwright as a parallel runtime. The Chrome extension remains intact until the Playwright path proves the real ChatGPT flow.

## What is verified before live testing

The Playwright adapter has repeatable automated gates for:

- current ChatGPT Project route shape with the UI-only `/project` suffix;
- ProseMirror/contenteditable composer filling;
- fallback keyboard insertion if `fill()` does not update editor state;
- semantic Send discovery using `#composer-submit-button` / `data-testid="send-button"`;
- keyboard-focused Send activation so sticky overlays cannot block pointer clicks;
- fail-closed behavior when Send never becomes enabled;
- submission proof from a rendered user turn;
- fallback submission proof from a Project conversation canonical URL plus a cleared composer;
- rejection of a conversation created outside the configured Project;
- attaching to an already-authenticated Chrome through CDP;
- using a fresh automation tab instead of taking over an existing learner tab;
- disconnecting Playwright without terminating the externally owned Chrome process.

Run the automated gate with:

```powershell
npm run test:playwright
```

The gate contains 7 contract/unit cases and 3 real Chromium cases.

## Recommended Windows mode: attach to normal Chrome

Google may reject sign-in when Chrome/Chromium is launched directly by browser automation. EnPal therefore attaches to a Chrome instance that the learner launches with a dedicated profile and remote debugging.

Start the dedicated Chrome from PowerShell:

```powershell
$chrome = "$env:ProgramFiles\Google\Chrome\Application\chrome.exe"

if (-not (Test-Path $chrome)) {
  $chrome = "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe"
}

& $chrome --remote-debugging-port=9222 --user-data-dir="$env:USERPROFILE\EnpalChromeProfile"
```

Sign in to ChatGPT normally in that Chrome window and keep it open.

Then, from the repository:

```powershell
$env:ENPAL_CDP_ENDPOINT="http://127.0.0.1:9222"
$env:ENPAL_PROJECT_URL="https://chatgpt.com/g/g-p-..."
$env:ENPAL_KEEP_OPEN="1"

npm run pw:smoke:start -- "EnPal Playwright smoke. Reply only OK."
```

## Task 1 scope

Task 1 proves exactly this real browser flow:

1. Attach to the already-authenticated Chrome context.
2. Open a fresh automation tab.
3. Open the configured ChatGPT Project.
4. Wait for the Project new-chat surface.
5. Fill the ChatGPT composer.
6. Wait until the semantic Send control is enabled.
7. Focus Send and activate it with trusted keyboard input.
8. Confirm the message was submitted.
9. Confirm the resulting conversation belongs to the configured Project.

Task 1 does **not** yet implement Voice, Pause, Resume, End, Google Sheets auth, Supervisor, or Listening Mask.

## Install

```powershell
git checkout playwright-v2
npm install
npm run pw:install
```

## Acceptance

Task 1 is accepted only when:

- `npm run test:playwright` passes;
- the live smoke run prints `PASS: authoritative conversation created inside Project`;
- the returned conversation URL belongs to the configured Project.

Do not continue to Task 2 if the live smoke gate fails.
