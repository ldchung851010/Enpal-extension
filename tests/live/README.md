# EnPal V1 Live Acceptance

This directory contains the manual production-like acceptance procedure for EnPal V1.

## Environment

Run the checklist in the configured desktop Chrome profile with:

- the EnPal MV3 extension loaded from the commit under test;
- the configured EnPal ChatGPT Project;
- the configured Google account and Workspace sources;
- the canonical runtime source registry in effect.

Automated tests, GitHub Actions, Google Drive connector reads, and historical spike evidence do **not** by themselves satisfy a live acceptance checkbox.

## Evidence rule

For every gate in `enpal-v1-e2e-checklist.md`:

1. perform the action in the production-like Chrome profile;
2. record `PASS` or `FAIL`;
3. capture the Session ID and authoritative Chat URL when applicable;
4. record the exact Sheet range, durable marker, or observable UI evidence;
5. add concise notes sufficient for another reviewer to reproduce the conclusion.

A FAIL blocks V1 release. An unexecuted gate remains unchecked.

## Prior evidence

The pre-execution gate record contains earlier evidence that Extension OAuth read/write passed on 2026-09-20, and that Voice START/STOP and Listening Mask passed earlier spikes. Those results are useful context, but this checklist intentionally requires acceptance against the integrated build under test.

The two target ChatGPT Project Google-access gates remain OPEN until this checklist records live evidence from the configured Project.

## Commands

Run before live execution:

```bash
npm test
npm run test:integration
npm run test:live
```

The final command prints the path to the checklist; it does not execute the live acceptance automatically.
