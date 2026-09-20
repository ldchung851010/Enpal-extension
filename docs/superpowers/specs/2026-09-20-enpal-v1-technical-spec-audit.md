# EnPal V1 Technical Spec — Adversarial Audit

**Date:** 2026-09-20  
**Spec reviewed:** `docs/superpowers/specs/2026-09-20-enpal-v1-technical-spec.md`  
**Review mode:** multi-perspective adversarial review against current runtime contracts and project artifacts.

## Panel

1. Systems Architecture Reviewer
2. Reliability / Recovery Reviewer
3. Data Contract Reviewer
4. Learning-System Reviewer
5. Browser Automation Reviewer
6. V1 Scope / YAGNI Reviewer

## Overall verdict

**NOT READY FOR APPROVAL YET.**

The architecture direction is coherent and substantially cleaner than V1.1, but several runtime ownership and contract boundaries are still ambiguous or inconsistent with the approved artifacts.

The panel recommends fixing the blockers below without expanding V1 scope.

---

## Blockers

### B1 — PAUSE assigns semantic checkpoint creation to the wrong component

Current spec says the Extension "creates/persists a Pause Checkpoint".

But the checkpoint contains semantic learning state:

- what was covered;
- what remains;
- what is unfinished;
- where teaching should continue.

The Extension is explicitly a thin orchestrator and must not reason over the lesson. It also must not scrape the conversation to infer this state.

**Required correction:** ChatGPT creates the checkpoint in the current lesson conversation and writes it directly to the active Session record. The Extension only triggers PAUSE, verifies the durable checkpoint/write, and records local recovery state.

---

### B2 — ANALYZE durability boundary is underspecified

The approved ANALYZE Skill produces structured evidence but does not itself update Review Ledger.

The Technical Spec says END advances only after a durable ANALYZE result has committed, but it never defines who persists that result.

Without a durable ANALYZE checkpoint, a crash between ANALYZE and UPDATE can force ambiguous replay.

**Required correction:** the END workflow must persist the ANALYZE result to the active Session record, or use an equivalent durable completion marker, before UPDATE is allowed to advance. ChatGPT performs the write; Extension verifies it. Exact fields remain an implementation detail.

---

### B3 — Review Planner input in the spec conflicts with the approved Review Planner Skill

Current Technical Spec says Review Planner takes:

- next fixed curriculum lesson;
- current Review Ledger;
- relevant completed-session context.

Approved Review Planner Skill explicitly says it uses only:

1. Base Lesson Brief
2. Review Ledger V1

and does not require Lesson Analysis.

**Required correction:** remove completed-session context from Planner input. Session evidence reaches Planner indirectly through the verified UPDATE to Review Ledger.

---

### B4 — Listening Mask is activated too late in START

Current START order:

1. send links/read instruction;
2. wait for ChatGPT idle;
3. activate Supervisor;
4. apply Listening Mask;
5. start Voice.

For a protected Listening lesson, ChatGPT may render or summarize protected listening material while processing the pre-Voice control message. That can expose content before the mask is applied.

This contradicts the already verified preemptive-mask behavior.

**Required correction:** when the Session Brief indicates protected Listening content, arm the mask **before sending any control message that could cause protected content to render**. Keep Voice controls usable.

---

## Important issues

### I1 — Session Brief needs a stable identity

The Session Brief Sheet contains only one current/ready lesson, which is acceptable for V1.

However it still needs enough identity to prove which session/lesson the brief belongs to. Otherwise START and recovery cannot reliably verify that the Sheet and active Session refer to the same lesson.

**Correction:** require Session Brief identity linkage to the intended session/base lesson. Do not freeze exact column names yet.

---

### I2 — Actor responsible for writing the next Session Brief is ambiguous

The spec says Review Planner produces the personalized review layer and END prepares the next Session Brief, but does not say who writes the Sheet.

Because assistant output must not be parsed by the Extension, the simple V1 ownership is:

**ChatGPT prepares and writes the Session Brief directly; Extension verifies readiness.**

This should be explicit.

---

### I3 — Confirmed START/RESUME reading rule is weakened in the written spec

The design discussion explicitly chose separate links for the required materials and to re-read them on resume.

The written spec currently says only the Session Brief is mandatory and other teaching/reference documents "may" be included.

That weakens an approved decision.

**Correction:** START and RESUME should explicitly provide:

- Teacher Role;
- the correct Teaching Method for the Primary Skill;
- current Session Brief;
- on resume, the Pause Checkpoint source/instruction.

Then wait for ChatGPT idle before Voice.

---

### I4 — Supervisor execution boundary is incomplete

The Supervisor contract is clear about decisions but the Technical Spec does not yet explain the minimum runtime boundary:

- what context is loaded when Supervisor starts;
- how it receives realtime conversation;
- how its NUDGE/CORRECT_COURSE instruction reaches the Teacher.

This is not a field-level detail; without the handoff there is no implementable Supervisor lifecycle.

**Correction:** define only the minimal interface:
Supervisor receives current Lesson Brief + Teaching Method + realtime conversation feed and can deliver one instruction to the active Teacher conversation. Do not specify transport details yet.

---

### I5 — Canonical Session Brief model and current Planner artifact are not yet aligned

The spec introduces a broader conceptual Session Brief including lesson flow, while the current Review Planner output contract is based on its existing `LESSON_BRIEF` fields.

The spec correctly says there must be one canonical logical lesson model, but the current artifact still needs to be updated to conform to that model before implementation.

**Correction:** mark START/PAUSE/END/Planner contract alignment as a pre-implementation documentation task, not a runtime feature.

---

### I6 — Legacy EnPal Database currently contradicts the new authority model

The existing database still contains legacy areas such as general Learner state, Target Bank, current curriculum position, and old Next Session data.

The Technical Spec says these are no longer authoritative, but implementation could accidentally reuse them.

**Correction:** explicitly state that legacy tabs/fields are ignored by V1 unless migrated into the new contracts. Cleanup can happen later, but authority must be unambiguous before coding.

---

## Accepted trade-offs / not blockers

### T1 — ChatGPT idle is only a readiness heuristic

Idle does not prove the linked file was successfully read. However the design explicitly chose this simple V1 behavior.

Keep it, but the setup/E2E acceptance test must prove the configured ChatGPT Project can actually access the required files.

### T2 — Session Brief does not retain history

This reduces auditability, but it was an explicit V1 choice. Session history remains in Sessions. Do not add historical Session Brief storage now.

### T3 — Cross-Sheet writes are not atomic

END writes across Sessions, Review Ledger, and Session Brief. Full distributed transactions are unnecessary for V1.

The current recovery/idempotency model is sufficient if each phase has a durable verified boundary.

### T4 — Processing veil can wait

Hiding administrative END processing is useful UX but is not required to validate the architecture. Keep it out of the core spec unless testing shows it is needed.

### T5 — Do not add event sourcing

A full event journal / replay architecture would solve some recovery problems but is disproportionate for V1.

---

## What the panel considers strong

- Clear separation: ChatGPT = teaching/reasoning, Extension = orchestration.
- Google Sheets as durable truth and local storage as recovery journal.
- Fixed curriculum separated from review personalization.
- One session = one exact ChatGPT conversation.
- Session Brief separated from history.
- Pause resumes the same chat instead of creating a new session.
- END prepares the next lesson before returning READY.
- Supervisor is constrained from changing curriculum.
- Rename is correctly non-critical.
- Explicit no-scrape rule.
- Project Control correctly excluded from runtime.
- Spec avoids premature field-level design.

---

## Recommended correction set

Fix only these architecture-level items before approval:

1. ChatGPT owns semantic Pause Checkpoint creation/write; Extension verifies.
2. Define durable ANALYZE completion before UPDATE.
3. Align Review Planner inputs with its approved two-input contract.
4. Move Listening Mask earlier for protected lessons.
5. Give Session Brief stable session/lesson identity.
6. Make ChatGPT the writer of prepared Session Brief; Extension verifies.
7. Restore mandatory START/RESUME reading of Teacher Role + correct Teaching Method + Session Brief; checkpoint on resume.
8. Define minimal Supervisor input/output delivery boundary.
9. Declare legacy Database areas non-authoritative.
10. Align separate Skill artifacts to the canonical Session Brief model before implementation.

After those corrections, the panel expects the spec to be suitable for user approval and then implementation planning.
