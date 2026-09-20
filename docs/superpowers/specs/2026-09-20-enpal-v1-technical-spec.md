# EnPal Extension V1 — Technical Spec

**Status:** DRAFT FOR REVIEW  
**Date:** 2026-09-20  
**Revision:** Updated after adversarial architecture audit  
**Authority:** This document is the canonical runtime architecture for EnPal Extension V1 once approved.  
**Project Control:** The project-management dashboard / Project Control is explicitly outside EnPal runtime.

---

## 0. Purpose and Scope

EnPal V1 is a Chrome Extension that orchestrates English Speaking and Listening lessons through ChatGPT Web.

The design goal is deliberately narrow:

- ChatGPT Web teaches, reasons, and produces semantic learning state.
- The Chrome Extension orchestrates the workflow.
- Google Sheets stores durable learning state.
- The core curriculum is prebuilt and progresses deterministically.
- Personalization is primarily applied through the review layer.
- The system must survive refreshes, extension restarts, and recoverable failures without duplicating sessions or advancing curriculum twice.

V1 does **not** attempt to become an independent tutoring engine.

Detailed prompt text, teaching rubrics, and skill-specific rules live in separately versioned artifacts. This spec defines their contracts, lifecycle, responsibilities, and boundaries.

### Runtime contracts outside this file

The following are independent, versioned artifacts:

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

This Technical Spec is authoritative when defining how those artifacts interact.

Before implementation begins, affected Skill artifacts must be aligned to the canonical contracts in this spec, especially START, PAUSE, END, Review Planner, and any artifact that reads or writes the Session Brief.

---

# 1. Architecture

## 1.1 Core roles

### ChatGPT Web

ChatGPT Web is the **teacher and reasoning engine**.

It is responsible for:

- teaching the current lesson;
- applying the relevant Teaching Method;
- interpreting the Session Brief;
- using the Pause Checkpoint when resuming;
- creating semantic Pause Checkpoints;
- analyzing the completed lesson;
- producing and durably storing the ANALYZE result required by the END pipeline;
- updating Review Ledger through the approved UPDATE workflow;
- applying Review Planner to the next Base Lesson and current Review Ledger;
- preparing and writing the next Session Brief.

ChatGPT visible responses are **not** treated as machine-readable transaction results.

Where the workflow requires semantic interpretation of lesson content, that responsibility belongs to ChatGPT rather than the Extension.

### Chrome Extension

The Extension is the **orchestrator**.

It is responsible for:

- opening the configured ChatGPT Project;
- creating a new conversation when a new session starts;
- reopening the exact conversation when resuming;
- sending required links and control instructions;
- arming the Listening Mask before protected content can render;
- waiting for ChatGPT to finish processing before Voice starts;
- starting and stopping Voice;
- starting and stopping the Supervisor;
- sequencing START, PAUSE, END, ANALYZE, UPDATE and Review Planner;
- verifying durable writes before advancing workflow;
- keeping a local recovery journal;
- recovering after refresh/restart;
- attempting chat rename at the end of the pipeline.

The Extension must remain a thin coordinator. It must not infer semantic learning state from the conversation and must not become a second tutoring or reasoning engine.

### Google Sheets

Google Sheets is the **durable source of truth** for runtime learning state.

If local Extension state conflicts with durable Sheet state, the system reconciles against the durable Sheet state.

Local Extension storage may say what the workflow was attempting to do, but durable Sheet state decides what has actually committed.

### Google Drive / reference documents

Google Drive is used for stable reference assets that are naturally document/file based, such as curriculum source files or teaching instruction documents.

Live session state must not be moved back and forth between Drive and Sheets without a clear reason.

The separation is:

- static/reference assets → Drive;
- live/durable learning state → Sheets.

### ChatGPT Project

The configured ChatGPT Project provides the teaching environment and conversational continuity.

One EnPal learning session maps to one ChatGPT conversation.

Machine identity is based on the stable session identity and exact conversation URL, not the human-readable chat title.

---

## 1.2 Verified platform capabilities carried into V1

The following capabilities have already been demonstrated in spikes and are treated as valid architectural inputs:

- create a new conversation inside the configured ChatGPT Project;
- send control text automatically;
- start and stop Voice through semantic/trusted interaction;
- receive conversation activity in realtime for Supervisor use;
- apply a Listening Mask;
- rename a Project conversation;
- operate the existing MV3 Extension shell and Side Panel.

These capabilities still require production integration and regression testing. They are not considered finished production features merely because their feasibility was proven.

---

## 1.3 Explicit V1 non-goals

V1 does not include:

- a separate backend/controller server;
- a separate Observer LLM service;
- DOM scraping of assistant output to obtain structured results;
- coordinate-based UI automation;
- dynamic regeneration of the core curriculum after every session;
- automatic external podcast/YouTube ingestion;
- a large admin/dashboard product inside the learner runtime;
- Project Control as part of the learner runtime;
- event sourcing or a full replay architecture;
- distributed transactions across all Sheets.

The Supervisor is a runtime monitoring role governed by its own contract; it is not an independent backend Observer system.

---

# 2. Data

V1 keeps the data model small and assigns one clear responsibility to each store.

## 2.1 EnPal Database

The EnPal Database is the durable operational Google Sheet.

It stores the history and state of learning sessions.

At minimum, a Session record must be able to represent:

- stable session identity;
- curriculum/base-lesson identity;
- session lifecycle state;
- exact ChatGPT conversation URL;
- completed lesson result;
- Pause Checkpoint when applicable;
- durable ANALYZE completion/result or equivalent verified marker;
- enough durable status for recovery and idempotency.

The exact column schema is an implementation detail and is not frozen by this document.

### Pause Checkpoint

A Pause Checkpoint belongs to the current Session record.

It represents:

- what has already been covered;
- what is currently unfinished;
- what remains;
- where teaching should continue.

The Pause Checkpoint is semantic learning state. ChatGPT creates it from the active lesson conversation and writes it to the current Session record.

The Extension triggers this operation and verifies that the durable write succeeded. It does not derive the checkpoint itself.

### Legacy data authority

The existing EnPal Database may still contain legacy areas such as generalized Learner state, Target Bank, old curriculum-position fields, or other deprecated session-preparation structures.

Those legacy areas are **not authoritative for V1 runtime** unless they are explicitly migrated into the contracts defined by this spec.

Implementation must not silently reuse legacy fields merely because they already exist.

---

## 2.2 Session Brief Sheet

Session Brief is a **separate Google Sheet**.

It contains only the lesson that is currently ready to be learned or, while paused, the lesson currently in progress.

It is **not** a history store.

The Session Brief must contain enough stable identity to prove which intended session/base lesson it belongs to. Exact field names are left to implementation.

The Session Brief should be human-readable and ChatGPT-readable, organized as clear sections/key-value content rather than as a large opaque JSON blob.

Conceptually it contains:

- identity linkage;
- Primary Skill;
- Communicative Goal;
- Situation / context;
- lesson focus;
- target performance;
- lesson flow where applicable;
- a separate Review section.

The Review section must remain distinguishable from the fixed core lesson.

### Session Brief lifecycle

Before the first ever START, setup/bootstrap must produce the first ready Session Brief.

During a session and during PAUSE, the current Session Brief remains unchanged.

During END, ChatGPT prepares and writes the next Session Brief.

The Extension verifies that the new brief is complete, correctly linked to the intended next lesson/session, and ready before workflow advances.

The existing valid Session Brief is replaced only after the new brief is complete and ready. A partial preparation must never destroy the current valid brief.

Old Session Briefs are not retained here; session history belongs in the EnPal Database.

---

## 2.3 Review Ledger

Review Ledger is the long-term personalization state.

It records what needs review and how review evolves over time.

It is the primary persistent state used by Review Planner.

V1 does not maintain a second generalized learner-state/Target-Bank system in parallel.

---

## 2.4 Local Extension storage

`chrome.storage.local` is a **recovery journal**, not a second database.

It may store items such as:

- current workflow state;
- current pipeline phase;
- active session identity;
- active chat URL;
- active tab;
- pending operation;
- last recoverable error.

Local state helps the Extension know what it was attempting.

It does not have authority to declare a durable learning transaction completed if the corresponding Sheet state is not committed.

---

# 3. START

The learner interacts with a single START action.

START has two modes internally:

1. resume a paused session;
2. start a new prepared session.

The learner does not choose between two different buttons.

---

## 3.1 START priority

START follows this priority:

1. if an incomplete processing pipeline requires recovery, recover it first;
2. else if a PAUSED session exists, resume it;
3. else start the ready Session Brief as a new session.

A paused lesson always takes precedence over a future prepared lesson.

---

## 3.2 Required teaching context

Before Voice starts, ChatGPT must read the authoritative material for the lesson.

For both a new START and a RESUME, the Extension provides separate configured links/instructions for:

- Teacher Role Instructions;
- the correct Teaching Method for the Session Brief's Primary Skill;
- the current Session Brief.

For RESUME, it additionally provides the EnPal Database link/instruction needed to read the Pause Checkpoint for the active session.

The Extension sends **links plus precise reading instructions**, not unexplained links.

The Extension does not determine readiness by parsing ChatGPT's prose response. It waits for the ChatGPT interaction to finish and return to idle.

This idle state is a V1 readiness heuristic, not proof by itself that external access succeeded. File accessibility is therefore an explicit setup/E2E acceptance gate.

---

## 3.3 New session

For a new lesson, the Extension:

1. reads the ready Session Brief identity and required durable state;
2. creates or reserves the durable Session identity;
3. verifies that the Session Brief corresponds to the intended base lesson/session;
4. opens the configured ChatGPT Project;
5. creates exactly one new conversation;
6. captures and persists the exact conversation URL;
7. if the Session Brief requires protected Listening behavior, arms the Listening Mask **before** sending any control message that could expose protected content;
8. sends Teacher Role, the correct Teaching Method, Session Brief links, and precise reading instructions;
9. waits until ChatGPT has finished processing and is idle;
10. activates the Supervisor;
11. starts Voice;
12. enters the learning state.

The Extension must not start Voice before ChatGPT has finished reading/processing the required material.

START does not run Review Planner. The Session Brief has already been prepared before START.

---

## 3.4 Resume after PAUSE

Resume uses the exact saved conversation URL.

The Extension:

1. opens the existing conversation;
2. verifies it is the intended session;
3. verifies the current Session Brief identity matches the paused session/base lesson;
4. if protected Listening behavior applies, restores/arms the Listening Mask before sending any control message that could expose protected content;
5. sends Teacher Role Instructions;
6. sends the correct Teaching Method;
7. sends the current Session Brief;
8. sends the EnPal Database link/instruction for the Pause Checkpoint of the active session;
9. asks ChatGPT to restore lesson context and continue from the checkpoint;
10. waits until ChatGPT is idle;
11. reactivates the Supervisor;
12. starts Voice;
13. continues learning in the same conversation.

The Session Brief is not regenerated merely because the learner paused.

---

# 4. PAUSE

PAUSE temporarily stops the current lesson without completing it.

The PAUSE workflow:

1. targets the exact active session and conversation;
2. stops Voice;
3. stops the Supervisor;
4. keeps the Listening Mask protection in place where necessary;
5. sends the PAUSE control instruction to ChatGPT in the same lesson conversation;
6. ChatGPT creates the semantic Pause Checkpoint and writes it to the active Session record;
7. the Extension verifies that the checkpoint and paused durable state were committed;
8. the current Session Brief remains unchanged;
9. the Extension records enough local recovery information to reopen the same session safely.

PAUSE must not:

- complete the session;
- advance curriculum;
- run ANALYZE;
- run UPDATE;
- run Review Planner;
- replace the Session Brief;
- create a new conversation.

If the durable checkpoint cannot be verified, the Extension must not pretend the session is safely paused. Recovery must retry the incomplete PAUSE operation against the same session/chat.

For Listening sessions, PAUSE must not accidentally expose content that the learner was intentionally prevented from seeing.

---

# 5. END

END closes the learning session and prepares the next one.

All post-lesson reasoning runs in the **same ChatGPT conversation** after Voice has stopped.

The canonical V1 pipeline is:

```text
END
→ stop Voice
→ stop Supervisor
→ ANALYZE
→ persist + verify ANALYZE result
→ UPDATE
→ verify Review Ledger update
→ Review Planner
→ prepare + write next Session Brief
→ verify Session Brief ready
→ complete current Session
→ best-effort rename
→ READY
```

Each durable phase is independently verifiable. V1 does not require a distributed transaction across all Sheets.

---

## 5.1 ANALYZE

ANALYZE extracts the approved learning evidence and session result from the completed conversation.

Its detailed rubric lives in the ANALYZE Skill artifact.

The Extension does not scrape the visible assistant response for the result.

After ANALYZE is produced, ChatGPT writes the required ANALYZE result or equivalent durable completion state to the active Session record.

The Extension verifies that durable state before UPDATE is allowed to proceed.

This provides a recovery boundary between ANALYZE and UPDATE.

---

## 5.2 UPDATE

UPDATE applies the approved post-session changes, especially Review Ledger transitions.

UPDATE consumes the verified ANALYZE evidence according to the UPDATE contract.

Review Planner must not run against stale review state.

Therefore UPDATE must finish, write Review Ledger, and have the affected durable state verified before Review Planner proceeds.

Its detailed rules live in the UPDATE Skill artifact.

---

## 5.3 Review Planner

Review Planner takes only:

1. the next fixed Base Lesson Brief;
2. the current verified Review Ledger.

Completed-session evidence reaches Review Planner **indirectly** through the verified UPDATE to Review Ledger.

Review Planner selects review material that naturally fits the next lesson.

It does **not** choose a different core curriculum lesson.

It produces the personalized review layer for the next Session Brief.

Its detailed selection rules live in the Review Planner Skill artifact.

---

## 5.4 Preparing the next Session Brief

END prepares the complete next Session Brief before the current session is considered fully closed.

The next brief combines:

- the next fixed Base Lesson;
- the selected review layer.

The Review content remains a distinct section.

ChatGPT prepares and writes the Session Brief directly to the Session Brief Sheet.

The Extension does not parse ChatGPT output to reconstruct the brief. It verifies the durable Session Brief state instead.

The current valid Session Brief remains intact until the replacement is complete and verified.

Only then is the new Session Brief considered ready for the next START.

---

## 5.5 Completion and rename

The current Session is completed only after the required durable post-session work and next Session Brief preparation have succeeded.

Chat rename happens at the end of the core pipeline.

Rename is:

- human-facing metadata;
- best-effort;
- rate-limit aware;
- non-blocking.

Rename failure must never roll back completed learning data or prevent the app from returning to READY.

Resume/recovery always uses the exact conversation URL, never the title.

---

# 6. Supervisor

The Supervisor exists only while the learner is actively learning.

Lifecycle:

```text
START / RESUME
→ Supervisor ON

PAUSE or END
→ Supervisor OFF
```

At minimum, the Supervisor receives:

- the current Session Brief;
- the correct Teaching Method;
- the realtime conversation feed for the active lesson.

The Supervisor may return only:

- `CONTINUE`;
- `NUDGE`;
- `CORRECT_COURSE`.

For `NUDGE` or `CORRECT_COURSE`, the Supervisor produces one short actionable instruction.

The Extension/runtime delivers that instruction to the active Teacher conversation so ChatGPT can apply it without changing the lesson identity or core objective.

The exact transport mechanism is an implementation detail.

The Supervisor may influence **how the teacher proceeds**, but it may not:

- change the fixed curriculum lesson;
- change the lesson's core Communicative Goal;
- mark curriculum complete;
- directly mutate durable learning state;
- independently select the next lesson.

Think of the Supervisor as a live teaching guardrail, not a second teacher or curriculum planner.

---

# 7. Curriculum

The core curriculum is prebuilt and stable.

V1 separates **curriculum progression** from **personalization**.

Base Lesson, Review Planner, Session Brief, and downstream lesson-analysis contracts must share one canonical logical lesson model. Their storage representation may differ, but field meaning and lesson semantics must not drift between artifacts.

## 7.1 Core progression

The Extension determines the next Base Lesson from:

- the fixed curriculum sequence;
- durable completed-session history.

The next lesson is not chosen freely by ChatGPT.

Progression must be deterministic: recovery or retry must not advance the curriculum twice.

---

## 7.2 Personalization

Personalization is primarily performed through Review Planner.

The next Session Brief therefore has two conceptual layers:

```text
fixed Base Lesson
+
personalized Review section
=
Session Brief
```

The review layer may adapt to learner evidence, but it must not silently replace the main curriculum objective.

---

## 7.3 First lesson bootstrap

Before the learner can use START for the first time, setup/bootstrap must create the first ready Session Brief.

START should not contain special curriculum-planning logic for the first lesson.

---

# 8. Recovery and Reliability

EnPal V1 must be recoverable without creating duplicate learning state.

The central rule is:

> Local state records what EnPal was trying to do. Google Sheets records what durably happened.

---

## 8.1 Recovery after restart or refresh

On Extension restart/reopen:

1. read the local recovery journal;
2. read the relevant durable Sheet state;
3. reconcile by session identity and workflow phase;
4. continue from the first safe incomplete phase.

A phase already durably committed must not be repeated merely because local state is stale.

A locally marked phase must not be treated as completed if the durable state does not confirm it.

Recovery must recognize durable boundaries for at least:

- chat/session identity persistence;
- PAUSE checkpoint persistence;
- ANALYZE persistence;
- UPDATE/Review Ledger persistence;
- Session Brief readiness;
- current-session completion.

Exact marker names are implementation details.

---

## 8.2 Idempotency

Critical workflows must be safe to retry.

At minimum, recovery must prevent:

- duplicate Session records for the same logical session;
- duplicate ChatGPT conversations caused by retrying START;
- duplicate Pause Checkpoints being treated as new sessions;
- duplicate ANALYZE application;
- duplicate Review Ledger transitions;
- duplicate curriculum advancement;
- accidental replacement of a valid Session Brief with an incomplete one.

Exact markers and field names are implementation details to be defined in the workflow contracts and implementation plan.

---

## 8.3 Active-conversation safety

PAUSE and END must operate only on the saved active session and exact conversation URL.

If the user happens to be viewing another ChatGPT conversation, EnPal must not pause, end, or analyze that unrelated conversation.

---

## 8.4 ChatGPT UI / Voice failure

A failure to start Voice must not create a second session or second conversation.

A failure to stop Voice must block post-session analysis until Voice is confirmed stopped.

UI automation should use semantic elements and verified state rather than screen coordinates.

---

## 8.5 Sheet / connected-app failure

If required durable data cannot be confirmed:

- preserve recoverable workflow state;
- do not advance the curriculum;
- do not mark the session fully completed;
- do not destroy the current valid Session Brief;
- allow safe retry/recovery.

Visible ChatGPT prose alone is never proof that a durable write succeeded.

---

# 9. Canonical V1 Runtime Flow

The complete intended loop is:

```text
READY SESSION BRIEF
        ↓
START
        ↓
ARM MASK IF REQUIRED
        ↓
READ TEACHER ROLE + METHOD + SESSION BRIEF
        ↓
CHATGPT IDLE
        ↓
SUPERVISOR + VOICE
        ↓
LEARN
   ↙                 ↘
PAUSE                END
  ↓                   ↓
CHATGPT CHECKPOINT   ANALYZE
  ↓                   ↓
VERIFY              PERSIST + VERIFY
  ↓                   ↓
RESUME               UPDATE
                      ↓
                    VERIFY
                      ↓
               REVIEW PLANNER
                      ↓
            WRITE SESSION BRIEF
                      ↓
                    VERIFY
                      ↓
                  COMPLETE
                      ↓
                    READY
```

The canonical chat lifecycle is:

```text
new session
→ one new chat inside EnPal Project
→ persist exact chat URL
→ learn
→ optional PAUSE / resume same chat
→ END in same chat
→ best-effort rename
→ retain chat as learning history
```

---

# 10. V1 Acceptance Gate

V1 is not considered complete merely because individual components work.

The minimum end-to-end proof must demonstrate:

1. The configured ChatGPT Project can access the exact required Google Sheets/reference files and perform required durable writes without a manual approval step on every session. If this gate fails, the architecture must be revisited rather than replaced with assistant-output scraping.
2. A new START creates one correct Project conversation and starts learning only after ChatGPT has read Teacher Role, the correct Teaching Method, and the current Session Brief.
3. For protected Listening lessons, the Listening Mask is already active before any control message can expose protected material.
4. PAUSE causes ChatGPT to create and durably write a usable checkpoint; later START resumes the same conversation at the correct learning point.
5. ANALYZE is durably committed and verified before UPDATE.
6. UPDATE writes and verifies Review Ledger before Review Planner runs.
7. Review Planner consumes only the next Base Lesson Brief and current verified Review Ledger.
8. ChatGPT writes the next Session Brief directly; the Extension verifies readiness without parsing assistant prose.
9. A newly prepared Session Brief replaces the previous one only when complete and correctly linked to the intended next lesson/session.
10. Curriculum advances exactly once per completed session.
11. Supervisor is active only during learning, receives the required runtime context, and cannot change curriculum.
12. Refresh/restart during an in-progress workflow recovers from the first incomplete durable phase without duplicate session/chat/data advancement.
13. Rename failure does not break completion.
14. No production workflow depends on parsing ChatGPT assistant output text.
15. Legacy EnPal Database structures that are outside this spec do not influence V1 runtime behavior.

---

# 11. Pre-Implementation Contract Alignment

Before implementation planning is considered executable, the separately versioned runtime artifacts must be checked against this spec.

At minimum:

- START must reflect the mandatory reading set and preemptive Listening Mask rule.
- PAUSE must make ChatGPT responsible for semantic checkpoint creation/write and the Extension responsible for verification.
- END must reflect the durable ANALYZE boundary and verified phase ordering.
- Review Planner must retain its approved two-input contract: Base Lesson Brief + Review Ledger.
- Session Brief consumers/producers must use the same canonical logical lesson model.
- Deprecated PREPARE / Target Bank assumptions must not leak back into V1 runtime contracts.

This is documentation/contract alignment, not a new runtime subsystem.

---

# 12. Design Principles for Later Implementation

When implementation details are not explicitly fixed by this spec, choose the simplest design that preserves these invariants:

1. one session → one conversation;
2. exact conversation URL → machine resume identity;
3. fixed curriculum → deterministic progression;
4. Session Brief → only the current/next lesson;
5. Session Brief → stable identity linkage to its intended session/base lesson;
6. Pause Checkpoint → semantic state created by ChatGPT and stored with the session;
7. ANALYZE → durable verified boundary before UPDATE;
8. Review Ledger → long-term review personalization;
9. Review Planner → Base Lesson Brief + verified Review Ledger only;
10. Sheets → durable truth;
11. local storage → recovery journal;
12. ChatGPT → teaching/reasoning and semantic writes;
13. Extension → orchestration and verification;
14. Listening protection → armed before protected content can render;
15. Supervisor → teaching guardrail, not curriculum authority;
16. no assistant-output scraping;
17. no premature complexity without an observed failure or clear V1 requirement.

Any future change that breaks one of these principles is an architectural change and must update this spec before implementation.
