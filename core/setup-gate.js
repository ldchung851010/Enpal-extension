import { loadRuntimeConfig } from './config.js';

function validActiveBrief(brief) {
  return Boolean(
    brief &&
    brief.ready === true &&
    typeof brief.curriculum_version === 'string' &&
    brief.curriculum_version.trim() !== '' &&
    Number.isFinite(Number(brief.curriculum_sequence)) &&
    typeof brief.lesson_id === 'string' &&
    brief.lesson_id.trim() !== '' &&
    typeof brief['Primary Skill'] === 'string' &&
    brief['Primary Skill'].trim() !== '' &&
    typeof brief['Communicative Goal'] === 'string' &&
    brief['Communicative Goal'].trim() !== ''
  );
}

export function createSetupGate({
  rawConfig,
  authorizeGoogle,
  verifySheetsAccess,
  hasPlatformGateMarker,
  readActiveBrief
}) {
  return {
    async verify({ interactive = false } = {}) {
      try {
        const config = loadRuntimeConfig(rawConfig);

        const token = await authorizeGoogle(interactive);
        if (typeof token !== 'string' || token.trim() === '') {
          throw new Error('Google authorization unavailable');
        }

        const sheetAccess = await verifySheetsAccess({ config, token });
        if (sheetAccess?.read !== true || sheetAccess?.write !== true) {
          throw new Error('Required Sheets read/write access is not verified');
        }

        if (await hasPlatformGateMarker() !== true) {
          throw new Error('Required platform gate marker is missing');
        }

        const brief = await readActiveBrief();
        if (!validActiveBrief(brief)) {
          throw new Error('ACTIVE Session Brief is missing or invalid');
        }

        return {
          state: 'READY',
          config,
          brief
        };
      } catch (error) {
        return {
          state: 'SETUP_REQUIRED',
          reason: error?.message || 'Setup verification failed'
        };
      }
    }
  };
}
