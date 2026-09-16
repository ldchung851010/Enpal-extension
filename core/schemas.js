export const LEARNER_KEYS = Object.freeze(['key', 'value']);

export const TARGET_BANK_COLUMNS = Object.freeze([
  'target_id',
  'target_type',
  'canonical_target',
  'context',
  'status',
  'priority',
  'last_seen_session',
  'last_result',
  'review_due',
  'consecutive_integration_failures',
  'notes',
  'updated_at'
]);

export const SESSION_COLUMNS = Object.freeze([
  'session_id',
  'session_number',
  'curriculum_sequence',
  'lesson_id',
  'unit_id',
  'lesson_type',
  'title',
  'chat_url',
  'chat_title_expected',
  'lifecycle_status',
  'pipeline_phase',
  'started_at',
  'paused_at',
  'completed_at',
  'review_targets_used',
  'main_ability_result',
  'strong_targets',
  'weak_targets',
  'speaking_gaps',
  'listening_gaps',
  'important_corrections',
  'review_targets_next',
  'learning_summary',
  'analysis_status',
  'rename_status',
  'rename_last_error'
]);

export const CURRICULUM_COLUMNS = Object.freeze([
  'sequence',
  'lesson_id',
  'unit_id',
  'small_topic',
  'large_topic',
  'lesson_type',
  'title',
  'base_lesson_file',
  'status'
]);

export const NEXT_SESSION_KEYS = Object.freeze([
  'session_id',
  'session_number',
  'curriculum_sequence',
  'prepared_from_session_id',
  'prepare_version',
  'lesson_id',
  'unit_id',
  'lesson_type',
  'title',
  'main_ability',
  'base_lesson_id',
  'review_targets',
  'learner_context',
  'teaching_control',
  'listening_script',
  'gist_question',
  'critical_details',
  'completion_criteria',
  'mask_policy',
  'status',
  'prepared_at'
]);
