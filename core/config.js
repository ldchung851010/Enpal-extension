const REQUIRED = [
  'projectUrl',
  'curriculumSpreadsheetId',
  'databaseSpreadsheetId',
  'sessionBriefSpreadsheetId',
  'reviewLedgerSpreadsheetId',
  'teacherRoleUrl',
  'speakingMethodUrl',
  'listeningMethodUrl'
];

export function loadRuntimeConfig(raw) {
  const config = { ...raw };
  for (const key of REQUIRED) {
    if (typeof config[key] !== 'string' || config[key].trim() === '') {
      throw new Error(`Missing required runtime config: ${key}`);
    }
  }
  return config;
}
