# EnPal Speaking Supervisor — Action Rubric V1

**Status:** Approved for V1 speaking-supervisor design  
**Scope:** Speaking only  
**Supervisor model:** GPT-5.6 Sol in ChatGPT Web  
**Purpose:** Calibrate `CONTINUE`, `NUDGE`, and `CORRECT_COURSE` for live speaking supervision.

---

## 1. Core decision model

Supervisor evaluates exactly two dimensions first, then chooses the action level.

1. **Lesson Fidelity** — Is the interaction still materially serving the stated speaking objective and lesson target?
2. **Teaching Quality** — Is the teacher using an effective method to produce meaningful learner speaking practice?

Only after those two judgments should Supervisor choose:

- `CONTINUE`
- `NUDGE`
- `CORRECT_COURSE`

The action is determined by **severity, persistence, and impact**, not merely by the type of imperfection observed.

---

## 2. Lesson Fidelity

### `lesson_fidelity=OK`

Use `OK` when the interaction is still materially serving the speaking objective and target.

This includes cases where:

- the learner is still working toward the lesson objective;
- the activity changes form but continues to serve the same speaking target;
- the learner temporarily goes off-topic but the teacher redirects appropriately;
- brief rapport, clarification, correction, scaffolding, or explanation supports the lesson;
- relevant expansion remains connected to the target;
- the teacher temporarily simplifies or restructures the task to help the learner succeed.

### `lesson_fidelity=DRIFT`

Use `DRIFT` when the teacher materially moves the lesson away from the stated speaking objective or target.

Examples:

- the teacher pursues an unrelated topic instead of returning to the lesson;
- the interaction abandons the intended speaking objective for another activity;
- a technically related topic becomes an extended discussion that no longer serves the speaking target;
- prolonged small talk replaces the lesson;
- the teacher turns the lesson into a different subject, such as travel, Python, EV batteries, or another unrelated explanation.

### Important rule

**Topic similarity alone does not guarantee fidelity.**

For example, a long technical lecture about motors can become lesson drift if the objective is learner speaking practice and the learner is no longer practicing the target language.

---

## 3. Teaching Quality

### `teaching_quality=OK`

Use `OK` when the teacher is producing useful learner speaking practice.

Healthy behaviors include:

- teacher talk is reasonably brief;
- the learner gets meaningful speaking time;
- the teacher elicits before supplying answers;
- scaffolding is used when genuinely needed;
- corrections are selective;
- the learner is allowed to finish before correction;
- difficulty is increased or decreased appropriately;
- target language is recycled purposefully;
- task format can change when useful;
- natural mistakes, hesitation, and learner struggle are tolerated;
- Vietnamese can be used strategically when needed;
- short explanations or modeling return quickly to learner production.

### `teaching_quality=DRIFT`

Use `DRIFT` when the teaching method materially reduces useful learner speaking practice.

Examples:

- excessive explanation or lecture;
- excessive correction of minor errors;
- feeding most or all of the learner's answer;
- repeatedly interrupting before the learner finishes;
- prolonged yes/no or one-word Q&A;
- rote repetition without progression;
- teacher talk becoming substantially more dominant than necessary;
- unnecessary Vietnamese replacing learner English production;
- repeatedly preventing independent learner production.

---

## 4. Raw transcript noise rule

The Supervisor receives raw live-speech transcript data.

It may contain:

- fillers;
- false starts;
- repetitions;
- duplicated fragments;
- partial utterances;
- interruptions;
- transcription mistakes;
- Vietnamese-English code-switching;
- technical audio interruptions;
- several fragments that together form one conversational idea.

These artifacts are **not teaching problems by themselves**.

Supervisor must interpret them in conversational context.

Do not assign `NUDGE` or `CORRECT_COURSE` merely because the transcript is messy.

Semantic noise should be understood by the Supervisor rather than filtered by extension rules.

Transport errors such as duplicate delivery, lost sequence, or dropped messages remain an extension-level responsibility.

---

## 5. `CONTINUE`

Use:

```text
ACTION=CONTINUE
```

when the lesson is functioning acceptably and no intervention is currently needed.

Normally:

```text
lesson_fidelity=OK
teaching_quality=OK
```

### `CONTINUE` includes

Natural live-conversation imperfections such as:

- learner hesitation;
- fillers;
- false starts;
- duplicated transcript fragments;
- learner temporarily speaking Vietnamese;
- learner forgetting vocabulary;
- teacher misunderstanding the learner once and recovering;
- temporary audio problems;
- brief small talk;
- learner initiating an off-topic comment when the teacher redirects;
- short explanations needed to unblock the learner;
- selective correction;
- additional scaffolding for a struggling learner;
- simplifying the task when the learner becomes frustrated;
- changing from drill to role-play while preserving the objective;
- relevant expansion within the topic;
- one minor teaching mistake that the teacher immediately self-corrects.

### Core rule

> **Do not intervene for isolated imperfections when the lesson is still progressing productively.**

### Typical output

```text
SUPERVISOR_DECISION
action=CONTINUE
lesson_fidelity=OK
teaching_quality=OK
instruction=NONE
END_SUPERVISOR_DECISION
```

---

## 6. `NUDGE`

Use:

```text
action=NUDGE
```

when the lesson is still fundamentally on course, but a **mild or emerging teaching-quality problem** should be corrected before it becomes significant.

Normally:

```text
lesson_fidelity=OK
teaching_quality=DRIFT
```

A `NUDGE` is appropriate when:

- the problem is localized rather than systemic;
- learner speaking practice is still happening;
- the target has not been abandoned;
- one small adjustment can restore good teaching;
- the teacher has begun an undesirable pattern but it has not yet materially taken over the interaction.

### Typical `NUDGE` situations

- correcting too many minor errors;
- focusing too much on form instead of fluency;
- an explanation beginning to become too long;
- slightly excessive prompting;
- unnecessary repetition beginning to appear;
- teacher talk becoming somewhat dominant;
- correction frequency increasing enough to disrupt flow while the learner still gets meaningful practice.

### Core rule

> **NUDGE means: the direction is still basically right; adjust the teaching method now.**

### Typical output

```text
SUPERVISOR_DECISION
action=NUDGE
lesson_fidelity=OK
teaching_quality=DRIFT
instruction=Correct less often and prioritize fluent connected speaking.
END_SUPERVISOR_DECISION
```

---

## 7. `CORRECT_COURSE`

Use:

```text
action=CORRECT_COURSE
```

when a material problem is already affecting the lesson and the teacher should change behavior immediately.

There are two main routes.

### Route A — Lesson Fidelity Drift

If:

```text
lesson_fidelity=DRIFT
```

then normally:

```text
action=CORRECT_COURSE
```

Examples:

- extended travel discussion;
- Python lesson;
- extended EV/battery discussion;
- prolonged unrelated small talk;
- extended technical explanation that abandons the speaking objective.

Typical output:

```text
SUPERVISOR_DECISION
action=CORRECT_COURSE
lesson_fidelity=DRIFT
teaching_quality=DRIFT
instruction=Return to the target speaking task.
END_SUPERVISOR_DECISION
```

### Route B — Severe or sustained Teaching Quality Drift

Lesson content may still be correct:

```text
lesson_fidelity=OK
```

but the teaching method materially breaks the intended speaking practice:

```text
teaching_quality=DRIFT
```

Use `CORRECT_COURSE` when the pattern is sustained, repeated, or materially deprives the learner of independent speaking.

Examples:

- extended lecture;
- long chains of yes/no questions;
- teacher feeds nearly every sentence;
- teacher repeatedly interrupts before the learner finishes;
- repeated rote drilling after mastery;
- prolonged excessive correction;
- teacher effectively speaks for the learner.

### Core rule

> **CORRECT_COURSE means: the current interaction pattern itself needs to change now, not merely be fine-tuned.**

Typical output:

```text
SUPERVISOR_DECISION
action=CORRECT_COURSE
lesson_fidelity=OK
teaching_quality=DRIFT
instruction=Stop feeding answers and let the learner produce the response independently.
END_SUPERVISOR_DECISION
```

---

## 8. `NUDGE` vs `CORRECT_COURSE`

This is the primary calibration question:

> **Can the lesson remain essentially as it is with one small teaching adjustment?**

If **YES** → `NUDGE`.

If **NO**, and the current pattern needs to be stopped or materially changed → `CORRECT_COURSE`.

### Mental model

**NUDGE** means:

> Keep going, but adjust this.

Examples:

- correct less often;
- shorten the explanation;
- elicit a little more;
- give the learner more space.

**CORRECT_COURSE** means:

> Stop this pattern and return to the intended lesson behavior.

Examples:

- stop lecturing;
- stop the yes/no chain;
- stop feeding answers;
- stop interrupting;
- stop unrelated discussion;
- return to learner speaking practice.

---

## 9. Persistence and severity

Do not classify based only on the existence of an imperfect teacher move.

Consider:

- duration;
- repetition;
- effect on learner speaking;
- whether the teacher self-corrects;
- whether the lesson naturally recovers;
- whether the target is still being practiced.

One imperfect turn does not normally constitute drift.

A repeated pattern that materially changes the interaction can constitute drift.

---

## 10. Learner-caused drift

Do not blame the teacher merely because the learner introduces unrelated content.

If the learner goes off-topic and the teacher briefly acknowledges it and redirects:

```text
lesson_fidelity=OK
teaching_quality=OK
action=CONTINUE
```

If the teacher follows the learner into an extended unrelated discussion:

```text
lesson_fidelity=DRIFT
action=CORRECT_COURSE
```

Evaluate **teacher handling**, not merely the topics appearing in the transcript.

---

## 11. Adaptive teaching

The following are not teaching drift when context justifies them:

- more scaffolding for a stuck learner;
- easier tasks for a frustrated learner;
- strategic Vietnamese;
- short modeling;
- short explanation;
- brief pronunciation or vocabulary clarification;
- changing activity format;
- temporarily slowing down;
- asking the learner to repeat when repetition has a clear purpose.

Evaluate whether the intervention helps return the learner to productive speaking.

---

## 12. Decision matrix

| Lesson Fidelity | Teaching Quality | Situation | Action |
|---|---|---|---|
| OK | OK | Productive lesson | `CONTINUE` |
| OK | DRIFT | Mild/localized emerging problem | `NUDGE` |
| OK | DRIFT | Sustained/material teaching failure | `CORRECT_COURSE` |
| DRIFT | OK or DRIFT | Lesson materially off objective | `CORRECT_COURSE` |

---

## 13. Escalation rule

When evidence is ambiguous, do not overreact.

Prefer `CONTINUE` over `NUDGE` when the issue is isolated and the lesson naturally recovers.

Prefer `NUDGE` over `CORRECT_COURSE` when one small adjustment is sufficient.

Use `CORRECT_COURSE` only when there is clear evidence of material lesson drift or a sustained teaching-quality problem.

If a previously identified NUDGE-level problem continues repeatedly despite intervention, escalation to `CORRECT_COURSE` is appropriate.

---

## 14. Instruction-writing rule

For `CONTINUE`:

```text
instruction=NONE
```

For `NUDGE`:

- give one small adjustment;
- preserve the current lesson direction;
- do not redesign the lesson;
- keep the instruction short and directly actionable.

For `CORRECT_COURSE`:

- state the behavior to stop or change;
- state the immediate direction to return to;
- keep the instruction short enough to act on immediately.

---

## 15. Output contract

Supervisor must return only:

```text
SUPERVISOR_DECISION
action=CONTINUE | NUDGE | CORRECT_COURSE
lesson_fidelity=OK | DRIFT
teaching_quality=OK | DRIFT
instruction=NONE or one short imperative
END_SUPERVISOR_DECISION
```

No explanation should be included outside this block in production use.

---

## 16. Validation basis

This rubric was derived from the EnPal Speaking Supervisor evaluation set executed manually with GPT-5.6 Sol in ChatGPT Web.

The evaluation covered, among other cases:

- natural filler, false starts, repetition, partial messages, and Vietnamese-English code-switching;
- technical interruption and messy transcript fragments;
- learner frustration and adaptive scaffolding;
- learner-caused off-topic turns with correct teacher redirection;
- brief versus extended small talk;
- lecture-heavy teaching;
- overcorrection versus selective correction;
- teacher-dominated yes/no Q&A;
- rote repetition without progression;
- teacher feeding answers;
- frequent interruption of the learner;
- strategic versus excessive Vietnamese;
- task-format change while preserving the same objective;
- teacher self-correction after a minor teaching mistake;
- relevant expansion within the motor-testing topic;
- material lesson drift to unrelated subjects;
- extremely noisy transcript with duplicate and partial utterances.

Observed result: GPT-5.6 Sol consistently distinguished natural conversational noise from material lesson or teaching-quality problems. The main calibration issue observed was action severity: without explicit severity guidance, the model sometimes selected `CORRECT_COURSE` where a milder `NUDGE` was intended. Sections 8, 9, and 13 define the V1 calibration intended to address that behavior.

---

## 17. V1 invariant

The extension should not attempt semantic filtering of natural conversation noise before sending transcript evidence to the Supervisor.

The Supervisor is responsible for interpreting conversational context.

The extension remains responsible for transport correctness only, including:

- preserving sequence;
- preventing retry-induced duplicate delivery;
- avoiding message loss;
- maintaining reliable transcript delivery.

---

## 18. Short-form operational definition

**CONTINUE** = no intervention needed.  
**NUDGE** = the lesson is still on course; make one small teaching adjustment.  
**CORRECT_COURSE** = stop or materially change the current pattern and return the lesson to the intended objective or teaching behavior immediately.
