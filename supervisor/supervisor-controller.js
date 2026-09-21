import { isEnpalControl } from '../core/control-envelope.js';

const STATUS = Object.freeze({
  OFF: 'OFF',
  ON: 'ON',
  DEGRADED: 'DEGRADED'
});

function filteredTurns(turns) {
  if (!Array.isArray(turns)) return [];
  return turns.filter(turn => (
    turn &&
    typeof turn.text === 'string' &&
    !isEnpalControl(turn.text)
  ));
}

export function createSupervisorController({ decisionProvider, deliverInstruction }) {
  let currentStatus = STATUS.OFF;
  let context = null;

  function continueWithoutSupervisor() {
    return {
      action: 'CONTINUE_WITHOUT_SUPERVISOR',
      degraded: currentStatus === STATUS.DEGRADED
    };
  }

  return {
    async start({ sessionId, lessonBrief, teachingMethod }) {
      context = { sessionId, lessonBrief, teachingMethod };
      currentStatus = STATUS.ON;
      return { status: currentStatus };
    },

    async observe(turns) {
      if (currentStatus !== STATUS.ON) {
        return continueWithoutSupervisor();
      }

      const pedagogicalTurns = filteredTurns(turns);
      if (pedagogicalTurns.length === 0) {
        return { action: 'NOOP' };
      }

      try {
        const decision = await decisionProvider({
          ...context,
          turns: pedagogicalTurns
        });

        if (
          decision?.action === 'NUDGE' ||
          decision?.action === 'CORRECT_COURSE'
        ) {
          await deliverInstruction(decision.instruction);
        }

        return decision;
      } catch {
        currentStatus = STATUS.DEGRADED;
        return continueWithoutSupervisor();
      }
    },

    stop() {
      currentStatus = STATUS.OFF;
      context = null;
      return { status: currentStatus };
    },

    status() {
      return currentStatus;
    }
  };
}
