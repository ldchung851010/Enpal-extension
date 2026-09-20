# EnPal V1 — Multi-Role Design Review & Audit

**Date:** 2026-09-20  
**Reviewed spec:** `docs/superpowers/specs/2026-09-20-enpal-v1-technical-spec.md`  
**Reviewed codebase:** current `main` extension shell  
**Review perspectives:** CTO, Product/PM, Tech Lead, Chrome Extension Engineer, Data/Workflow Engineer, QA/Reliability, Learning Design, Security/Privacy, UX, Maintainer/Release.

## Executive verdict

**Architecture direction: sound.**  
**Spec status: not yet ready for final approval / implementation planning.**

The current spec has substantially improved ownership and recovery boundaries, but this wider review found a second class of problems: several critical implementation invariants still have no concrete architectural mechanism, and some platform prerequisites are being treated too late.

The recommended response is **not** to expand V1. Fix the architecture gaps below, then stop adding features.

---

# 1. CTO / System Architecture Review

## CTO-1 — Canonical Curriculum source is still undefined — P0

The spec says the Extension deterministically selects the next Base Lesson from the fixed curriculum, but it does not define the authoritative curriculum store or the contract used to retrieve a Base Lesson.

Without this, the core loop cannot be implemented consistently.

**Required decision before final approval:**
Choose one canonical curriculum source and identify it by exact configured ID/location. The implementation must never discover it by filename/title.

The spec should define only the source and ownership, not every curriculum field.

## CTO-2 — Google/ChatGPT write capability is a pre-implementation platform gate — P0

The architecture requires ChatGPT to read and perform durable writes to Google Workspace files.

Current OpenAI product behavior makes connected-app availability dependent on plan, workspace, permissions, interface, and provider authorization. File-changing actions may also require confirmation.

Therefore this cannot remain merely an end-of-project acceptance test.

**Required correction:** promote this to a **pre-implementation capability gate**:
- exact ChatGPT environment can read every required configured file;
- exact environment can perform required Sheet writes;
- the workflow does not require an approval prompt on every automated lesson transaction.

If this gate fails, revisit architecture before building the workflow engine.

## CTO-3 — Extension execution architecture is missing — P0

The spec defines responsibilities, but not the runtime component boundaries that make those responsibilities implementable.

At minimum, the architecture needs explicit units for:
- Workflow Orchestrator;
- ChatGPT Tab Adapter;
- Google Sheets Client / Verifier;
- Recovery Journal;
- Supervisor Controller;
- Listening Mask Controller;
- Side Panel UI.

The internal file layout is not important yet. The responsibility boundaries are.

## CTO-4 — Browser-UI coupling needs one isolation boundary — P1

ChatGPT DOM/UI changes are the highest expected regression source.

All ChatGPT-specific DOM, selectors, Voice controls, idle detection, Project navigation and rename behavior should sit behind one adapter boundary.

Core workflow code must not know ChatGPT DOM details.

---

# 2. Product / PM Review

## PM-1 — First-run setup is missing as a product flow — P0

V1 cannot operate until it has:
- configured ChatGPT Project;
- configured exact Sheet/file IDs;
- working Google authorization for the Extension;
- working Google/ChatGPT connected-app access;
- first Session Brief bootstrapped.

The spec currently describes bootstrap but not the setup gate that makes bootstrap possible.

**Required correction:** add a minimal `SETUP_REQUIRED → READY` product boundary. Do not design a complex wizard yet.

## PM-2 — Supported environment is not explicit — P1

V1 should explicitly state its supported runtime.

Recommended V1 boundary:
- desktop Chrome;
- supported ChatGPT Web account/workspace;
- configured Google account/files;
- no mobile/iPhone/iPad runtime promise in V1.

## PM-3 — User command model is incomplete — P1

The spec correctly gives one START action, but should state the full learner-facing command model:

- START — new or resume automatically;
- PAUSE — temporarily stop;
- END — finish lesson;
- RETRY/RECOVER only when the app is in a recoverable error state.

The user should never choose pipeline phases such as ANALYZE or UPDATE.

## PM-4 — Core dependency failures need product policy — P0

The spec needs a small fail-open / fail-closed policy.

Recommended:
- required Sheet/reference access fails → **fail closed**;
- protected Listening Mask cannot be armed → **fail closed**;
- wrong/unknown ChatGPT conversation → **fail closed**;
- durable write cannot be verified → **fail closed**;
- rename fails → **fail open**;
- Supervisor failure → product decision still unresolved.

This is necessary to know whether START may continue.

---

# 3. Tech Lead Review

## TECH-1 — Session Brief identity currently conflicts with Session creation timing — P0

The Session Brief is created during the previous END.

But the next Session identity is currently created/reserved during the later START.

Therefore the Brief cannot reliably be linked to a future `session_id` unless the architecture pre-creates sessions.

**Simplest V1 correction:** Session Brief identity should be based on stable curriculum identity, for example:
- `lesson_id`;
- curriculum sequence/version.

START then creates the `session_id` and binds that Session to the verified current Brief.

Do not pre-create future Session rows unless there is another strong reason.

## TECH-2 — Safe Session Brief replacement has no mechanism — P0

The spec requires:
> keep the old valid Session Brief until the new one is complete.

But a single in-place Sheet write can partially overwrite the current brief before completion.

This invariant needs an implementable mechanism.

Simple V1 options:
- write a complete new brief into a transient staging area/tab and only switch/replace after verification; or
- use one atomic whole-brief Sheet update if the actual writer/action can guarantee it.

Transient staging is not lesson history and does not violate the decision to retain only one active Session Brief.

## TECH-3 — New-chat creation has an unresolved crash window — P0

Current sequence:
1. reserve Session;
2. create ChatGPT chat;
3. capture/persist chat URL.

If Chrome/Extension dies after chat creation but before URL persistence, a retry may create another chat.

The spec currently promises prevention of duplicate chats without defining how this window is closed.

**Required correction:** either:
- define a recoverable idempotent chat-creation strategy; or
- narrow the invariant to “never create a second active Session” and allow an orphan unused chat.

Do not promise stronger exactly-once behavior than the platform can provide.

## TECH-4 — Persistent actor ownership should be explicit — P1

Both ChatGPT and the Extension touch the same logical workflows.

Define an ownership matrix such as:
- Extension creates/binds Session identity and machine metadata;
- ChatGPT writes semantic checkpoint/analyze/learning results;
- UPDATE writes Review Ledger;
- ChatGPT writes Session Brief;
- Extension reads/verifies durable state.

This reduces accidental dual-writer races.

---

# 4. Chrome Extension / Code Review

## CODE-1 — Google OAuth architecture is not defined and current manifest is incomplete for the obvious path — P0

The current manifest declares `identity` but has no `oauth2` configuration.

Chrome's `identity.getAuthToken()` uses the client ID/scopes configured in the manifest.

Before implementation planning, choose:
- Chrome Identity + manifest OAuth2; or
- another explicit OAuth flow.

Do not leave Google authentication for the programmer to improvise.

## CODE-2 — MV3 service worker lifetime must shape the runtime design — P0

Manifest V3 service workers are ephemeral. The workflow cannot depend on one long-running in-memory function surviving a lesson or END pipeline.

The spec already uses durable state, but should explicitly require:
- event-driven orchestration;
- persistent workflow checkpoints;
- no correctness dependency on service-worker liveness.

## CODE-3 — `debugger` permission needs an explicit justification — P1

The current manifest requests `debugger`.

Chrome warns this permission can access the page debugger backend and read/change data on websites; it cannot be made optional. Newer enterprise Chrome policy can also restrict debugger attachment.

If Voice/trusted-input automation truly requires it, document exactly why.

If an implementation can work with narrower APIs, remove it.

## CODE-4 — Permission minimization should be an architectural rule — P1

Current manifest includes broad Google host access and `debugger`.

Before release:
- request only hosts/APIs actually used;
- do not future-proof permissions;
- separate essential permissions from removable ones.

## CODE-5 — Minimum supported Chrome version may be needed — P2

If implementation relies on particular Side Panel, debugger/service-worker, or other recent API behavior, state a minimum supported Chrome version rather than carrying compatibility branches.

---

# 5. Data / Workflow Review

## DATA-1 — One authoritative active-session invariant should be explicit — P0

At any time, there should be at most one non-completed learner session eligible for START/PAUSE/END.

Without this invariant, “resume PAUSED first” becomes ambiguous if bad data ever creates two candidates.

Recovery should treat multiple active Sessions as a consistency error, not guess.

## DATA-2 — Cross-system write ordering is acceptable, but commit boundaries must be named — P1

Full distributed transactions are unnecessary.

However, the implementation plan must give each critical phase a durable completion marker:

- Session/chat binding;
- PAUSE checkpoint;
- ANALYZE;
- UPDATE;
- Session Brief ready;
- Session completed.

The current spec already points in this direction; retain it.

## DATA-3 — Exact configured IDs should be a hard rule — P1

All production Sheets/Drive assets must be referenced by exact configured IDs/URLs.

Never “find the file named X” at runtime.

This protects both correctness and prompt-injection surface.

## DATA-4 — Minimal schema/version compatibility is needed — P2

Do not build a migration framework.

But durable stores and the Extension configuration should carry enough version identity to detect an incompatible old V1.1/legacy schema instead of silently using it.

---

# 6. QA / Reliability Review

## QA-1 — Acceptance tests need a crash-window matrix — P0

The current acceptance gate is broad but does not force testing of the dangerous boundaries.

At minimum test restart/crash after:

1. Session reserved, before chat creation;
2. chat created, before URL persisted;
3. URL persisted, before Voice;
4. checkpoint written, before PAUSE returns;
5. ANALYZE committed, before UPDATE;
6. UPDATE committed, before Planner;
7. next Brief written/ready, before current Session completion;
8. Session completed, before rename.

For every point, expected recovery must be deterministic.

## QA-2 — Live E2E cannot be the only test layer — P1

Current repo tests only verify the app-state constant.

Implementation should introduce:
- unit tests for state transitions/recovery decisions;
- contract tests for Sheets/ChatGPT adapters with fakes;
- live manual/automated smoke E2E for actual ChatGPT Web.

This avoids making every regression test depend on a live nondeterministic website.

## QA-3 — ERROR semantics are underspecified — P1

For each recoverable failure, define whether the user may:
- Retry;
- Resume;
- End safely;
- Reset setup.

Do not allow a generic ERROR state that leaves the only recovery path to developer intervention.

---

# 7. Learning Design Review

## LEARN-1 — EnPal control messages can contaminate Supervisor and ANALYZE evidence — P0

The same ChatGPT conversation contains:
- teaching;
- START/RESUME control messages;
- Pause instructions;
- Supervisor instructions;
- post-lesson processing commands.

If Supervisor or ANALYZE treats all transcript text equally, EnPal's own control traffic can be mistaken for learner/teacher evidence.

**Required correction:** EnPal control messages must have a recognizable internal type/marker and be excluded from pedagogical evidence.

Do not rely on natural-language guessing.

## LEARN-2 — Lesson boundary must be explicit for ANALYZE — P1

ANALYZE should evaluate the learning interval only.

PAUSE/RESUME administrative messages and later END processing are not learner evidence.

The session contract should provide a reliable lesson boundary or message classification.

## LEARN-3 — Canonical lesson model must preserve Review Item identity — P1

The canonical Session Brief model must keep the Review Item IDs selected by Review Planner.

ANALYZE and UPDATE depend on stable identity, not list order.

This is already true in current skills and must survive the new Sheet representation.

## LEARN-4 — Voice transcript sufficiency remains an E2E dependency — P1

ANALYZE and Supervisor depend on enough usable conversation evidence.

The live E2E gate must verify that the ChatGPT Voice conversation/realtime feed contains sufficient learner and teacher evidence for both Speaking and Listening.

---

# 8. Security / Privacy Review

## SEC-1 — Add a minimal data-flow/security section — P1

The spec should state:
- what learner data is stored;
- which systems receive it;
- that no transcript is copied to an EnPal backend because V1 has no backend;
- that authentication tokens are never stored as ordinary `chrome.storage.local` values;
- that diagnostic logs should avoid transcript/learning content by default.

## SEC-2 — Trusted-source hierarchy is needed — P0

ChatGPT is being instructed to read external documents.

Define trust classes:
- **control sources:** Teacher Role / Teaching Method / approved Skill instructions;
- **learning data sources:** Session Brief, Review Ledger, Session record;
- **learner content:** conversation.

Only configured control sources may alter Teacher behavior rules.

Data content must not be allowed to override control instructions merely because text inside a Sheet says to do so.

This reduces prompt-injection risk from editable data stores.

## SEC-3 — Exact file allowlist should be enforced — P1

Only the configured Project and configured file IDs should be used in production control prompts.

Do not accept an arbitrary Drive/Sheet URL from page content or generated assistant text.

## SEC-4 — Chrome Web Store privacy/permissions work is a release gate — P1

The extension handles learning data and Google authorization, so release work needs:
- accurate privacy disclosure;
- narrow permissions;
- secure token handling;
- Chrome Web Store data-use compliance.

This is release scope, not a new runtime feature.

---

# 9. UX Review

## UX-1 — Processing must lock conflicting actions — P1

During END processing, a learner must not be able to START another lesson or PAUSE the completed lesson.

Side Panel should make the current state obvious and allow only valid actions.

## UX-2 — Recovery behavior should be understandable without technical language — P1

Examples:
- “Resuming your paused lesson”
- “Finishing the previous lesson”
- “Couldn’t save progress — Retry”

Do not expose ANALYZE/UPDATE/Planner jargon in learner-facing UI.

## UX-3 — Internal control traffic should not dominate the learning experience — P2

Because orchestration uses the same chat, control prompts may be visible.

For V1, this is acceptable if needed, but they should be concise and clearly machine-directed. Do not add a complex hidden-processing UI unless testing shows it is necessary.

---

# 10. Maintainer / Release Review

## MAINT-1 — Add an explicit ChatGPT Adapter boundary — P0

All fragile UI automation must be replaceable independently of workflow logic.

Recommended conceptual interface:
- openProject();
- createConversation();
- openConversation(url);
- sendControlMessage();
- waitUntilIdle();
- startVoice();
- stopVoice();
- arm/disarmMask();
- start/stopSupervisorFeed();
- renameConversation();

The exact API names are implementation-plan details.

## MAINT-2 — Capability checks should fail safely — P1

Before performing a workflow step, adapters should be able to detect obvious unsupported/missing UI capability and return a structured failure.

Do not continue clicking when expected semantic UI cannot be found.

## MAINT-3 — Local diagnostics should be content-light — P2

Store:
- phase;
- error code;
- timestamp;
- relevant machine IDs.

Avoid storing full lesson transcripts in diagnostic state.

---

# Cross-role P0 list

The review board considers these blockers to final spec approval:

1. **Choose the canonical Curriculum / Base Lesson source of truth.**
2. **Promote ChatGPT↔Google read/write behavior to a pre-implementation platform gate.**
3. **Define runtime component boundaries inside the Chrome Extension.**
4. **Define minimal first-run setup/configuration gate.**
5. **Resolve Session Brief identity vs future Session identity.**
6. **Define an actually safe Session Brief replacement mechanism.**
7. **Resolve the crash window between chat creation and URL persistence.**
8. **Choose the Extension's Google OAuth strategy.**
9. **Make the MV3 workflow explicitly independent of service-worker lifetime.**
10. **State one-active-session invariant.**
11. **Add crash-window recovery acceptance cases.**
12. **Exclude EnPal control messages from learning evidence/Supervisor input.**
13. **Define trust hierarchy for external instructions/data.**
14. **Add one isolated ChatGPT UI Adapter boundary.**
15. **Decide Supervisor failure policy: block lesson or allow degraded lesson.**

---

# Recommended P1 additions

After the P0 items are resolved, add only lightweight spec language for:

- supported environment;
- full user command model;
- actor/write ownership matrix;
- error/retry semantics;
- permission minimization;
- minimal privacy/data flow;
- exact configured file allowlist;
- test layers;
- processing-state action locking.

---

# Explicitly rejected scope expansion

The board does **not** recommend adding:

- backend/server;
- event sourcing;
- full historical Session Brief archive;
- complex distributed transaction engine;
- telemetry platform;
- elaborate onboarding wizard;
- React/TypeScript rewrite merely for style;
- admin dashboard inside learner runtime;
- automatic migration framework for every legacy schema;
- generalized multi-user architecture.

Those would slow V1 without resolving the real blockers.

---

# Board conclusion

The V1 concept is now coherent enough that the remaining work is **architecture closure**, not product invention.

The spec should be revised one more time around the P0 items above.

The largest unresolved decisions are:

1. where fixed Curriculum/Base Lessons canonically live;
2. how Session Brief is replaced safely;
3. how chat creation becomes recoverable around the URL-persistence gap;
4. whether Supervisor is mandatory for a lesson to begin.

Once these are resolved, the rest can be written as straightforward implementation constraints rather than another large design cycle.
