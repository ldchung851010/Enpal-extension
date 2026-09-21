import test from 'node:test';
import assert from 'node:assert/strict';
import { createSupervisorController } from '../../supervisor/supervisor-controller.js';

test('filters ENPAL_CONTROL traffic before requesting a decision', async () => {
  let observed;
  const controller = createSupervisorController({
    decisionProvider: async ({ turns }) => {
      observed = turns;
      return { action: 'CONTINUE', instruction: 'NONE' };
    },
    deliverInstruction: async () => {}
  });

  await controller.start({
    sessionId: 'S-001',
    lessonBrief: { lesson_id: 'L1' },
    teachingMethod: 'speaking'
  });
  await controller.observe([
    { role: 'learner', text: 'I work as an engineer.' },
    { role: 'user', text: 'ENPAL_CONTROL\ntype=PAUSE\nEND_ENPAL_CONTROL' }
  ]);

  assert.deepEqual(observed, [
    { role: 'learner', text: 'I work as an engineer.' }
  ]);
});

test('NUDGE delivers exactly one instruction', async () => {
  const delivered = [];
  const controller = createSupervisorController({
    decisionProvider: async () => ({
      action: 'NUDGE',
      instruction: 'Ask one shorter follow-up.'
    }),
    deliverInstruction: async (instruction) => delivered.push(instruction)
  });

  await controller.start({
    sessionId: 'S-001',
    lessonBrief: { lesson_id: 'L1' },
    teachingMethod: 'speaking'
  });
  await controller.observe([{ role: 'learner', text: 'Because machine stop.' }]);

  assert.deepEqual(delivered, ['Ask one shorter follow-up.']);
});

test('provider failure sets degraded status without fabricating a rubric decision', async () => {
  const controller = createSupervisorController({
    decisionProvider: async () => {
      throw new Error('supervisor unavailable');
    },
    deliverInstruction: async () => {
      throw new Error('must not deliver');
    }
  });

  await controller.start({
    sessionId: 'S-001',
    lessonBrief: { lesson_id: 'L1' },
    teachingMethod: 'speaking'
  });
  const result = await controller.observe([{ role: 'learner', text: 'Hello.' }]);

  assert.deepEqual(result, {
    action: 'CONTINUE_WITHOUT_SUPERVISOR',
    degraded: true
  });
  assert.equal(controller.status(), 'DEGRADED');
});

test('degraded mode stays fail-open until the next explicit start', async () => {
  let providerCalls = 0;
  const controller = createSupervisorController({
    decisionProvider: async () => {
      providerCalls += 1;
      if (providerCalls === 1) throw new Error('temporary failure');
      return { action: 'CONTINUE', instruction: 'NONE' };
    },
    deliverInstruction: async () => {}
  });

  const startArgs = {
    sessionId: 'S-001',
    lessonBrief: { lesson_id: 'L1' },
    teachingMethod: 'speaking'
  };
  await controller.start(startArgs);

  assert.deepEqual(
    await controller.observe([{ role: 'learner', text: 'First.' }]),
    { action: 'CONTINUE_WITHOUT_SUPERVISOR', degraded: true }
  );
  assert.deepEqual(
    await controller.observe([{ role: 'learner', text: 'Second.' }]),
    { action: 'CONTINUE_WITHOUT_SUPERVISOR', degraded: true }
  );
  assert.equal(providerCalls, 1);

  await controller.start(startArgs);
  assert.deepEqual(
    await controller.observe([{ role: 'learner', text: 'Third.' }]),
    { action: 'CONTINUE', instruction: 'NONE' }
  );
  assert.equal(providerCalls, 2);
});

test('stop turns Supervisor OFF and prevents further provider calls', async () => {
  let providerCalls = 0;
  const controller = createSupervisorController({
    decisionProvider: async () => {
      providerCalls += 1;
      return { action: 'CONTINUE', instruction: 'NONE' };
    },
    deliverInstruction: async () => {}
  });

  await controller.start({
    sessionId: 'S-001',
    lessonBrief: { lesson_id: 'L1' },
    teachingMethod: 'speaking'
  });
  assert.equal(controller.status(), 'ON');
  assert.deepEqual(controller.stop(), { status: 'OFF' });
  assert.equal(controller.status(), 'OFF');

  assert.deepEqual(
    await controller.observe([{ role: 'learner', text: 'After pause.' }]),
    { action: 'CONTINUE_WITHOUT_SUPERVISOR', degraded: false }
  );
  assert.equal(providerCalls, 0);
});

test('CORRECT_COURSE delivers one instruction with the active lesson context', async () => {
  const delivered = [];
  let received;
  const controller = createSupervisorController({
    decisionProvider: async (input) => {
      received = input;
      return {
        action: 'CORRECT_COURSE',
        instruction: 'Return to the communicative goal.'
      };
    },
    deliverInstruction: async (instruction) => delivered.push(instruction)
  });

  await controller.start({
    sessionId: 'S-002',
    lessonBrief: { lesson_id: 'L2' },
    teachingMethod: 'listening'
  });
  const turns = [{ role: 'teacher', text: 'Tell me about your weekend.' }];
  await controller.observe(turns);

  assert.deepEqual(received, {
    sessionId: 'S-002',
    lessonBrief: { lesson_id: 'L2' },
    teachingMethod: 'listening',
    turns
  });
  assert.deepEqual(delivered, ['Return to the communicative goal.']);
});

test('control-only batches are ignored without asking Supervisor for a rubric decision', async () => {
  let providerCalls = 0;
  const controller = createSupervisorController({
    decisionProvider: async () => {
      providerCalls += 1;
      return { action: 'CONTINUE' };
    },
    deliverInstruction: async () => {}
  });

  await controller.start({
    sessionId: 'S-003',
    lessonBrief: { lesson_id: 'L3' },
    teachingMethod: 'speaking'
  });

  assert.deepEqual(
    await controller.observe([
      { role: 'user', text: 'ENPAL_CONTROL\ntype=START\nEND_ENPAL_CONTROL' }
    ]),
    { action: 'NOOP' }
  );
  assert.equal(providerCalls, 0);
});
