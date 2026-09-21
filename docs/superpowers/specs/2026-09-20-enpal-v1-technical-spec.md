# EnPal Extension V1 — Technical Spec

**Status:** APPROVED  
**Date:** 2026-09-20  
**Revision:** Approved after multi-role architecture closure  
**Authority:** This document is the approved canonical runtime architecture for EnPal Extension V1.  
**Project Control:** Project management / Project Control is outside EnPal learner runtime.

---

## 0. Purpose and V1 Boundary

EnPal V1 is a desktop Chrome Extension that orchestrates English Speaking and Listening lessons through ChatGPT Web.

The design is intentionally narrow:

- ChatGPT Web = teacher + reasoning engine.
- Chrome Extension = orchestration + deterministic verification.
- Google Sheets = durable runtime learning state.
- Core curriculum = fixed and deterministic.
- Personalization = primarily the review layer.
- One learning session = one active ChatGPT conversation.
- No EnPal backend.
- No Observer LLM service.
- No parsing/scraping ChatGPT assistant prose as machine output.

V1 supports **desktop Chrome + ChatGPT Web + configured Google Workspace files**. Mobile/iPhone/iPad runtime is outside V1.

The normal learner command model is:

```text
START
PAUSE
END
```

A retry/recover action may appear only when the system is in a recoverable error state. The learner never manually invokes ANALYZE, UPDATE, Review Planner, or other internal phases.

Detailed teaching prompts, rubrics, and skill-specific rules remain separate versioned artifacts.

### Runtime contracts outside this file

- START Skill
- PAUSE Skill
- END Skill
- ANALYZE Skill
- UPDATE Skill
- Review Planner Skill
- Supervisor Rubric
- Teacher Role Instructions
- Speaking Teaching Method
- Listening Teaching Method

This spec is authoritative for how those artifacts interact.

Before implementation planning is executable, those artifacts must be aligned to the contracts in this spec.

---

# 1. Architecture

## 1.1 Responsibility split

### ChatGPT Web — teacher and semantic reasoning

ChatGPT is responsible for:

- teaching the current lesson;
- following Teacher Role + the correct Teaching Method;
- interpreting the current Session Brief;
- creating semantic Pause Checkpoints;
- analyzing a completed lesson;
- producing the durable ANALYZE result;
- applying UPDATE to Review Ledger;
- applying Review Planner to the next Base Lesson + current Review Ledger;
- preparing and writing the next Session Brief staging content.

ChatGPT-visible prose is never treated by the Extension as a machine transaction result.

### Chrome Extension — orchestrator and verifier

The Extension is responsible for:

- lifecycle/state orchestration;
- exact Project/chat navigation;
- creating/resuming the correct conversation;
- sending control instructions and approved links;
- preemptive Listening Mask;
- Voice START/STOP;
- starting/stopping Supervisor;
- reading/writing deterministic Google Sheet state;
- verifying durable commit markers;
- Session Brief promotion;
- crash recovery;
- best-effort chat rename.

The Extension must not infer semantic learner state from the conversation.

### Google Sheets — durable runtime truth

Google Sheets stores all authoritative runtime learning state.

If local Extension state conflicts with committed Sheet state, Sheet state wins.

### Google Drive / static reference documents

Google Drive may hold static instruction documents such as Teacher Role or Teaching Methods.

It is **not** used as a second runtime state store.

### ChatGPT Project

All learning conversations live inside one configured ChatGPT Project.

Machine identity uses:

```text
session_id + exact chat_url
```

Chat title is human metadata only.

---

## 1.2 Runtime component boundaries

V1 uses these conceptual components:

### Workflow Orchestrator

Owns the deterministic state machine and decides the next legal phase.

It contains no ChatGPT DOM selectors and no semantic learning logic.

### ChatGPT Adapter

The only component allowed to know ChatGPT Web UI details.

It owns:

- Project navigation;
- new-chat creation;
- exact-chat opening;
- semantic control-message injection;
- idle detection;
- Voice UI control;
- rename behavior;
- realtime conversation feed hooks.

Changes to ChatGPT DOM/UI should normally require changes only inside this adapter layer.

### Google Sheets Client

Owns:

- Extension OAuth access to Google Sheets;
- exact configured spreadsheet IDs;
- bounded reads;
- deterministic writes;
- commit verification;
- Session Brief atomic promotion.

### Recovery Journal

Uses `chrome.storage.local`.

Stores workflow intent and recoverable machine state, not authoritative learning truth.

### Supervisor Controller

Owns Supervisor lifecycle, realtime feed filtering, decision delivery, and degraded-mode status.

### Listening Mask Controller

Owns preemptive masking and restoration without embedding mask behavior throughout the workflow engine.

### Side Panel UI

Shows learner-facing state and legal actions only.

---

## 1.3 Manifest V3 execution rule

Manifest V3 service workers are treated as ephemeral.

Correctness must never depend on:

- one long-running in-memory service-worker function;
- a long timer;
- a service worker remaining alive throughout a lesson or END pipeline.

Every critical transition must be reconstructable from:

```text
durable Sheet state
+
chrome.storage.local recovery journal
```

The workflow may pause when no extension context is alive, but reopening EnPal must deterministically resume from the first incomplete safe phase.

---

## 1.4 Pre-implementation platform gates

Before the full workflow engine is implemented, the target production environment must prove:

1. ChatGPT Project can open/read every configured instruction/data file needed by START/RESUME.
2. ChatGPT can perform the required writes to the configured Google Sheets from the target Project.
3. Those routine EnPal writes do not require a manual approval dialog on every lesson transaction.
4. Extension OAuth can read/write the configured Google Sheets.
5. Voice START/STOP and Listening Mask work in the same supported Chrome/ChatGPT environment.

If any gate fails, the architecture must be revisited. V1 must not fall back to scraping assistant output.

---

## 1.5 Explicit V1 non-goals

V1 does not include:

- backend/server;
- event sourcing;
- distributed transaction engine;
- generalized multi-user architecture;
- historical Session Brief archive;
- telemetry platform;
- automatic external podcast/YouTube ingestion;
- complex onboarding wizard;
- admin dashboard in learner runtime;
- dynamic rewriting of core curriculum;
- Project Control in learner runtime.

---

# 2. Data and Authority

## 2.1 Curriculum Sheet — canonical curriculum source

V1 uses **one dedicated Google Sheet as the canonical curriculum source**.

It is configured by exact spreadsheet ID.

Each Base Lesson is one curriculum record with stable identity such as:

- `curriculum_version`;
- `curriculum_sequence`;
- `lesson_id`;
- canonical lesson fields required by the shared logical lesson model.

Exact columns are an implementation-plan detail.

The Curriculum Sheet is fixed/read-mostly during normal learning.

The Extension determines the next Base Lesson from:

```text
fixed curriculum sequence
+
durable completed Sessions
```

The next Base Lesson is never selected freely by ChatGPT.

Legacy Base Lesson JSON files on Drive are migration/reference artifacts only and are not authoritative once V1 is implemented.

All runtime curriculum access uses the exact configured Curriculum Sheet ID. Runtime discovery by filename/title is forbidden.

---

## 2.2 EnPal Database — Sessions and operational history

The EnPal Database is the durable operational Google Sheet.

A Session record must represent enough information for:

- stable `session_id`;
- bound curriculum identity;
- lifecycle state;
- exact `chat_url` once bound;
- completed lesson result;
- Pause Checkpoint when applicable;
- durable ANALYZE result/completion;
- pipeline recovery markers;
- idempotency.

Exact columns are not frozen by this spec.

### One-active-session invariant

At most one Session may be non-terminal for normal learner operation.

Equivalent active lifecycle states may include:

```text
STARTING
IN_PROGRESS
PAUSED
PROCESSING
```

If durable data contains more than one active Session, EnPal enters a consistency error and does not guess which one to use.

### Pause Checkpoint

Pause Checkpoint is semantic learning state describing:

- what was covered;
- what is unfinished;
- what remains;
- where teaching should continue.

ChatGPT creates and writes the checkpoint to the active Session.

The Extension only triggers and verifies that write.

### Legacy data authority

Legacy generalized Learner state, Target Bank, deprecated preparation areas, and old curriculum-position fields are non-authoritative unless explicitly migrated into this V1 contract.

---

## 2.3 Session Brief Sheet

Session Brief is a separate Google Sheet and contains only the lesson currently ready/in progress.

It is not a historical store.

### Identity

A Session Brief is identified by curriculum identity, not by a future Session ID:

```text
curriculum_version
+ curriculum_sequence
+ lesson_id
```

The next Session Brief is created before the next `session_id` exists.

At START, the new Session is created and bound to the verified ACTIVE Session Brief identity.

### Canonical content

The Brief uses the canonical logical lesson model and conceptually includes:

- Primary Skill;
- Communicative Goal;
- Focus;
- Situation/context;
- Target Performance;
- Completion Criteria;
- Mask Policy;
- lesson-flow information where required;
- separate Review Focus with stable Review Item IDs.

Primary Skill, Communicative Goal, Focus, Completion Criteria, and Mask Policy are fixed core curriculum fields. Review Planner may only add Review Focus and minimally adjust Situation and Target Performance when needed for a natural review opportunity.

Focus and Completion Criteria are stored as JSON arrays. Review Focus is always a JSON array; an empty array `[]` means no selected review item.

The Review layer must remain distinguishable from fixed core learning.

### ACTIVE + _STAGING

The Session Brief Sheet has two functional areas/tabs:

```text
ACTIVE
_STAGING
```

`ACTIVE` is the only brief used by START/RESUME.

`_STAGING` is temporary construction space and is not lesson history.

During END:

1. ChatGPT writes the complete next brief to `_STAGING`.
2. Extension verifies every required key, curriculum identity, ready marker, JSON-array fields, Primary Skill enum, and Mask Policy enum.
3. Extension promotes `_STAGING` to `ACTIVE` using one atomic Google Sheets batch update.
4. The same promotion clears/resets staging.
5. If promotion fails, the previous ACTIVE brief remains authoritative.

This preserves the invariant that a partially written new brief never destroys the current valid brief.

During PAUSE, ACTIVE remains unchanged.

---

## 2.4 Review Ledger

Review Ledger is the sole long-term personalization/review state.

Review Planner reads it only after UPDATE has durably completed and been verified.

V1 does not maintain a parallel generalized Target Bank.

---

## 2.5 Local recovery journal

`chrome.storage.local` may contain:

- app/workflow state;
- current phase;
- active `session_id`;
- bound/pending `chat_url`;
- pending ChatGPT `tab_id`;
- pending operation;
- machine error code.

It is not authoritative learning state.

Authentication tokens must not be stored as ordinary recovery-journal values.

---

# 3. Setup and Authentication

## 3.1 App setup state

Before READY, EnPal may be in:

```text
SETUP_REQUIRED
```

Setup must establish:

- ChatGPT Project ID/URL;
- Curriculum Sheet ID;
- EnPal Database ID;
- Session Brief Sheet ID;
- Review Ledger ID;
- Teacher Role URL;
- Speaking Teaching Method URL;
- Listening Teaching Method URL;
- Extension Google authorization;
- verified ChatGPT Google access/write capability;
- first ACTIVE Session Brief.

After successful setup/bootstrap:

```text
SETUP_REQUIRED → READY
```

A complex onboarding wizard is not required.

---

## 3.2 Extension Google OAuth

The Extension uses Chrome Identity OAuth for Google Sheets access.

V1 architecture assumes:

- `chrome.identity.getAuthToken()`;
- an explicit `oauth2` client/scopes configuration in `manifest.json`;
- Sheets scopes limited to what V1 actually needs;
- interactive authorization initiated by an explained user action during setup;
- normal runtime token retrieval is non-interactive;
- tokens rely on the Identity API token cache rather than being copied into `chrome.storage.local`.

The Extension does not require Google Drive API access merely to read Teacher Role/Teaching Method documents; ChatGPT reads those configured reference links.

---

## 3.3 Exact-source allowlist and trust hierarchy

Production configuration is an allowlist of exact Project/file IDs or URLs.

EnPal must not accept an arbitrary Drive/Sheet link from:

- assistant output;
- page content;
- learner text;
- retrieved learning data.

Trust order:

1. **Control sources** — approved Teacher Role, Teaching Method, Skill/control instructions.
2. **Learning-data sources** — Curriculum, Session Brief, Review Ledger, Session records.
3. **Conversation content** — learner/teacher interaction.

Learning-data text is treated as data and may not override higher-priority control instructions.

---

# 4. START

START automatically chooses between recovery, resume, and a new session.

Priority:

1. incomplete recoverable pipeline;
2. existing PAUSED session;
3. new ACTIVE Session Brief.

---

## 4.1 Required teaching context

Before Voice begins, the Extension sends separate approved links/instructions for:

- Teacher Role;
- correct Teaching Method for Primary Skill;
- ACTIVE Session Brief.

On RESUME it additionally instructs ChatGPT to read the Pause Checkpoint from the active Session record.

The Extension waits for ChatGPT to become idle; it does not parse the assistant prose.

Idle is only a V1 readiness heuristic. Actual file accessibility is proven by setup/E2E gates.

---

## 4.2 New session flow

For a new session:

1. Verify there is no other active Session.
2. Read and verify ACTIVE Session Brief identity.
3. Determine that this Brief is the deterministic next curriculum lesson.
4. Create one Session stub with stable `session_id`, bound lesson identity, and status `STARTING`.
5. Record pending start state in the local journal.
6. Open the configured ChatGPT Project in an EnPal-owned tab and record its `tab_id`.
7. Create a new conversation.
8. For protected Listening, arm the Listening Mask before any control message can expose protected content.
9. Send required teaching-context links/instructions.
10. Capture exact conversation URL.
11. Persist `session_id + chat_url` durably and verify.
12. Mark the Session `IN_PROGRESS`.
13. Start Supervisor; failure follows the degraded-mode policy in Section 7.
14. Start Voice.
15. App state becomes LEARNING.

START does not run Review Planner.

---

## 4.3 Chat-creation crash recovery

V1 guarantees **one authoritative active chat binding**, not literal exactly-once physical chat creation on the external ChatGPT website.

### Before durable chat_url binding

If EnPal restarts while a Session is `STARTING` and has no committed `chat_url`:

1. Read the local pending `tab_id`.
2. If that EnPal-owned tab still exists and the ChatGPT Adapter can safely confirm it is the pending Project conversation, capture and persist its URL.
3. Otherwise, do not guess.
4. Create a replacement conversation using the **same `session_id` and same lesson identity**.
5. Bind only the first safely verified conversation URL to the Session.

An earlier unbound conversation may remain as an orphan ChatGPT chat.

That orphan is not an EnPal Session and must never advance curriculum or receive END processing.

### After durable chat_url binding

Once the Session has a verified `chat_url`, all retries/resumes reuse that exact URL and must not create another conversation.

The V1 invariant is therefore:

```text
one logical Session
→ one authoritative bound chat_url
```

rather than an unimplementable promise that no orphan external chat can ever exist.

---

## 4.4 Resume after PAUSE

RESUME:

1. Opens exact saved `chat_url`.
2. Verifies URL matches active Session.
3. Verifies ACTIVE Session Brief identity matches the Session's bound lesson.
4. Re-arms Listening Mask before control messages when required.
5. Sends Teacher Role + correct Teaching Method + ACTIVE Session Brief.
6. Sends checkpoint read/restore instruction.
7. Waits for ChatGPT idle.
8. Starts Supervisor if available.
9. Starts Voice.
10. Marks Session IN_PROGRESS / app LEARNING.

No new chat is created.

---

# 5. PAUSE

PAUSE:

1. Verifies active `session_id + chat_url`.
2. Stops Voice.
3. Stops Supervisor.
4. Keeps Listening Mask protection where required.
5. Sends PAUSE control to the same conversation.
6. ChatGPT creates and writes semantic Pause Checkpoint to the active Session.
7. Extension verifies checkpoint + PAUSED durable state.
8. ACTIVE Session Brief remains unchanged.
9. Local journal records recoverable state.

PAUSE does not:

- analyze final performance;
- update Review Ledger;
- advance curriculum;
- create a new Session;
- replace Session Brief;
- rename chat.

If checkpoint persistence cannot be verified, EnPal enters recoverable ERROR rather than claiming a safe pause.

---

# 6. END

END performs post-learning work in the same bound ChatGPT conversation.

Canonical order:

```text
END
→ stop Voice
→ stop Supervisor
→ ANALYZE
→ persist + verify ANALYZE
→ UPDATE Review Ledger
→ verify UPDATE
→ determine next Base Lesson
→ Review Planner
→ write next Brief to _STAGING
→ verify staging
→ atomically promote to ACTIVE
→ mark current Session COMPLETED
→ best-effort rename
→ READY
```

Each phase has an independently verifiable durable boundary.

---

## 6.1 ANALYZE

ANALYZE evaluates only pedagogical lesson evidence.

ChatGPT writes the required ANALYZE result/completion to the active Session record.

Extension verifies the durable boundary before UPDATE.

---

## 6.2 UPDATE

UPDATE consumes verified ANALYZE evidence and applies the approved Review Ledger transition rules.

Review Planner must not run until Review Ledger writes are verified.

---

## 6.3 Review Planner

Review Planner takes only:

1. the deterministic next Base Lesson from Curriculum Sheet;
2. the current verified Review Ledger.

Completed-session evidence reaches Planner indirectly through UPDATE.

Planner may add Review Focus and minimally adjust Situation/Target Performance, but it may not change Primary Skill, Communicative Goal, Focus, Completion Criteria, or Mask Policy.

---

## 6.4 Session Brief creation

ChatGPT writes the next complete brief to `_STAGING`.

Extension validates all required keys, machine-checkable field types/enums, ready marker, and identity; it does not parse assistant prose or perform semantic lesson design.

After verification, Extension atomically promotes staging to ACTIVE.

Only then may the current Session become COMPLETED.

---

## 6.5 Rename

Rename is:

- after core completion;
- best effort;
- rate-limit aware;
- non-blocking.

Rename failure never changes learning state back to ERROR.

---

# 7. Supervisor

Supervisor is a **quality guardrail**, not a correctness-critical dependency.

Lifecycle:

```text
START / RESUME → attempt Supervisor ON
PAUSE / END    → Supervisor OFF
```

Supervisor receives:

- ACTIVE Session Brief;
- correct Teaching Method;
- filtered realtime conversation feed.

It may return:

- `CONTINUE`;
- `NUDGE`;
- `CORRECT_COURSE`.

NUDGE/CORRECT_COURSE carries one short actionable instruction to the active Teacher conversation.

Supervisor may not:

- change Base Lesson;
- change Communicative Goal;
- advance curriculum;
- mutate durable learning state.

## 7.1 Supervisor failure policy — fail open

If Supervisor cannot initialize or fails mid-lesson:

- lesson may continue;
- Teacher Role + Teaching Method + Session Brief remain authoritative;
- Voice is not stopped solely because Supervisor failed;
- no fake Supervisor decision is generated;
- Supervisor status is recorded as degraded/unavailable;
- END/ANALYZE still runs normally.

Supervisor is retried only through normal lifecycle opportunities such as RESUME/new START; V1 requires no complex self-healing loop.

---

# 8. Listening Mask

For a lesson that requires protected Listening:

- mask must be armed **before** any control message that could render protected content;
- mask remains effective during the protected learning interval;
- PAUSE must not expose protected content;
- controls needed to operate Voice/EnPal remain usable;
- failure to arm required mask is fail-closed.

Listening Mask behavior is isolated in its controller/adapter rather than mixed into lesson reasoning.

---

# 9. Control-Message and Evidence Boundary

The same ChatGPT conversation contains both learning interaction and EnPal control traffic.

Therefore every EnPal-generated administrative message must carry a reserved internal classification such as:

```text
ENPAL_CONTROL
```

with a control type/session identity in its envelope.

Examples include:

- START/RESUME setup instructions;
- PAUSE command;
- Supervisor instruction;
- END/ANALYZE/UPDATE/Planner commands.

These messages are:

- not learner evidence;
- not teacher-performance evidence by themselves;
- excluded from Supervisor pedagogical feed;
- excluded from ANALYZE evidence.

Teacher/learner turns resulting from real lesson interaction remain pedagogical evidence.

The exact wire syntax is defined in the control-message contract, but classification must be deterministic and must not rely on natural-language guessing.

---

# 10. Recovery and Failure Policy

Central rule:

> Local state records what EnPal was trying to do. Google Sheets records what durably happened.

On restart/reopen:

1. read local recovery journal;
2. read relevant durable Sheets;
3. validate one-active-session invariant;
4. reconcile by Session identity and phase;
5. continue from the first incomplete safe phase.

Committed phases are never repeated merely because local state is stale.

---

## 10.1 Required durable boundaries

Recovery must distinguish at least:

- Session stub created;
- authoritative chat URL bound;
- PAUSE checkpoint committed;
- ANALYZE committed;
- UPDATE committed;
- Session Brief staging verified/promoted;
- Session COMPLETED.

Exact field/marker names are implementation details.

---

## 10.2 Fail-closed vs fail-open

### Fail closed

Do not start/continue the affected phase when:

- required Sheet/reference source cannot be accessed;
- required durable write cannot be verified;
- active chat identity is wrong/unknown;
- multiple active Sessions exist;
- required Listening Mask cannot be armed;
- Session Brief identity does not match expected curriculum/session binding;
- required setup/platform capability is missing.

### Fail open

The core lesson/session may continue when:

- Supervisor fails;
- chat rename fails.

---

## 10.3 UI/Voice failure

Voice start failure:

- keep the same Session/chat binding;
- do not create another chat;
- expose retry.

Voice stop failure:

- do not begin ANALYZE until stopped state is confirmed.

If the ChatGPT Adapter cannot find the required semantic UI, it returns a structured failure and does not continue clicking blindly.

---

# 11. App States and Learner UX

Learner-facing app states:

```text
SETUP_REQUIRED
READY
LEARNING
PAUSED
PROCESSING
ERROR
```

PROCESSING locks conflicting learner actions.

During PROCESSING the learner cannot START another lesson or PAUSE the finished lesson.

Learner-facing errors use simple language, for example:

- “Couldn’t save progress — Retry”
- “Finishing your previous lesson”
- “Resuming your paused lesson”

Internal terms such as ANALYZE, UPDATE, Review Planner, pipeline phase, or OAuth error codes need not be exposed to the learner.

---

# 12. Security, Privacy, and Permissions

## 12.1 Data flow

V1 has no EnPal backend.

Full learning conversation remains in ChatGPT.

Google Sheets may store:

- Session metadata/status;
- learning summary/evidence required by contracts;
- Pause Checkpoint;
- Review Ledger;
- Session Brief;
- fixed Curriculum.

Diagnostic/recovery state should store machine metadata, not full transcripts.

---

## 12.2 Permission minimization

Request only permissions/hosts required by implemented V1 behavior.

The existing `debugger` permission may remain only if the verified trusted Voice-control mechanism still requires it.

If retained:

- isolate it behind Voice/ChatGPT Adapter behavior;
- attach only to the exact active ChatGPT tab when required;
- detach immediately after the trusted activation sequence;
- do not use it as a general scraping/inspection mechanism.

Remove unnecessary Google host permissions before release.

---

## 12.3 No arbitrary external control

Only configured allowlisted control/data sources may be sent as authoritative EnPal links.

Assistant-generated URLs are never promoted into trusted configuration automatically.

---

# 13. Testing and Acceptance

V1 needs three test layers:

1. **Unit tests** — workflow transitions, recovery decisions, identity rules.
2. **Adapter/contract tests with fakes** — Sheets, ChatGPT Adapter, mask, Supervisor controller.
3. **Live E2E smoke tests** — actual target ChatGPT Web + Google environment.

The current extension shell tests are not sufficient for V1 acceptance.

---

## 13.1 Mandatory crash-window matrix

Verify deterministic recovery after interruption at least at:

1. Session stub created, before chat creation.
2. Chat created, before `chat_url` persisted.
3. `chat_url` persisted, before Voice starts.
4. Pause Checkpoint committed, before PAUSE returns.
5. ANALYZE committed, before UPDATE.
6. UPDATE committed, before Review Planner.
7. `_STAGING` written/verified, before ACTIVE promotion.
8. ACTIVE promoted, before current Session COMPLETED.
9. Session COMPLETED, before rename.

The expected result is no duplicate logical Session, no duplicate Review Ledger transition, and no double curriculum advancement.

An unbound orphan external chat is acceptable only for case 2 and must never become an active EnPal Session automatically.

---

## 13.2 V1 end-to-end acceptance gate

V1 is complete only when the production-like environment demonstrates:

1. Setup reaches READY using exact configured sources.
2. Extension OAuth reads/writes all required Sheets.
3. ChatGPT reads required reference files and performs required durable writes in the target Project without per-lesson manual approval.
4. Curriculum selection is deterministic from Curriculum Sheet + completed Sessions.
5. New START creates one Session and one authoritative bound chat.
6. Protected Listening never flashes protected content before mask protection.
7. PAUSE durably writes a usable semantic checkpoint.
8. RESUME uses the exact bound chat and continues from checkpoint.
9. Supervisor failure does not block a valid lesson.
10. ENPAL_CONTROL messages do not contaminate Supervisor/ANALYZE evidence.
11. ANALYZE → UPDATE → Review Planner ordering is durable and recoverable.
12. New Session Brief is staged, verified, and atomically promoted without corrupting ACTIVE.
13. Curriculum advances exactly once per completed Session.
14. Restart/reload at every crash-window case recovers deterministically.
15. Rename failure does not block READY.
16. No production workflow depends on parsing ChatGPT assistant prose.

---

# 14. Pre-Implementation Contract Alignment

Before implementation begins, update the separate runtime artifacts so they agree with this spec:

- START: Curriculum/Brief identity, mandatory read set, preemptive mask, chat-binding rule.
- PAUSE: ChatGPT semantic checkpoint write; Extension verify.
- END: durable ANALYZE/UPDATE/Planner/staging/promotion order.
- Review Planner: exactly Base Lesson + verified Review Ledger as inputs.
- ANALYZE: ignore ENPAL_CONTROL traffic and use only lesson evidence.
- Supervisor: ignore ENPAL_CONTROL traffic and support degraded mode.
- Session Brief contract: canonical lesson model + stable Review Item IDs.
- Runtime configuration: exact allowlisted IDs/URLs.
- Legacy Drive Base Lesson JSON / Target Bank / deprecated preparation assumptions: non-authoritative.

This alignment is documentation/contract work, not a new runtime subsystem.

---

# 15. Canonical V1 Invariants

Implementation choices should preserve these invariants:

1. ChatGPT = semantic teaching/reasoning.
2. Extension = deterministic orchestration/verification.
3. Sheets = durable runtime truth.
4. Local storage = recovery journal.
5. Curriculum Sheet = canonical fixed Base Lesson source.
6. One active logical Session at a time.
7. One Session = one authoritative bound `chat_url`.
8. External orphan chat may exist only when chat creation crashed before durable binding.
9. Session Brief ACTIVE contains only the current/ready lesson.
10. `_STAGING` is temporary, not history.
11. Session Brief identity is curriculum identity; Session ID is bound at START.
12. Review Ledger is the only long-term review personalization state.
13. Review Planner cannot change the core curriculum lesson.
14. Required Listening Mask failure is fail-closed.
15. Supervisor failure is fail-open.
16. Rename failure is fail-open.
17. Control messages are classified and excluded from pedagogical evidence.
18. Runtime sources are exact allowlisted IDs/URLs.
19. No core correctness dependency on MV3 service-worker lifetime.
20. No assistant-output scraping.
21. No additional backend or architectural subsystem without a demonstrated V1 need.

Any future change that breaks these invariants is an architectural change and must update this spec first.
