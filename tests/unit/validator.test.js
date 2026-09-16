import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateBaseLesson, validateReadyNextSession, validateAnalyzeCommit
} from '../../core/validator.js';

test('rejects a Base Lesson missing main_ability', () => {
  assert.throws(() => validateBaseLesson({
    schema_version:'1.0', lesson_id:'lesson-001', unit_id:'unit-001',
    lesson_type:'SPEAKING', title:'X', primary_skill:'SPEAKING'
  }), /main_ability/);
});

test('rejects READY Next Session with missing payload', () => {
  assert.throws(() => validateReadyNextSession({status:'READY'}), /session_id/);
});

test('rejects DONE analysis with missing learning summary', () => {
  assert.throws(() => validateAnalyzeCommit({
    session_id:'session-001',
    main_ability_result:'met',
    strong_targets:[],
    weak_targets:[],
    speaking_gaps:[],
    listening_gaps:[],
    important_corrections:[],
    review_targets_next:[]
  , analysis_status:'DONE'}), /learning_summary/);
});
