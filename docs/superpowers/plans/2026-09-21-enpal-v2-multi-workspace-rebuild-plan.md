# EnPal V2 Multi-Workspace Rebuild Plan

**Status:** IN PROGRESS  
**Date:** 2026-09-21  
**Spec:** `docs/superpowers/specs/2026-09-21-enpal-v2-multi-workspace-technical-contract.md`

## Rebuild Rule

All implementation tasks restart from zero on this branch.

A checkbox is marked complete only after its required evidence passes. Code existence alone is not completion.

## Task Order

### Task 1 — Lock Multi-Workspace Runtime Contracts

Files:
- `core/state.js`
- `core/config.js`
- `core/errors.js`
- `tests/unit/state.test.js`
- `tests/unit/config.test.js`
- `tests/unit/errors.test.js`

Required evidence:
- focused Node tests PASS;
- Workspace readiness, Project URL normalization, blocking states, and workspace error codes are contract-tested.

- [x] Contract tests updated for Workspace states and switch blocking.
- [x] Config accepts DRAFT Workspace and validates READY Workspace.
- [x] Project conversation URL normalizes to Project root.
- [x] Runtime-ready config cannot omit required source IDs or Session Brief sheet IDs.
- [x] Workspace-specific error codes exist.
- [x] Focused automated tests PASS.

**Task 1 evidence (2026-09-21):** exact committed contract files reconstructed and executed with Node; 17/17 focused tests PASS.\n\n### Task 2 — Workspace Registry and Isolation

Files:
- `storage/workspace-registry.js`
- `tests/unit/workspace-registry.test.js`

Required behavior:
- persistent Workspace list + active Workspace ID;
- immutable Workspace ID;
- duplicate Project/stateful Sheet sources rejected;
- switching changes selector only;
- DRAFT is allowed;
- deleting final Workspace is rejected.

- [x] Registry tests written.
- [x] Registry implementation complete.
- [x] Cross-workspace source conflict tests PASS.
- [x] Focused automated tests PASS.

**Task 2 evidence (2026-09-21):** Task 1 + registry regression run; 27/27 tests PASS.\n\n### Task 3 — Namespaced Recovery Journal

Files:
- `storage/local-journal.js`
- `tests/unit/local-journal.test.js`

Required behavior:
- key format `enpalWorkspace:<id>:recovery`;
- one Workspace cannot read/write/clear another Workspace journal;
- no legacy global recovery fallback in new runtime.

- [x] Isolation tests written.
- [x] Journal implementation complete.
- [x] Focused automated tests PASS.

**Task 3 evidence (2026-09-21):** Task 1–3 regression run; 33/33 tests PASS. Legacy global `enpalRecovery` is not read by the new journal.\n\n### Task 4 — OAuth and Thin Sheets Client

- [x] Chrome Identity contract tests PASS.
- [x] Sheets read/update/batchUpdate tests PASS.
- [x] Production OAuth config retained.
- [ ] Live OAuth read/write gate PASS.

**Task 4 automated evidence (2026-09-21):** OAuth + Sheets focused suite PASS 9/9. Production stable extension key/client retained and generic Google API host permission removed. Live OAuth read/write remains OPEN until executed in loaded Chrome.\n\n### Task 5 — Workspace-Scoped Durable Repositories

Curriculum, Sessions, Session Brief and Review Ledger repositories receive explicit Workspace configuration.

- [x] No repository reads an implicit global spreadsheet ID.
- [x] One-active-session invariant is evaluated per Workspace.
- [x] Repository unit tests PASS.

**Task 5 evidence (2026-09-21):** workspace-scoped repository suite PASS 10/10. A/B source isolation, per-Workspace active-session consistency, foreign workspace fail-closed, and atomic Brief promotion grid IDs are covered.\n\n### Task 6 — ENPAL_CONTROL and Project-Bound ChatGPT Adapter

- [ ] Adapter receives explicit Workspace Project URL.
- [ ] New conversation must be confirmed inside that Project before binding.
- [ ] Composer text appearance is not treated as submission.
- [ ] Submission acknowledgement is structural, not assistant-prose parsing.
- [ ] Focused adapter tests PASS.
- [ ] Live submit acceptance PASS.

### Task 7 — Voice and Listening Mask

- [ ] Trusted Voice START/STOP tests PASS.
- [ ] Required Listening Mask fails closed.
- [ ] Live Voice acceptance PASS.
- [ ] Live protected Listening no-flash acceptance PASS.

### Task 8 — Supervisor Degraded Mode

- [ ] ENPAL_CONTROL excluded from pedagogical evidence.
- [ ] Supervisor failure produces DEGRADED and does not block lesson.
- [ ] Tests PASS.

### Task 9 — Pure Workspace Recovery Decisions

- [ ] Recovery receives explicit Workspace state.
- [ ] Two active Sessions in one Workspace => consistency ERROR.
- [ ] PAUSED in Workspace A does not affect Workspace B.
- [ ] Tests PASS.

### Task 10 — START / RESUME

- [ ] New START creates one Session in selected Workspace.
- [ ] Exact Project binding verified.
- [ ] Exact Workspace journal used.
- [ ] RESUME opens exact bound chat.
- [ ] Integration tests PASS.
- [ ] Live START/RESUME acceptance PASS.

### Task 11 — PAUSE

- [ ] Voice stops before checkpoint control.
- [ ] Durable checkpoint verified in selected Workspace.
- [ ] Workspace remains switchable after PAUSE.
- [ ] Integration tests PASS.
- [ ] Live PAUSE acceptance PASS.

### Task 12 — END Pipeline

- [ ] ANALYZE → UPDATE → Planner → staging → promotion order verified.
- [ ] Idempotent restart cases PASS.
- [ ] Only selected Workspace advances.
- [ ] Integration tests PASS.
- [ ] Live END acceptance PASS.

### Task 13 — Setup Gate and Multi-Workspace Side Panel

- [ ] Workspace selector.
- [ ] Add DRAFT Workspace.
- [ ] Complete/edit Workspace configuration.
- [ ] READY/SETUP_REQUIRED is evaluated per Workspace.
- [ ] Switch blocked during LEARNING/PROCESSING.
- [ ] Edit/delete blocked for PAUSED/recoverable ERROR runtime identity.
- [ ] UI tests PASS.
- [ ] Browser acceptance PASS.

### Task 14 — MV3 Event Wiring

- [ ] Service worker remains short/event-driven.
- [ ] No workflow correctness depends on worker lifetime.
- [ ] Tests PASS.

### Task 15 — Cross-Workspace Isolation Matrix

At minimum:
- Workspace A PAUSED + Workspace B READY;
- A recovery journal does not affect B;
- A crash recovery does not mutate B;
- A END does not update B Ledger/Brief/Curriculum;
- duplicate Project/Sheet configuration is rejected;
- switching from LEARNING/PROCESSING is blocked.

- [ ] Full isolation matrix PASS.

### Task 16 — Crash Recovery Matrix Per Workspace

Run every approved crash window with a Workspace identity.

- [ ] All crash windows PASS for Workspace A.
- [ ] Same recovery state in Workspace B remains untouched.
- [ ] Full regression suite PASS.

### Task 17 — Two-Workspace Live E2E Acceptance

Use two independently configured Workspaces.

- [ ] Setup A → READY.
- [ ] Setup B → READY.
- [ ] START/PAUSE A.
- [ ] Switch to B while A is PAUSED.
- [ ] Complete a lesson in B.
- [ ] Return to A and RESUME exact bound chat.
- [ ] END A.
- [ ] Verify no cross-workspace data mutation.
- [ ] Verify switching is blocked while LEARNING/PROCESSING.
- [ ] All evidence recorded with Workspace ID, Session ID and Chat URL.

### Task 18 — Permission, Privacy and Release Audit

- [ ] Full automated suite PASS.
- [ ] Two-Workspace live E2E PASS.
- [ ] OAuth client and exact source configuration reviewed.
- [ ] No tokens stored in local recovery state.
- [ ] No assistant-prose parsing.
- [ ] No runtime source discovery by title.
- [ ] Permission/privacy checklist PASS.

## Global Definition of Done

EnPal V2 is release-ready only when all 18 tasks are complete and the two-Workspace live E2E proves isolation. A dashboard percentage or checked implementation step is not release evidence by itself.
