export const APP_STATES = Object.freeze([
  'READY', 'LEARNING', 'PAUSED', 'PROCESSING', 'ERROR'
]);

export const SESSION_STATES = Object.freeze([
  'STARTING', 'IN_PROGRESS', 'PAUSED', 'PROCESSING', 'COMPLETED', 'ERROR'
]);

export const NEXT_SESSION_STATES = Object.freeze([
  'READY', 'CONSUMED', 'PREPARING'
]);

export const PIPELINE_PHASES = Object.freeze([
  'STOP_VOICE',
  'VOICE_SETTLED',
  'ANALYZE_REQUESTED',
  'ANALYZE_DONE',
  'UPDATE_DONE',
  'PREPARE_REQUESTED',
  'NEXT_READY',
  'CORE_COMPLETED',
  'RENAME_ATTEMPTED',
  'DONE'
]);
