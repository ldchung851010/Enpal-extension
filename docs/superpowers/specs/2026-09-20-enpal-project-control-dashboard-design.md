# EnPal Project Control Dashboard V1 — Design Spec

**Status:** APPROVED  
**Date:** 2026-09-20  
**Scope:** Project-management dashboard only. This is outside EnPal learner runtime.

## 1. Goal

Build one browser-based HTML dashboard that shows the real implementation progress of EnPal V1 and updates automatically as the repository advances.

The dashboard must not become a second project database.

GitHub repository content is the source of truth.

## 2. Source of Truth

The dashboard reads directly from the EnPal GitHub repository:

- Approved Technical Spec
- Approved Vietnamese Technical Spec
- Implementation Plan V1
- Git commit history
- Audit / closure documents

The Implementation Plan checklist is the primary progress source.

When an implementation step is completed, the same implementation commit must also change its plan checkbox from:

```markdown
- [ ] Step
```

to:

```markdown
- [x] Step
```

The dashboard does not store a separate completion state.

## 3. Progress Model

Overall progress is calculated from Implementation Plan checkboxes:

```text
completed checklist items / total checklist items × 100
```

Task status is derived per `### Task N` section:

- `NOT STARTED` — no checklist item completed
- `IN PROGRESS` — some checklist items completed
- `DONE` — all checklist items completed
- `BLOCKED` — a machine-readable blocked marker exists inside that task section

V1 blocked marker:

```markdown
<!-- ENPAL_BLOCKED: reason -->
```

No separate status file is required.

## 4. Dashboard Sections

### Overview

Show:

- EnPal V1 project name
- overall progress percentage
- completed / total checklist items
- completed / 16 implementation tasks
- current active task
- latest repository commit
- last successful refresh

### Implementation Tasks

Show all 16 tasks from the approved Implementation Plan with:

- task number
- task title
- status
- completed steps / total steps
- progress percentage

### Platform / Pre-Execution Gates

Read the Pre-Execution Gates section from the Implementation Plan.

Display each gate and whether its checkbox is complete.

Before implementation execution begins, the plan must convert these gates to Markdown checkboxes so their completion is machine-readable.

### Technical Governance

Show:

- Technical Spec — APPROVED
- Vietnamese Spec — ĐÃ DUYỆT
- Implementation Plan — current document status
- links to multi-role audit and audit closure

The dashboard only displays these statuses from source documents. It does not edit them.

### Recent Activity

Fetch recent commits from:

```text
ldchung851010/Enpal-extension
```

Show:

- commit message
- short SHA
- timestamp
- link to commit

### Risks / Blockers

Show tasks containing:

```text
<!-- ENPAL_BLOCKED: reason -->
```

If no markers exist, display “No active blockers recorded.”

### Tests / Acceptance

Derive test progress from Task 14–16 checklist completion:

- Crash Recovery Matrix
- Live E2E Acceptance
- Release / Permission Audit

Do not claim a test passed based only on the existence of a test file.

## 5. Automatic Refresh

The dashboard automatically re-fetches repository sources while open.

V1 behavior:

- implementation plan/spec sources: refresh every 60 seconds
- GitHub commit activity: refresh every 5 minutes
- manual “Refresh now” button

A new GitHub commit containing plan checkbox updates therefore changes dashboard progress without editing the HTML.

## 6. GitHub Access

Dashboard V1 assumes the repository content needed for Project Control is publicly readable.

Use:

- `raw.githubusercontent.com` for Markdown source files
- GitHub public REST API for recent commits

No GitHub token is stored in the HTML.

If the repository becomes private later, authenticated access is a future architecture change.

## 7. Hosting

The dashboard lives inside the same repository:

```text
docs/project-control/
├── index.html
├── dashboard.css
└── dashboard.js
```

Preferred hosting is GitHub Pages.

The dashboard must also work when served from a simple local HTTP server for development/testing.

Direct `file://` execution is not guaranteed because browser fetch/CORS behavior varies.

## 8. UI Principles

V1 is a read-only project dashboard.

It should be:

- easy to scan
- usable on desktop and tablet
- visually clear about DONE / IN PROGRESS / BLOCKED / NOT STARTED
- Vietnamese-first for labels
- technical names preserved where useful
- no editing controls
- no login
- no admin workflow

The dashboard is not a kanban tool.

## 9. Failure Behavior

If GitHub cannot be reached:

- keep the last successfully rendered state in memory for the current page session
- show “Không thể cập nhật dữ liệu mới”
- show the last successful refresh time
- do not invent or reset progress to zero

If a source document cannot be parsed:

- identify the affected section
- display that section as unavailable
- continue rendering unaffected sections

## 10. Parser Contract

The dashboard parser depends only on stable Markdown structures already under project control:

### Task heading

```markdown
### Task 9: Implement START and RESUME Workflow
```

### Checklist

```markdown
- [ ] incomplete
- [x] complete
```

### Blocker marker

```markdown
<!-- ENPAL_BLOCKED: reason -->
```

### Document status

```markdown
**Status:** APPROVED
```

or Vietnamese:

```markdown
**Trạng thái:** ĐÃ DUYỆT
```

Changes to these machine-readable conventions must update the dashboard parser tests.

## 11. Testing

Automated tests must cover:

1. Parse all 16 Implementation Plan tasks.
2. Calculate overall checkbox progress correctly.
3. Derive NOT STARTED / IN PROGRESS / DONE.
4. Detect ENPAL_BLOCKED marker and reason.
5. Parse approved English and Vietnamese spec status.
6. Recover gracefully from one failed source fetch.
7. Ignore Markdown checkboxes outside the implementation task/gate areas when calculating implementation progress.
8. Render recent commits from mocked GitHub API data.

No live GitHub request is required for unit tests.

## 12. Relationship to EnPal Runtime

This dashboard:

- is outside EnPal learner runtime
- cannot change Session state
- cannot change Curriculum
- cannot write Review Ledger
- cannot control ChatGPT
- cannot affect START / PAUSE / END
- cannot be a runtime dependency

EnPal runtime must work normally even if the Project Control dashboard is unavailable.

## 13. V1 Non-Goals

Do not add:

- backend
- database
- GitHub authentication
- editing project state in the dashboard
- Google Sheets project-control sync
- issue tracker
- notifications
- user accounts
- charts that require a charting framework
- project-control state duplicated in localStorage

## 14. Definition of Done

Project Control Dashboard V1 is done when:

1. Opening the hosted dashboard shows current repository-derived progress.
2. Marking an Implementation Plan checkbox complete and committing it changes dashboard progress automatically on refresh.
3. All 16 tasks are displayed and derived from the plan, not hard-coded status.
4. Approved spec status is read from the source documents.
5. Recent commits are shown from GitHub.
6. Blocker markers are rendered.
7. Temporary GitHub/network failure does not erase the displayed project state.
8. Dashboard contains no runtime dependency or second project-state database.
