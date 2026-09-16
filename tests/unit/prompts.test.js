import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildStartControl,
  buildResumeControl,
  buildAnalyzeControl,
  buildPrepareControl,
  buildRecoveryAnalyzeWriteControl,
  buildRecoveryPrepareWriteControl,
  buildSetupWriteProbe
} from '../../core/prompts.js';
import { validBaseLesson } from '../helpers/fixtures.js';

test('every control carries versioned machine metadata', () => {
  const start = buildStartControl({
    sessionId: 'S-001',
    sessionPack: { title: 'X', completion_criteria: [] }
  });
  assert.match(start, /^\[ENPAL CONTROL\]/);
  assert.match(start, /control_version=enpal-v1\.0/);
  assert.match(start, /session_id=S-001/);
});

test('START makes Session Pack authoritative over Project memory', () => {
  const text = buildStartControl({
    sessionId: 'S-001',
    sessionPack: { title: 'Explain Root Cause', completion_criteria: ['finish'] }
  });
  assert.match(text, /Session Pack.*authoritative/i);
  assert.match(text, /Project memory.*must not alter/i);
  assert.match(text, /completion criteria/i);
});

test('RESUME requires retrieval then continuation without restart', () => {
  const text = buildResumeControl({ sessionId: 'S-001' });
  assert.match(text, /paused earlier/i);
  assert.match(text, /Briefly retrieve the key material already covered/i);
  assert.match(text, /continue naturally from the unfinished part/i);
  assert.match(text, /Do not restart the lesson from the beginning/i);
});

test('ANALYZE prompt forbids DOM return-path and names commit marker', () => {
  const text = buildAnalyzeControl({
    sessionId: 'S-001',
    spreadsheetUrl: 'https://docs.google.com/spreadsheets/d/X/edit'
  });
  assert.match(text, /analysis_status = DONE/);
  assert.match(text, /write.*last/i);
  assert.match(text, /do not rely on.*chat response/i);
  assert.match(text, /existing session_id.*S-001/i);
  assert.match(text, /Best Version/i);
  assert.match(text, /preserve.*meaning/i);
});

test('ANALYZE includes all seven learner-facing summary sections', () => {
  const text = buildAnalyzeControl({ sessionId: 'S-001', spreadsheetUrl: 'sheet-url' });
  for (const required of [
    'Hôm nay đã học gì?',
    'Cụm từ / cách diễn đạt đáng nhớ',
    'Mẫu câu / cấu trúc có thể tái sử dụng',
    'Speaking gaps',
    'Listening gaps',
    'Những lỗi quan trọng đã được sửa',
    'Listening / Pronunciation Takeaways',
    'Best Version'
  ]) {
    assert.match(text, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
  }
});

test('PREPARE prompt requires supplied machine identity unchanged', () => {
  const text = buildPrepareControl({
    sessionId: 'S-001',
    spreadsheetUrl: 'https://docs.google.com/spreadsheets/d/X/edit',
    nextIdentity: { session_id:'S-002', session_number:2, curriculum_sequence:2 },
    baseLesson: validBaseLesson(),
    reviewContext: []
  });
  assert.match(text, /S-002/);
  assert.match(text, /session_number=2/);
  assert.match(text, /curriculum_sequence=2/);
  assert.match(text, /copy.*exactly/i);
  assert.match(text, /status = READY/);
  assert.match(text, /write.*last/i);
  assert.match(text, /preserve.*main objective/i);
});

test('recovery controls only complete missing Sheet writes', () => {
  const analyze = buildRecoveryAnalyzeWriteControl({
    sessionId: 'S-001', spreadsheetUrl: 'sheet-url'
  });
  const prepare = buildRecoveryPrepareWriteControl({
    sessionId: 'S-001', spreadsheetUrl: 'sheet-url', nextIdentity: { session_id:'S-002' }
  });
  for (const text of [analyze, prepare]) {
    assert.match(text, /only.*missing.*Sheet write/i);
    assert.match(text, /do not re-run.*pedagogy/i);
    assert.match(text, /do not advance curriculum/i);
  }
});

test('setup probe writes unique marker without creating session data', () => {
  const text = buildSetupWriteProbe({
    setupProbeId: 'probe-abc-123',
    spreadsheetUrl: 'https://docs.google.com/spreadsheets/d/X/edit'
  });
  assert.match(text, /probe-abc-123/);
  assert.match(text, /chatgpt_google_write_probe/);
  assert.match(text, /do not create.*Sessions row/i);
  assert.match(text, /do not ask.*confirmation/i);
});
