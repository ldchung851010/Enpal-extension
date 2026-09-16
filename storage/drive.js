import { validateBaseLesson } from '../core/validator.js';

const DRIVE_API = 'https://www.googleapis.com/drive/v3/files';
const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3/files';
const FOLDER_MIME = 'application/vnd.google-apps.folder';
const JSON_MIME = 'application/json';
const MULTIPART_BOUNDARY = 'enpal_v1_drive_boundary';

function escapeQueryValue(value) {
  return String(value).replaceAll('\\', '\\\\').replaceAll("'", "\\'");
}

async function responseJson(response, label) {
  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  if (!response.ok) {
    const detail = body?.error?.message || `${response.status}`;
    throw new Error(`${label}: ${detail}`);
  }
  return body;
}

async function responseText(response, label) {
  if (!response.ok) {
    let detail = `${response.status}`;
    try {
      const body = await response.json();
      detail = body?.error?.message || detail;
    } catch {
      // Keep status-only detail.
    }
    throw new Error(`${label}: ${detail}`);
  }
  return response.text();
}

function multipartRelated(metadata, jsonText) {
  return [
    `--${MULTIPART_BOUNDARY}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    JSON.stringify(metadata),
    `--${MULTIPART_BOUNDARY}`,
    `Content-Type: ${JSON_MIME}`,
    '',
    jsonText,
    `--${MULTIPART_BOUNDARY}--`,
    ''
  ].join('\r\n');
}

async function parseLessonFile(file) {
  const text = await file.text();
  let lesson;
  try {
    lesson = JSON.parse(text);
  } catch (error) {
    throw new Error(`${file.name}: invalid JSON (${error.message})`);
  }
  validateBaseLesson(lesson);
  return { file, text, lesson };
}

export function createDriveRepository({ authorizedFetch } = {}) {
  if (typeof authorizedFetch !== 'function') {
    throw new Error('Drive repository requires authorizedFetch');
  }

  async function fetchJson(url, options = {}, label = 'Google Drive') {
    return responseJson(await authorizedFetch(url, options), label);
  }

  async function listFiles(query) {
    const params = new URLSearchParams({
      q: query,
      fields: 'files(id,name,mimeType,parents)',
      orderBy: 'name'
    });
    const body = await fetchJson(`${DRIVE_API}?${params}`, {}, 'List Drive files');
    return body.files || [];
  }

  async function findFolder(name, parentId = null) {
    const clauses = [
      `name = '${escapeQueryValue(name)}'`,
      `mimeType = '${FOLDER_MIME}'`,
      'trashed = false'
    ];
    if (parentId) clauses.push(`'${escapeQueryValue(parentId)}' in parents`);
    const files = await listFiles(clauses.join(' and '));
    return files[0] || null;
  }

  async function createFolder(name, parentId = null) {
    const metadata = { name, mimeType: FOLDER_MIME };
    if (parentId) metadata.parents = [parentId];
    return fetchJson(`${DRIVE_API}?fields=${encodeURIComponent('id,name,parents')}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(metadata)
    }, `Create Drive folder ${name}`);
  }

  async function ensureFolder(name, parentId = null) {
    return (await findFolder(name, parentId)) || createFolder(name, parentId);
  }

  async function createBaseLessonsFolder() {
    const enpal = await ensureFolder('EnPal');
    return ensureFolder('base-lessons', enpal.id);
  }

  async function uploadLesson(parentId, parsed) {
    const metadata = {
      name: parsed.file.name,
      mimeType: JSON_MIME,
      parents: [parentId]
    };
    const body = multipartRelated(metadata, parsed.text);
    return fetchJson(
      `${DRIVE_UPLOAD_API}?uploadType=multipart&fields=${encodeURIComponent('id,name,parents')}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': `multipart/related; boundary=${MULTIPART_BOUNDARY}`
        },
        body
      },
      `Upload Base Lesson ${parsed.file.name}`
    );
  }

  async function importBaseLessonFiles(files) {
    const parsed = [];
    const lessonIds = new Set();
    for (const file of Array.from(files || [])) {
      const item = await parseLessonFile(file);
      if (lessonIds.has(item.lesson.lesson_id)) {
        throw new Error(`Base Lesson import: duplicate lesson_id ${item.lesson.lesson_id}`);
      }
      lessonIds.add(item.lesson.lesson_id);
      parsed.push(item);
    }

    const folder = await createBaseLessonsFolder();
    const imported = [];
    for (const item of parsed) {
      const uploaded = await uploadLesson(folder.id, item);
      const lesson = item.lesson;
      const metadata = {
        file_id: uploaded.id,
        file_name: uploaded.name || item.file.name,
        parentId: folder.id,
        lesson_id: lesson.lesson_id,
        unit_id: lesson.unit_id,
        lesson_type: lesson.lesson_type,
        title: lesson.title
      };
      for (const optional of ['small_topic', 'large_topic', 'status']) {
        if (lesson[optional] !== undefined) metadata[optional] = lesson[optional];
      }
      imported.push(metadata);
    }
    return imported;
  }

  async function listImportedBaseLessons(folderId) {
    return listFiles(`'${escapeQueryValue(folderId)}' in parents and trashed = false`);
  }

  async function readBaseLesson(fileId) {
    const response = await authorizedFetch(`${DRIVE_API}/${encodeURIComponent(fileId)}?alt=media`);
    const text = await responseText(response, `Read Base Lesson ${fileId}`);
    let lesson;
    try {
      lesson = JSON.parse(text);
    } catch (error) {
      throw new Error(`Base Lesson ${fileId}: invalid JSON (${error.message})`);
    }
    return validateBaseLesson(lesson);
  }

  async function findBaseLessonByName(folderId, fileName) {
    const query = [
      `name = '${escapeQueryValue(fileName)}'`,
      `'${escapeQueryValue(folderId)}' in parents`,
      'trashed = false'
    ].join(' and ');
    const files = await listFiles(query);
    return files[0] || null;
  }

  return {
    createBaseLessonsFolder,
    importBaseLessonFiles,
    listImportedBaseLessons,
    readBaseLesson,
    findBaseLessonByName
  };
}
