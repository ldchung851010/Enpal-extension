# EnPal V1 — Production-Like Live E2E Acceptance

**Build / commit under test:**  
**Date:**  
**Chrome profile:**  
**Extension ID:** `lnnnbbkifillljlhcpaekmjaemljlmkd`  
**Configured ChatGPT Project:** `https://chatgpt.com/g/g-p-6aa9f3ea98a481918727756027f94208-test`

> Check a gate only after executing it in the configured production-like Chrome profile. Automated tests and connector-only reads are supporting evidence, not substitutes for this live run.

## Acceptance gates

- [ ] **1. Setup → READY**
  - Result: PASS | FAIL
  - Evidence:
  - Session ID:
  - Chat URL:
  - Relevant Sheet range/marker:
  - Notes:

- [ ] **2. Extension OAuth read/write**
  - Result: PASS | FAIL
  - Evidence:
  - Session ID:
  - Chat URL:
  - Relevant Sheet range/marker:
  - Notes: Prior loaded-extension OAuth R/W evidence exists from 2026-09-20; reconfirm against this integrated build.

- [ ] **3. ChatGPT connected Google read/write without per-lesson approval**
  - Result: PASS | FAIL
  - Evidence:
  - Session ID:
  - Chat URL:
  - Relevant Sheet range/marker:
  - Notes: This is one of the two currently OPEN target-Project gates.

- [ ] **4. Deterministic Curriculum selection**
  - Result: PASS | FAIL
  - Evidence:
  - Session ID:
  - Chat URL:
  - Relevant Sheet range/marker:
  - Notes:

- [ ] **5. START creates one Session + one authoritative bound chat**
  - Result: PASS | FAIL
  - Evidence:
  - Session ID:
  - Chat URL:
  - Relevant Sheet range/marker:
  - Notes:

- [ ] **6. Protected Listening has no content flash**
  - Result: PASS | FAIL
  - Evidence:
  - Session ID:
  - Chat URL:
  - Relevant Sheet range/marker:
  - Notes: Earlier Listening Mask spike passed; reconfirm no protected content appears before mask protection.

- [ ] **7. PAUSE writes semantic checkpoint**
  - Result: PASS | FAIL
  - Evidence:
  - Session ID:
  - Chat URL:
  - Relevant Sheet range/marker:
  - Notes:

- [ ] **8. RESUME reuses exact bound chat**
  - Result: PASS | FAIL
  - Evidence:
  - Session ID:
  - Chat URL:
  - Relevant Sheet range/marker:
  - Notes:

- [ ] **9. Supervisor failure degrades but does not block lesson**
  - Result: PASS | FAIL
  - Evidence:
  - Session ID:
  - Chat URL:
  - Relevant Sheet range/marker:
  - Notes:

- [ ] **10. `ENPAL_CONTROL` excluded from evidence**
  - Result: PASS | FAIL
  - Evidence:
  - Session ID:
  - Chat URL:
  - Relevant Sheet range/marker:
  - Notes:

- [ ] **11. ANALYZE → UPDATE → Planner order verified**
  - Result: PASS | FAIL
  - Evidence:
  - Session ID:
  - Chat URL:
  - Relevant Sheet range/marker:
  - Notes:

- [ ] **12. Session Brief staging + atomic promotion verified**
  - Result: PASS | FAIL
  - Evidence:
  - Session ID:
  - Chat URL:
  - Relevant Sheet range/marker:
  - Notes:

- [ ] **13. Curriculum advances once**
  - Result: PASS | FAIL
  - Evidence:
  - Session ID:
  - Chat URL:
  - Relevant Sheet range/marker:
  - Notes:

- [ ] **14. Each crash-window scenario recovered**
  - Result: PASS | FAIL
  - Evidence:
  - Session ID:
  - Chat URL:
  - Relevant Sheet range/marker:
  - Notes: Exercise all nine approved crash windows; automated Task 14 matrix is supporting evidence only.

- [ ] **15. Rename failure does not block READY**
  - Result: PASS | FAIL
  - Evidence:
  - Session ID:
  - Chat URL:
  - Relevant Sheet range/marker:
  - Notes:

- [ ] **16. No assistant-prose parsing used**
  - Result: PASS | FAIL
  - Evidence:
  - Session ID:
  - Chat URL:
  - Relevant Sheet range/marker:
  - Notes:

## Release decision

- [ ] All 16 live gates are PASS.
- [ ] No FAIL remains unresolved.
- [ ] Evidence is sufficient for independent review.

**Release acceptance:** PASS | FAIL  
**Reviewer:**  
**Notes:**
