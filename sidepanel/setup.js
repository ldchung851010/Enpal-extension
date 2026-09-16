export const BASE_LESSON_PICKER_HTML = '<input id="base-lessons" type="file" accept="application/json,.json" multiple webkitdirectory>';

function lessonSequence(fileName) {
  const match = /^lesson-(\d+)\.json$/i.exec(fileName);
  if (!match) {
    throw new Error(`Base Lesson filename must match lesson-NNN.json: ${fileName}`);
  }
  return Number(match[1]);
}

export function buildCurriculumImport(importedLessons) {
  return [...importedLessons]
    .map(item => ({ item, sequence: lessonSequence(item.file_name) }))
    .sort((a, b) => a.sequence - b.sequence)
    .map(({ item, sequence }) => {
      const row = {
        sequence,
        lesson_id: item.lesson_id,
        unit_id: item.unit_id,
        lesson_type: item.lesson_type,
        title: item.title,
        base_lesson_file: item.file_id
      };
      for (const optional of ['small_topic', 'large_topic', 'status']) {
        if (item[optional] !== undefined) row[optional] = item[optional];
      }
      return row;
    });
}

export async function importSelectedBaseLessons(files, driveRepository) {
  const imported = await driveRepository.importBaseLessonFiles(files);
  return {
    imported,
    curriculum: buildCurriculumImport(imported)
  };
}

export function mountBaseLessonPicker(container, { driveRepository, onImported, onError } = {}) {
  container.insertAdjacentHTML('beforeend', BASE_LESSON_PICKER_HTML);
  const input = container.querySelector('#base-lessons');
  input?.addEventListener('change', async () => {
    try {
      const result = await importSelectedBaseLessons(input.files, driveRepository);
      await onImported?.(result);
    } catch (error) {
      onError?.(error);
    }
  });
  return input;
}
