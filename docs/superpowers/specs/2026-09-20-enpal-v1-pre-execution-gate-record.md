# EnPal V1 — Pre-Execution Gate Record

**Date:** 2026-09-20  
**Technical Spec:** APPROVED  
**Scope:** Pre-Execution Gates + runtime contract alignment before EnPal V1 runtime implementation.

## Result

| Gate | Status | Evidence / ruling |
|---|---|---|
| Target ChatGPT Project reads exact canonical runtime sources | OPEN | Requires a live test inside the configured ChatGPT Project against the new canonical URLs. Current connector access does not prove Project-context access. |
| Target ChatGPT Project writes required runtime Sheets without per-lesson approval | OPEN | Historical spike was conditional. Exact Project → runtime Sheet flow still requires live proof. |
| Extension OAuth reads/writes configured Sheets | PASS | Live loaded-extension verification passed on 2026-09-20: interactive Chrome Identity OAuth succeeded; reading `CURRICULUM!A1:B3` from spreadsheet `19Q6x9dOJVY-yRxuInThBj1gODQWAmyV1-EbeOh-2JLU` returned HTTP 200; a temporary test sheet was then created, written with `ENPAL_WRITE_OK`, read back successfully, and deleted. No test sheet was left behind. |
| Voice START/STOP semantic trusted-input mechanism | PASS (spike) | Previously verified in the supported desktop Chrome/ChatGPT environment. Must be reconfirmed in live adapter/E2E acceptance. |
| Listening Mask protects content before protected controls render | PASS (spike) | Previously verified. Must be reconfirmed for protected Listening E2E. |
| Runtime contracts aligned to approved spec | PASS | Canonical START, PAUSE, END, ANALYZE, UPDATE, Review Planner, Supervisor, Session Brief Contract and exact-source registry created and read back. |
| Production Chrome Extension OAuth client ID exists | PASS | Chrome Extension OAuth client `75024264025-jfk5jl6gip980b1fubg5jvmsnsdbqcf5.apps.googleusercontent.com` was created for stable Extension ID `lnnnbbkifillljlhcpaekmjaemljlmkd` and is now configured in `manifest.json`. |
| Supervisor failure policy / transport boundary | PASS | Canonical contract defines fail-open DEGRADED/UNAVAILABLE behavior; no Observer/backend introduced. |

## Canonical Runtime Data Sources

### Curriculum
- Name: EnPal Curriculum V1
- ID: `19Q6x9dOJVY-yRxuInThBj1gODQWAmyV1-EbeOh-2JLU`
- URL: https://docs.google.com/spreadsheets/d/19Q6x9dOJVY-yRxuInThBj1gODQWAmyV1-EbeOh-2JLU/edit
- State: canonical storage shape, engineering smoke row only.

### EnPal Database
- ID: `13zDzNQSgxicIUBm8oE0CVAXzheTJ45KeeRrsaT3pJv4`
- URL: https://docs.google.com/spreadsheets/d/13zDzNQSgxicIUBm8oE0CVAXzheTJ45KeeRrsaT3pJv4/edit
- Sessions tab is retained as operational storage.
- Legacy Learner / Target Bank / Curriculum / Next Session areas are non-authoritative unless migrated.

### Session Brief
- Name: EnPal Session Brief V1
- ID: `1MsD-v6olhkecgBxFzWZg61f1WPo42u7hFhNQRgYk-QU`
- URL: https://docs.google.com/spreadsheets/d/1MsD-v6olhkecgBxFzWZg61f1WPo42u7hFhNQRgYk-QU/edit
- Tabs: `ACTIVE`, `_STAGING`
- ACTIVE contains smoke bootstrap identity `v1-smoke / 1 / smoke-speaking-001`.
- _STAGING is initialized EMPTY.

### Review Ledger
- ID: `1sQRdyjVvmQCOXPx6w-HHwGP1xeP8mjy5n2aHojJjzDs`
- URL: https://docs.google.com/spreadsheets/d/1sQRdyjVvmQCOXPx6w-HHwGP1xeP8mjy5n2aHojJjzDs/edit
- Header readback matches the V1 Review Ledger contract.

## Canonical Runtime Contracts

- START: https://docs.google.com/document/d/106OuuS11T_3HUAjafQwZEaDq5YDW94Or0lOjZZ3L6j8/edit
- PAUSE: https://docs.google.com/document/d/1Ut9sJ4otoB8gE3EUnSTsfzzYYoWz11wSNTgSPDLg5qc/edit
- END: https://docs.google.com/document/d/1fOSbWqTKcORxKGA0s_vW89NXZLjzAncrmhLLH0H1KSQ/edit
- ANALYZE: https://docs.google.com/document/d/1gEzw4CsfbBWSyLjfI9n5OITUkf_12qYlXsJAUlJa8Hc/edit
- UPDATE: https://docs.google.com/document/d/1y9Uguu1o2wwDtkvPYoExc1-ll7m8dDUP4nSjydJrYa4/edit
- Review Planner: https://docs.google.com/document/d/1JL0IasptxUJ0Qa2gDx5EFTaDJTX0jZydfG5cW97fZLo/edit
- Supervisor: https://docs.google.com/document/d/1f_1dOF5FVNI6R8sDjo7URHhtJasIQ8VTmv63HNXOjPI/edit
- Session Brief Contract: https://docs.google.com/document/d/19tXdepApXzIG4rVGmIuXx3Ge-YCxhJo9f_QX_4Kzt3s/edit
- Runtime Source Registry: https://docs.google.com/document/d/1Pov9MX_39iACYdt1ccEsOE9NJucJSlxoKuT_87vb44w/edit

Existing Teacher Role, Speaking Method, and Listening Method remain canonical because their semantics already match the approved Technical Spec.

## Legacy Isolation

The old raw ANALYZE, UPDATE, Review Planner, Supervisor, and audited Technical Spec files were renamed with a `LEGACY__` prefix.

Legacy Base Lesson JSON, Target Bank, old Curriculum/Next Session areas, and PREPARE assumptions remain migration/reference only.

## Important Limitation

The new Curriculum + ACTIVE Session Brief contain **smoke-test bootstrap data**, not final production curriculum. This is sufficient for implementation and live engineering gates, but production curriculum population remains a later data task before release.

## Implementation Gate Timing

- Tasks 1–2 may proceed now.
- Task 3 manifest OAuth configuration is complete.
- Task 4+ Google integration may proceed; live Extension OAuth read/write verification passed on 2026-09-20.
- Live START/RESUME/END acceptance requires the two OPEN target-Project gates.
- Release requires all gates plus live E2E acceptance.
