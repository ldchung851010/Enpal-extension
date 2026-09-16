export function validBaseLesson(overrides = {}) {
  return {
    schema_version: '1.0',
    lesson_id: 'lesson-001',
    unit_id: 'unit-001',
    lesson_type: 'SPEAKING',
    title: 'Explain Root Cause',
    primary_skill: 'SPEAKING',
    main_ability: 'Explain the most likely root cause using evidence',
    core_tasks: [],
    core_language_support: [],
    completion_criteria: [],
    listening: null,
    teacher_notes: [],
    ...overrides
  };
}

export function fileFromJson(value, name = 'lesson.json') {
  const text = JSON.stringify(value);
  return {
    name,
    type: 'application/json',
    async text() { return text; }
  };
}

export function validLessonFile(name = 'lesson-001.json', overrides = {}) {
  const match = /lesson-(\d+)\.json$/i.exec(name);
  const suffix = match ? match[1] : '001';
  return fileFromJson(validBaseLesson({ lesson_id: `lesson-${suffix}`, ...overrides }), name);
}
