import test from 'node:test';
import assert from 'node:assert/strict';
import { createDriveRepository } from '../../storage/drive.js';
import { buildCurriculumImport, BASE_LESSON_PICKER_HTML } from '../../sidepanel/setup.js';
import { fileFromJson, validBaseLesson, validLessonFile } from '../helpers/fixtures.js';

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

function makeDriveRepo({ rawFiles = {} } = {}) {
  const calls = [];
  const uploadCalls = [];
  const folders = new Map();
  let counter = 0;
  const rootFolderId = 'enpal-folder';
  const baseFolderId = 'base-lessons-folder';
  folders.set(`root:EnPal`, rootFolderId);
  folders.set(`${rootFolderId}:base-lessons`, baseFolderId);

  const authorizedFetch = async (url, options = {}) => {
    const method = options.method || 'GET';
    calls.push({ url, options });

    if (url.includes('/upload/drive/v3/files')) {
      uploadCalls.push({ url, options });
      counter += 1;
      const nameMatch = /"name":"([^"]+)"/.exec(String(options.body));
      const parentMatch = /"parents":\["([^"]+)"\]/.exec(String(options.body));
      return jsonResponse({
        id: `file-${counter}`,
        name: nameMatch?.[1] || `file-${counter}.json`,
        parents: [parentMatch?.[1] || baseFolderId]
      });
    }

    if (url.includes('?alt=media')) {
      const fileId = /\/files\/([^?]+)/.exec(url)?.[1];
      if (!(fileId in rawFiles)) return new Response('missing', { status: 404 });
      return new Response(JSON.stringify(rawFiles[fileId]), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }

    if (url.includes('/drive/v3/files?') && method === 'GET') {
      const query = new URL(url).searchParams.get('q') || '';
      const name = /name = '([^']+)'/.exec(query)?.[1];
      const parent = /'([^']+)' in parents/.exec(query)?.[1] || 'root';
      const id = folders.get(`${parent}:${name}`);
      return jsonResponse({ files: id ? [{ id, name, parents: parent === 'root' ? [] : [parent] }] : [] });
    }

    if (url.endsWith('/drive/v3/files?fields=id%2Cname%2Cparents') && method === 'POST') {
      const body = JSON.parse(options.body);
      const parent = body.parents?.[0] || 'root';
      const id = `${body.name}-${++counter}`;
      folders.set(`${parent}:${body.name}`, id);
      return jsonResponse({ id, name: body.name, parents: body.parents || [] });
    }

    return jsonResponse({ error: { message: `Unhandled fake Drive request: ${method} ${url}` } }, 500);
  };

  const repo = createDriveRepository({ authorizedFetch });
  return Object.assign(repo, { calls, uploadCalls, rootFolderId, baseFolderId });
}

test('rejects invalid lesson before upload', async () => {
  const drive = makeDriveRepo();
  await assert.rejects(
    () => drive.importBaseLessonFiles([fileFromJson({ lesson_id: 'x' })]),
    /schema_version/
  );
  assert.equal(drive.uploadCalls.length, 0);
});

test('uploads validated lessons under the EnPal base-lessons folder', async () => {
  const drive = makeDriveRepo();
  const result = await drive.importBaseLessonFiles([validLessonFile('lesson-001.json')]);
  assert.equal(result[0].file_name, 'lesson-001.json');
  assert.equal(result[0].parentId, drive.baseFolderId);
  assert.equal(drive.uploadCalls.length, 1);
});

test('duplicate lesson_id is rejected before any upload', async () => {
  const drive = makeDriveRepo();
  await assert.rejects(
    () => drive.importBaseLessonFiles([
      validLessonFile('lesson-001.json'),
      validLessonFile('lesson-002.json', { lesson_id: 'lesson-001' })
    ]),
    /duplicate lesson_id/
  );
  assert.equal(drive.uploadCalls.length, 0);
});

test('runtime read parses and validates Drive JSON', async () => {
  const lesson = validBaseLesson();
  const drive = makeDriveRepo({ rawFiles: { good: lesson, bad: { lesson_id: 'x' } } });
  assert.deepEqual(await drive.readBaseLesson('good'), lesson);
  await assert.rejects(() => drive.readBaseLesson('bad'), /schema_version/);
});

test('setup curriculum import sorts locked filenames and does not invent grouping metadata', async () => {
  const imported = [
    { file_id:'F10', file_name:'lesson-010.json', lesson_id:'lesson-010', unit_id:'u10', lesson_type:'LISTENING', title:'Ten' },
    { file_id:'F2', file_name:'lesson-002.json', lesson_id:'lesson-002', unit_id:'u2', lesson_type:'SPEAKING', title:'Two', small_topic:'A' }
  ];
  const rows = buildCurriculumImport(imported);
  assert.deepEqual(rows.map(row => row.sequence), [2, 10]);
  assert.equal(rows[0].base_lesson_file, 'F2');
  assert.equal(rows[0].small_topic, 'A');
  assert.equal('large_topic' in rows[0], false);
  assert.equal('status' in rows[0], false);
});

test('setup exposes the locked directory JSON picker', () => {
  assert.match(BASE_LESSON_PICKER_HTML, /id="base-lessons"/);
  assert.match(BASE_LESSON_PICKER_HTML, /multiple/);
  assert.match(BASE_LESSON_PICKER_HTML, /webkitdirectory/);
  assert.match(BASE_LESSON_PICKER_HTML, /application\/json/);
});
