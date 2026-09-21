# Task 1–3 Browser Smoke Test

This live test is deliberately separate from learner runtime.

## Scope

It verifies only:

- Task 1 runtime/workspace contracts;
- Task 2 Workspace Registry isolation;
- Task 3 per-Workspace recovery journal isolation.

It does **not** verify OAuth, Google Sheets, ChatGPT Adapter, START, PAUSE, END, Voice, Listening Mask, Supervisor, or learner Side Panel behavior.

## Run

1. Check out branch `rebuild/v2-multi-workspace`.
2. Open `chrome://extensions`.
3. Enable Developer mode.
4. Choose **Load unpacked** and select the repository root.
5. Copy the loaded EnPal Extension ID shown by Chrome.
6. Open:

```text
chrome-extension://<EXTENSION_ID>/tests/live/task1-3-workspace-smoke.html
```

7. Click **Run Task 1–3 smoke test**.
8. Expected result: every check displays PASS.

The page writes only the rebuild extension's own `chrome.storage.local`. The smoke IDs are A/B and the page resets those smoke keys before each run.
