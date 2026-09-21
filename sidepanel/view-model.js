const ACTIONS = Object.freeze({
  SETUP_REQUIRED: ['SETUP'],
  PLATFORM_VERIFICATION_REQUIRED: ['CONFIRM_PLATFORM'],
  READY: ['START'],
  LEARNING: ['PAUSE', 'END'],
  PAUSED: ['START'],
  PROCESSING: [],
  ERROR: []
});

const MESSAGES = Object.freeze({
  SETUP_REQUIRED: 'Verify setup before starting a lesson.',
  PLATFORM_VERIFICATION_REQUIRED: 'Project Google access was checked live. Confirm it to continue.',
  READY: 'Ready for your next lesson.',
  LEARNING: 'Lesson in progress.',
  PAUSED: 'Lesson paused. Continue when you are ready.',
  PROCESSING: 'Finishing your lesson.',
  ERROR: 'EnPal needs attention before continuing.'
});

export function getSidePanelView(state, recoverable = false) {
  const actions = state === 'ERROR' && recoverable
    ? ['RETRY']
    : (ACTIONS[state] ?? []);

  const message = state === 'ERROR' && recoverable
    ? 'Something interrupted EnPal. You can retry.'
    : (MESSAGES[state] ?? 'EnPal is not ready.');

  return { state, actions, message };
}
