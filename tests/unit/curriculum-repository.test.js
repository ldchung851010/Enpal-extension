import test from 'node:test';
import assert from 'node:assert/strict';
import { createCurriculumRepository } from '../../storage/curriculum-repository.js';

test('curriculum chooses the smallest sequence not completed', async () => {
  const sheets = {
    async getValues() {
      return [
        ['curriculum_version', 'curriculum_sequence', 'lesson_id', 'primary_skill'],
        ['v1', '1', 'L1', 'Speaking'],
        ['v1', '2', 'L2', 'Listening'],
        ['v1', '3', 'L3', 'Speaking']
      ];
    }
  };
  const repo = createCurriculumRepository({ sheets, spreadsheetId: 'curriculum' });
  const lesson = await repo.getNextLesson([1, 2]);
  assert.equal(lesson.lesson_id, 'L3');
  assert.equal(lesson.curriculum_sequence, 3);
});

test('getLesson returns the exact configured sequence', async () => {
  const sheets = {
    async getValues() {
      return [
        ['curriculum_sequence', 'lesson_id'],
        ['2', 'L2'],
        ['5', 'L5']
      ];
    }
  };
  const repo = createCurriculumRepository({ sheets, spreadsheetId: 'curriculum' });
  const lesson = await repo.getLesson(5);
  assert.equal(lesson.lesson_id, 'L5');
  assert.equal(lesson.curriculum_sequence, 5);
});
