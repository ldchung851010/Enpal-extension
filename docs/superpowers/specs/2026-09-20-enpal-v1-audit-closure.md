# EnPal V1 — Multi-Role Audit Closure

**Date:** 2026-09-20  
**Spec commit:** `2208909d88df6f2a809340c18be01c7bdf0f8f69`

This note records how the multi-role audit blockers were closed in the revised Technical Spec.

| Audit blocker | Resolution |
|---|---|
| Canonical Curriculum undefined | Dedicated canonical Curriculum Sheet, exact configured spreadsheet ID |
| ChatGPT↔Google capability too late | Promoted to pre-implementation platform gate |
| Extension execution architecture missing | Added Workflow Orchestrator, ChatGPT Adapter, Sheets Client, Recovery Journal, Supervisor Controller, Mask Controller, Side Panel boundaries |
| First-run setup missing | Added SETUP_REQUIRED → READY gate |
| Session Brief identity conflicted with future session_id | Brief identity = curriculum_version + curriculum_sequence + lesson_id; session_id binds at START |
| Safe Session Brief replacement undefined | ACTIVE + _STAGING, verified staging, atomic Sheets batch promotion |
| Chat creation crash window | Same session_id is retained; recover saved tab when safe; otherwise replacement chat; only one authoritative bound chat_url; orphan external chat accepted |
| Extension Google OAuth undefined | Chrome Identity OAuth + manifest oauth2 configuration; tokens not stored in local journal |
| MV3 worker lifetime risk | Explicit ephemeral-worker rule; all critical workflow phases recover from persistent state |
| One-active-session rule missing | At most one STARTING/IN_PROGRESS/PAUSED/PROCESSING Session; duplicates cause consistency error |
| Crash acceptance too broad | Added nine-point crash-window matrix |
| EnPal control traffic contaminates evidence | Reserved ENPAL_CONTROL classification; excluded from Supervisor and ANALYZE evidence |
| External instruction trust unclear | Added control/data/conversation trust hierarchy + exact-source allowlist |
| ChatGPT UI coupling scattered | All ChatGPT UI knowledge isolated behind ChatGPT Adapter |
| Supervisor failure policy unresolved | Fail-open degraded mode; lesson/END continue without fabricated Supervisor output |
| Required/fallback failure policy unclear | Added explicit fail-closed vs fail-open matrix |
| Permission/security boundary weak | Added OAuth/token rule, debugger isolation, permission minimization, content-light diagnostics |
| Test strategy too live-dependent | Added unit + adapter/contract + live E2E layers |

## Scope kept out of V1

The closure deliberately does not add:

- backend/server;
- event sourcing;
- historical Session Brief archive;
- distributed transaction system;
- telemetry platform;
- complex onboarding wizard;
- frontend framework rewrite;
- generalized migration framework;
- multi-user architecture.

## Result

The remaining gate is now **user review of the written spec**, followed by implementation planning if approved.
