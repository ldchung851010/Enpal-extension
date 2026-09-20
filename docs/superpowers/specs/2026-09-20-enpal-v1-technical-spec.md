# EnPal Extension V1 — Technical Spec

**Status:** DRAFT FOR REVIEW  
**Date:** 2026-09-20  
**Authority:** This document is the canonical runtime architecture for EnPal Extension V1 once approved.  
**Project Control:** The project-management dashboard / Project Control is explicitly outside EnPal runtime.

---

## 0. Purpose and Scope

EnPal V1 is a Chrome Extension that orchestrates English Speaking and Listening lessons through ChatGPT Web.

The design goal is deliberately narrow:

- ChatGPT Web teaches and reasons.
- The Chrome Extension orchestrates the workflow.
- Google Sheets stores durable learning state.
- The core curriculum is prebuilt and progresses deterministically.
- Personalization is primarily applied through the review layer.
- The system must survive refreshes, extension restarts, and recoverable failures without duplicating sessions or advancing curriculum twice.

V1 does **not** attempt to become an independent tutoring engine.

Detailed prompt text, teaching rubrics, and skill-specific logic live in separately versioned artifacts. This spec defines their contracts, lifecycle, responsibilities, and boundaries.

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

---

# 1. Architecture

## 1.1 Core roles

### ChatGPT Web

ChatGPT Web is the **teacher and reasoning engine**.

It is responsible for:

- teaching the current lesson;
- applying the relevant teaching method;
- interpreting the Session Brief;
- using the Pause Checkpoint when resuming;
- analyzing the completed lesson;
- updating review state through the approved workflow;
- helping prepare the next Session Brief through the Review Planner flow.

ChatGPT visible responses are **not** treated as machine-readable transaction results.

### Chrome Extension

The Extension is the **orchestrator**.

It is responsible for:

- opening the configured ChatGPT Project;
- creating a new conversation when a new session starts;
- reopening the exact conversation when resuming;
- sending the required links and control instructions;
- waiting for ChatGPT to finish reading/processing before Voice starts;
- starting and stopping Voice;
- starting and stopping the Supervisor;
- applying the Listening Mask where required;
- sequencing START, PAUSE, END, ANALYZE, UPDATE and Review Planner;
- verifying durable state before advancing workflow;
- keeping a local recovery journal;
- recovering after refresh/restart;
- attempting chat rename at the end of the pipeline.

The Extension must remain a thin coordinator. It must not become a second tutoring or reasoning engine.

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

Machine identity is based on the session identity and exact conversation URL, not the human-readable chat title.

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
- Project Control as part of the learner runtime.

The Supervisor is a runtime monitoring role governed by its own contract; it is not an independent backend Observer system.

---

# 2. Data

V1 keeps the data model small and assigns one clear responsibility to each store.

## 2.1 EnPal Database

The EnPal Database is the durable operational Google Sheet.

It stores the history and state of learning sessions.

At minimum, a Session record must be able to represent:

- stable session identity;
- curriculum identity;
- session lifecycle state;
- exact ChatGPT conversation URL;
- completed lesson result;
- Pause Checkpoint when applicable;
- enough durable status for recovery and idempotency.

The exact column schema is an implementation detail and is not frozen by this document.

### Pause Checkpoint

A Pause Checkpoint belongs to the current Session record.

It represents:

- what has already been covered;
- what is currently unfinished;
- what remains;
- where teaching should continue.

It exists so resume is pedagogically correct, not merely technically connected to the same chat.

---

## 2.2 Session Brief Sheet

Session Brief is a **separate Google Sheet**.

It contains only the lesson that is currently ready to be learned or, while paused, the lesson currently in progress.

It is **not** a history store.

The Session Brief should be human-readable and ChatGPT-readable, organized as clear sections/key-value content rather than as a large opaque JSON blob.

Conceptually it contains:

- Primary Skill;
- Communicative Goal;
- Situation / context;
- lesson focus;
- target performance;
- lesson flow;
- a separate Review section.

The Review section must remain distinguishable from the fixed core lesson.

### Session Brief lifecycle

Before the first ever START, setup/bootstrap must produce the first ready Session Brief.

During a session and during PAUSE, the current Session Brief remains unchanged.

During END, the next Session Brief is prepared.

The existing Session Brief is replaced only after the new brief is complete and ready. A partial preparation must never destroy the current valid brief.

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

## 3.2 New session

For a new lesson, the Extension:

1. reads the ready Session Brief and required durable state;
2. creates or reserves the durable Session identity;
3. opens the configured ChatGPT Project;
4. creates exactly one new conversation;
5. captures and persists the exact conversation URL;
6. sends the required reference links and a clear instruction telling ChatGPT what to read;
7. waits until ChatGPT has finished processing and is idle;
8. activates the Supervisor;
9. applies the Listening Mask if the lesson requires it;
10. starts Voice;
11. enters the learning state.

The Extension must not start Voice before ChatGPT has finished reading/processing the required material.

START does not run Review Planner. The Session Brief has already been prepared before START.

---

## 3.3 Reference-reading rule

Before Voice starts, ChatGPT must be explicitly instructed to read the current authoritative material required for the session.

At minimum this includes the current Session Brief. Relevant teaching/reference documents may also be included by configured link.

The Extension sends **links plus a precise reading instruction**, rather than only sending an unexplained link.

The Extension does not determine readiness by parsing ChatGPT's prose response. It waits for the ChatGPT interaction to finish and return to idle.

---

## 3.4 Resume after PAUSE

Resume uses the exact saved conversation URL.

The Extension:

1. opens the existing conversation;
2. verifies it is the intended session;
3. sends the current Session Brief link;
4. sends the EnPal Database link/instruction for the Pause Checkpoint of the active session;
5. asks ChatGPT to restore the lesson context and continue from the checkpoint;
6. waits until ChatGPT is idle;
7. reactivates the Supervisor;
8. restores the required Listening Mask state;
9. starts Voice;
10. continues learning in the same conversation.

The Session Brief is not regenerated merely because the learner paused.

---

# 4. PAUSE

PAUSE temporarily stops the current lesson without completing it.

The PAUSE workflow:

1. targets the exact active session and conversation;
2. stops Voice;
3. stops the Supervisor;
4. creates/persists a Pause Checkpoint in the current Session record;
5. keeps the current Session Brief unchanged;
6. marks the session as paused;
7. keeps enough local recovery information to reopen the same session safely.

PAUSE must not:

- complete the session;
- advance curriculum;
- run ANALYZE;
- run UPDATE;
- run Review Planner;
- replace the Session Brief;
- create a new conversation.

For Listening sessions, PAUSE must not accidentally expose content that the learner was intentionally prevented from seeing.

---

# 5. END

END closes the learning session and prepares the next one.

All post-lesson processing runs in the **same ChatGPT conversation** after Voice has stopped.

The canonical V1 pipeline is:

```text
END
→ stop Voice
→ stop Supervisor
→ ANALYZE
→ UPDATE
→ Review Planner
→ prepare next Session Brief
→ make next Session Brief ready
→ complete current Session
→ best-effort rename
→ READY
```

---

## 5.1 ANALYZE

ANALYZE extracts the approved learning evidence and session result from the completed conversation.

Its detailed rubric lives in the ANALYZE Skill artifact.

The Extension does not scrape the visible assistant response for the result.

The workflow advances only when the expected durable result has been committed.

---

## 5.2 UPDATE

UPDATE applies the approved post-session changes, especially Review Ledger transitions.

Review Planner must not run against stale review state.

Therefore UPDATE must finish and its durable state must be verified before Review Planner proceeds.

Its detailed rules live in the UPDATE Skill artifact.

---

## 5.3 Review Planner

Review Planner takes:

- the next fixed curriculum lesson;
- current Review Ledger state;
- the relevant completed-session context.

It selects review material that naturally fits the next lesson.

It does **not** choose a different core curriculum lesson.

It produces the personalized review layer for the next Session Brief.

Its detailed selection rules live in the Review Planner Skill artifact.

---

## 5.4 Preparing the next Session Brief

END prepares the complete next Session Brief before the current session is considered fully closed.

The next brief combines:

- the next fixed base lesson;
- the selected review layer.

The Review content remains a distinct section.

The current valid Session Brief remains intact until the replacement is complete.

Only then is the new Session Brief made ready for the next START.

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

The Supervisor consumes realtime conversation activity and may return only high-level teaching guidance such as:

- `CONTINUE`
- `NUDGE`
- `CORRECT_COURSE`

The exact rubric lives in the Supervisor artifact.

The Supervisor may influence **how the teacher proceeds**, but it may not:

- change the fixed curriculum lesson;
- change the lesson's core communicative goal;
- mark curriculum complete;
- directly mutate durable learning state;
- independently select the next lesson.

Think of the Supervisor as a live teaching guardrail, not a second teacher or curriculum planner.

---

# 7. Curriculum

The core curriculum is prebuilt and stable.

V1 separates **curriculum progression** from **personalization**.

Base Lesson and Review Planner must use one canonical logical lesson model. Their storage representation may differ, but field meaning and lesson semantics must not drift between the fixed curriculum source, Planner input/output, and Session Brief.

## 7.1 Core progression

The Extension determines the next base lesson from:

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

---

## 8.2 Idempotency

Critical workflows must be safe to retry.

At minimum, recovery must prevent:

- duplicate Session records for the same logical session;
- duplicate ChatGPT conversations caused by retrying START;
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
READ REQUIRED LINKS
        ↓
CHATGPT IDLE
        ↓
SUPERVISOR + VOICE
        ↓
LEARN
   ↙         ↘
PAUSE        END
  ↓           ↓
CHECKPOINT   ANALYZE
  ↓           ↓
RESUME       UPDATE
              ↓
        REVIEW PLANNER
              ↓
   PREPARE SESSION BRIEF
              ↓
      SESSION BRIEF READY
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
2. A new START creates one correct Project conversation and starts learning only after ChatGPT has read the required material.
3. PAUSE persists a usable checkpoint and later START resumes the same conversation at the correct learning point.
4. END runs the closed loop through ANALYZE, UPDATE, Review Planner and Session Brief preparation.
5. A newly prepared Session Brief replaces the previous one only when it is complete.
6. Curriculum advances exactly once per completed session.
7. Supervisor is active only during learning and cannot change curriculum.
8. Listening Mask prevents protected listening content from being exposed at the wrong time.
9. Refresh/restart during an in-progress workflow recovers without duplicate session/chat/data advancement.
10. Rename failure does not break completion.
11. No production workflow depends on parsing ChatGPT assistant output text.

---

# 11. Design Principles for Later Implementation

When implementation details are not explicitly fixed by this spec, choose the simplest design that preserves these invariants:

1. one session → one conversation;
2. exact conversation URL → machine resume identity;
3. fixed curriculum → deterministic progression;
4. Session Brief → only the current/next lesson;
5. Pause Checkpoint → stored with the session;
6. Review Ledger → long-term review personalization;
7. Sheets → durable truth;
8. local storage → recovery journal;
9. ChatGPT → teaching/reasoning;
10. Extension → orchestration;
11. no assistant-output scraping;
12. no premature complexity without an observed failure or clear V1 requirement.

Any future change that breaks one of these principles is an architectural change and must update this spec before implementation.
