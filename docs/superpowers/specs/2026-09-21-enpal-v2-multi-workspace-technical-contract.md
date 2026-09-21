# EnPal V2 — Multi-Workspace Rebuild Technical Contract

**Status:** APPROVED FOR REBUILD  
**Date:** 2026-09-21  
**Authority:** Canonical contract for the rebuild branch. The prior V1 spec remains historical context; when the two conflict, this document wins on this branch.

## 1. Goal

Rebuild EnPal from the first implementation task while preserving the approved lesson lifecycle:

```text
SETUP → START / RESUME → LEARNING → PAUSE or END
END → ANALYZE → UPDATE → REVIEW PLANNER → BRIEF PROMOTION → READY
```

The rebuild adds **multi-workspace as a foundational runtime concept**, not as a later UI feature.

## 2. Workspace Boundary

A Workspace is an isolated learner runtime boundary with an immutable local `workspace_id`.

Each Workspace owns its own:

- display name;
- ChatGPT Project URL;
- Curriculum Sheet;
- EnPal Database Sheet;
- Session Brief Sheet;
- Session Brief ACTIVE sheet ID;
- Session Brief _STAGING sheet ID;
- Review Ledger Sheet;
- Teacher Role reference;
- Speaking Method reference;
- Listening Method reference;
- recovery journal namespace;
- platform-verification marker.

Google OAuth authorization is extension/account level and may be shared. Learning state is never shared.

Machine identity is:

```text
workspace_id + session_id + exact chat_url
```

Chat title is metadata only.

## 3. Workspace Isolation Invariants

1. A Workspace may not reuse another Workspace's ChatGPT Project URL.
2. A Workspace may not reuse another Workspace's Curriculum, Database, Session Brief, or Review Ledger spreadsheet.
3. Static Teacher Role / Method references may be shared deliberately.
4. At most one non-terminal Session exists **per Workspace**.
5. A PAUSED Session in Workspace A does not block normal work in Workspace B.
6. Workspace switching is blocked while the current Workspace is LEARNING or PROCESSING.
7. A PAUSED or recoverable ERROR Workspace may be left, but its runtime identity may not be edited or deleted until its non-terminal Session is resolved.
8. Switching Workspace changes only the active selector. It must not advance, reset, migrate, or mutate another Workspace's learning state.
9. Recovery and platform-gate storage are namespaced by `workspace_id`.
10. Every workflow/repository operation receives an explicit Workspace context. No implicit default Workspace may be used after bootstrap.

## 4. Draft and Ready Configuration

A Workspace can be saved as `DRAFT` with only:

- `workspace_id`;
- name;
- valid ChatGPT Project URL.

A DRAFT Workspace cannot START, RESUME, PAUSE, END, recover, or fall back to another Workspace's sources.

A Workspace becomes runtime-ready only when all required source IDs/URLs and both Session Brief sheet IDs are present and valid. Runtime readiness is configuration readiness only; Setup still has to verify OAuth, Sheets and platform gates before learner state becomes READY.

A ChatGPT conversation URL under a Project may be entered during setup but is normalized to the Project root before storage.

## 5. Session and Concurrency Model

The session lifecycle remains:

```text
STARTING
IN_PROGRESS
PAUSED
PROCESSING
COMPLETED
ERROR
```

Non-terminal session states are:

```text
STARTING
IN_PROGRESS
PAUSED
PROCESSING
```

The one-active-session invariant is evaluated per Workspace. EnPal never chooses heuristically between two non-terminal Sessions in the same Workspace.

Interactive browser ownership is singular: the selected Workspace controls the EnPal-owned ChatGPT tab/Voice lifecycle. Switching is therefore blocked during LEARNING and PROCESSING.

## 6. Local Storage Namespaces

Registry keys:

```text
enpalWorkspaces
enpalActiveWorkspaceId
```

Per-Workspace keys:

```text
enpalWorkspace:<workspace_id>:recovery
enpalWorkspace:<workspace_id>:platformGate
```

Authentication tokens are never copied into these values.

## 7. Source Trust and Project Binding

All runtime sources use exact configured IDs/URLs.

A START-created conversation must be verified as belonging to the configured Project of the active Workspace before `chat_url` is durably bound.

No workflow may:

- discover a Workspace source by title;
- use a source from another Workspace;
- accept a runtime source from assistant output;
- parse assistant prose as a machine transaction result.

## 8. Failure Policies

Unchanged core policies:

- Listening Mask required failure: fail closed.
- Supervisor failure: fail open into DEGRADED.
- Rename failure: fail open.
- Two non-terminal Sessions inside one Workspace: consistency ERROR for that Workspace.
- Cross-Workspace source conflict: configuration ERROR before runtime.
- DRAFT Workspace runtime action: fail closed with WORKSPACE_NOT_READY.

## 9. Rebuild Definition of Done

A task is not DONE merely because code exists.

Each task must record the evidence appropriate to its layer:

- pure contract/unit task: focused automated tests;
- integration task: focused integration tests plus regression suite;
- browser/ChatGPT task: automated tests plus live browser acceptance;
- release task: all Workspace isolation, crash recovery and multi-workspace live scenarios pass.

Final release additionally requires two independently configured Workspaces proving:

1. independent setup state;
2. independent Session/Brief/Ledger/Curriculum state;
3. independent recovery journals;
4. safe switching from READY and PAUSED;
5. blocked switching from LEARNING/PROCESSING;
6. no cross-workspace sheet or chat mutation;
7. exact bound-chat resume in each Workspace.
