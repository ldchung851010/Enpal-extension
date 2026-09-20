import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  parseImplementationPlan,
  parseDocumentStatus
} from '../../docs/project-control/parser.js';

const plan = `
# Example
- [x] Checkbox outside tracked areas

## Pre-Execution Gates
- [x] Gate A
- [ ] Gate B

## File Structure
- [x] Also outside tracked areas

### Task 1: First Task
- [x] Step 1
- [ ] Step 2

### Task 2: Second Task
<!-- ENPAL_BLOCKED: Waiting for access -->
- [ ] Step 1

## Definition of Done
- [x] Checkbox outside the final task
`;

test('parses gates, tasks, progress, and blockers', () => {
  const result = parseImplementationPlan(plan);

  assert.equal(result.gates.total, 2);
  assert.equal(result.gates.completed, 1);
  assert.deepEqual(result.gates.items, [
    { label: 'Gate A', completed: true },
    { label: 'Gate B', completed: false }
  ]);
  assert.equal(result.tasks.length, 2);

  assert.deepEqual(result.tasks[0], {
    number: 1,
    title: 'First Task',
    completed: 1,
    total: 2,
    percent: 50,
    status: 'IN PROGRESS',
    blocker: null
  });

  assert.equal(result.tasks[1].status, 'BLOCKED');
  assert.equal(result.tasks[1].blocker, 'Waiting for access');
  assert.equal(result.implementation.completed, 1);
  assert.equal(result.implementation.total, 3);
  assert.equal(result.implementation.percent, 33);
});

test('parses approved English and Vietnamese statuses', () => {
  assert.equal(
    parseDocumentStatus('**Status:** APPROVED', 'en'),
    'APPROVED'
  );
  assert.equal(
    parseDocumentStatus('**Trạng thái:** ĐÃ DUYỆT', 'vi'),
    'ĐÃ DUYỆT'
  );
});


test('real EnPal implementation plan exposes 16 tasks and 8 machine-readable gates', () => {
  const markdown = fs.readFileSync(
    'docs/superpowers/plans/2026-09-20-enpal-v1-implementation-plan.md',
    'utf8'
  );
  const parsed = parseImplementationPlan(markdown);
  assert.equal(parsed.tasks.length, 16);
  assert.equal(parsed.gates.total, 8);
});
