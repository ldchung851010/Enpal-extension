const BASE_LESSON_REQUIRED = Object.freeze([
  'schema_version',
  'lesson_id',
  'unit_id',
  'lesson_type',
  'title',
  'primary_skill',
  'main_ability',
  'core_tasks',
  'core_language_support',
  'completion_criteria',
  'teacher_notes'
]);

const ANALYZE_REQUIRED = Object.freeze([
  'session_id',
  'main_ability_result',
  'strong_targets',
  'weak_targets',
  'speaking_gaps',
  'listening_gaps',
  'important_corrections',
  'review_targets_next',
  'learning_summary'
]);

const READY_NEXT_REQUIRED = Object.freeze([
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
  'completion_criteria',
  'mask_policy',
  'prepared_at'
]);

export function assertRequired(obj, keys, label) {
  for (const key of keys) {
    if (obj[key] === undefined || obj[key] === null || obj[key] === '') {
      throw new Error(`${label}: missing ${key}`);
    }
  }
  return obj;
}

function assertArray(value, key, label) {
  if (!Array.isArray(value)) {
    throw new Error(`${label}: ${key} must be an array`);
  }
}

export function validateBaseLesson(lesson) {
  assertRequired(lesson, BASE_LESSON_REQUIRED, 'Base Lesson');

  assertArray(lesson.core_tasks, 'core_tasks', 'Base Lesson');
  assertArray(lesson.core_language_support, 'core_language_support', 'Base Lesson');
  assertArray(lesson.completion_criteria, 'completion_criteria', 'Base Lesson');
  assertArray(lesson.teacher_notes, 'teacher_notes', 'Base Lesson');

  if (lesson.lesson_type === 'LISTENING') {
    assertRequired(lesson, ['listening'], 'Base Lesson');
    assertRequired(
      lesson.listening,
      ['script', 'gist_question', 'critical_details', 'expected_difficult_segments'],
      'Base Lesson listening'
    );
    assertArray(lesson.listening.critical_details, 'critical_details', 'Base Lesson listening');
    assertArray(
      lesson.listening.expected_difficult_segments,
      'expected_difficult_segments',
      'Base Lesson listening'
    );
  }

  return lesson;
}

export function validateAnalyzeCommit(result) {
  if (result.analysis_status !== 'DONE') {
    throw new Error('Analyze commit: analysis_status must be DONE');
  }

  assertRequired(result, ANALYZE_REQUIRED, 'Analyze commit');
  return result;
}

export function validateReadyNextSession(session) {
  if (session.status !== 'READY') {
    throw new Error('Next Session: status must be READY');
  }

  assertRequired(session, READY_NEXT_REQUIRED, 'Next Session');
  assertArray(session.review_targets, 'review_targets', 'Next Session');
  assertArray(session.completion_criteria, 'completion_criteria', 'Next Session');

  if (session.mask_policy === 'FULL_VOICE') {
    assertRequired(
      session,
      ['listening_script', 'gist_question', 'critical_details'],
      'Next Session listening'
    );
    assertArray(session.critical_details, 'critical_details', 'Next Session listening');
  }

  return session;
}
