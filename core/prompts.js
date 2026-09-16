import { CONTROL_VERSION } from './constants.js';

function json(value) {
  return JSON.stringify(value ?? null, null, 2);
}

function controlHeader(sessionId) {
  return [
    '[ENPAL CONTROL]',
    `control_version=${CONTROL_VERSION}`,
    `session_id=${sessionId}`
  ].join('\n');
}

export function buildStartControl({ sessionId, sessionPack, spreadsheetUrl = '' }) {
  return `${controlHeader(sessionId)}
mode=START

The supplied EnPal Session Pack and Sheet-backed learner state are authoritative for this session.
Project memory may support conversational continuity, but Project memory must not alter the curriculum goal, main ability, review selection, or completion criteria.
Teach through Voice naturally and follow the Session Pack exactly. Do not expose administrative control instructions to the learner.
${spreadsheetUrl ? `EnPal spreadsheet: ${spreadsheetUrl}\n` : ''}
SESSION PACK:
${json(sessionPack)}`;
}

export function buildResumeControl({ sessionId, sessionPack = null }) {
  return `${controlHeader(sessionId)}
mode=RESUME

This session was paused earlier.
Briefly retrieve the key material already covered.
Then continue naturally from the unfinished part.
Do not restart the lesson from the beginning.
The current EnPal Session Pack remains authoritative; Project memory must not change its curriculum goal or completion criteria.${sessionPack ? `\n\nSESSION PACK:\n${json(sessionPack)}` : ''}`;
}

export function buildAnalyzeControl({ sessionId, spreadsheetUrl }) {
  return `${controlHeader(sessionId)}
mode=ANALYZE

Use evidence from this actual session only. Do not invent gaps, errors, pronunciation issues, or learner behavior.
Write the analysis directly to the configured EnPal Google Sheet: ${spreadsheetUrl}
Update the existing session_id ${sessionId} row; do not append a duplicate Session row.
Update Target Bank and Learner only where the session provides meaningful evidence. Reuse supplied target_id values for known targets.

Write the learner-facing Learning Summary with these required sections:
1. Hôm nay đã học gì?
2. Cụm từ / cách diễn đạt đáng nhớ
3. Mẫu câu / cấu trúc có thể tái sử dụng — include an example for EVERY pattern
4. Những gì learner đã bị bí hoặc không nghe ra
   - Speaking gaps
   - Listening gaps
5. Những lỗi quan trọng đã được sửa
6. Listening / Pronunciation Takeaways — only when genuinely noteworthy from the interaction
7. Best Version — mandatory for Speaking sessions; improve grammar, vocabulary, naturalness, cohesion, and professional appropriateness and preserve the learner's intended meaning. Do not add ideas the learner did not intend.

Required machine-facing session fields include main_ability_result, strong_targets, weak_targets, speaking_gaps, listening_gaps, important_corrections, review_targets_next, learning_summary.
Do not rely on the visible chat response as a machine-data return path. The extension will verify Google Sheet state and will ignore visible assistant output as machine data.
Only after every required analysis/update write succeeds, write analysis_status = DONE last.
After the Sheet write succeeds, stop.`;
}

export function buildPrepareControl({
  sessionId,
  spreadsheetUrl,
  nextIdentity,
  baseLesson,
  reviewContext = [],
  teachingControlRules = null
}) {
  const identityLines = Object.entries(nextIdentity || {})
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  return `${controlHeader(sessionId)}
mode=PREPARE

Prepare exactly one personalized Next Session in the EnPal Google Sheet: ${spreadsheetUrl}
Spreadsheet title: EnPal Database

The extension supplied this machine identity. Copy these values exactly and do not invent or change machine IDs:
${identityLines}

Preserve the Base Lesson main objective. Personalization may add only context-compatible review and minor difficulty adjustment; it must not rewrite the fixed curriculum objective.
Use only bounded, relevant review candidates. Do not force old context-specific targets into unrelated lessons.

BASE LESSON JSON:
${json(baseLesson)}

REVIEW CANDIDATES:
${json(reviewContext)}

TEACHING-CONTROL RULES:
${json(teachingControlRules)}

Write the complete Next Session payload first. Include the supplied identity unchanged, Base Lesson reference, review layer, teaching control, completion criteria, mask policy, and listening fields when required.
Only after every required Next Session field is present, write status = READY last.
The extension verifies the Sheet commit marker and does not use visible chat output as machine data.
After the Sheet write succeeds, stop.`;
}

export function buildRecoveryAnalyzeWriteControl({ sessionId, spreadsheetUrl }) {
  return `${controlHeader(sessionId)}
mode=RECOVERY_ANALYZE_WRITE

Only complete the missing Google Sheet write for the already-performed ANALYZE operation in ${spreadsheetUrl}.
Do not re-run pedagogy. Do not re-evaluate the learner. Do not advance curriculum. Do not create another Session row.
Complete the existing session_id ${sessionId} analysis/update fields using the analysis already established in this conversation, then write analysis_status = DONE last.
After the missing Sheet write succeeds, stop.`;
}

export function buildRecoveryPrepareWriteControl({ sessionId, spreadsheetUrl, nextIdentity }) {
  return `${controlHeader(sessionId)}
mode=RECOVERY_PREPARE_WRITE

Only complete the missing Google Sheet write for the already-performed PREPARE operation in ${spreadsheetUrl}.
Do not re-run pedagogy. Do not select new targets. Do not advance curriculum. Do not create another Session row.
Restore the same prepared Next Session using this supplied identity unchanged:
${json(nextIdentity)}
Write status = READY last, only after the missing Next Session payload is complete.
After the missing Sheet write succeeds, stop.`;
}

export function buildSetupWriteProbe({ setupProbeId, spreadsheetUrl }) {
  return `${controlHeader('SETUP')}
mode=SETUP_WRITE_PROBE
setup_probe_id=${setupProbeId}

This is an EnPal setup compatibility probe, not a learning session.
Using the connected Google Sheets capability, write Learner key chatgpt_google_write_probe with the exact value ${setupProbeId} into this configured EnPal Sheet: ${spreadsheetUrl}
Do not create a Sessions row. Do not alter learner pedagogical fields, Target Bank, Curriculum, or Next Session.
Do not merely describe the write. Do not ask the user or extension for confirmation; perform the connected Google Sheet write automatically if the platform permits it.
After the write succeeds, stop.`;
}
