import { decideRecovery } from './recovery.js';
import { makeControl } from './control-envelope.js';
import { EnpalError, ERROR_CODES } from './errors.js';

function normalizeUrl(value) {
  const url = new URL(value);
  url.hash = '';
  if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, '');
  return `${url.origin}${url.pathname}${url.search}`;
}

function sameIdentity(left, right) {
  return Boolean(left && right) &&
    String(left.curriculum_version ?? '') === String(right.curriculum_version ?? '') &&
    Number(left.curriculum_sequence) === Number(right.curriculum_sequence) &&
    String(left.lesson_id ?? '') === String(right.lesson_id ?? '');
}

function primarySkill(brief) {
  return String(brief?.['Primary Skill'] ?? brief?.primary_skill ?? '')
    .trim()
    .toLowerCase();
}

function requiresListeningMask(brief) {
  const explicit = brief?.requires_listening_mask;
  if (explicit === true || String(explicit).toUpperCase() === 'TRUE') return true;
  return primarySkill(brief) === 'listening';
}

function teachingMethodFor(config, brief) {
  const skill = primarySkill(brief);
  if (skill === 'listening') {
    return {
      name: 'listening',
      url: config.listeningMethodUrl
    };
  }
  if (skill === 'speaking') {
    return {
      name: 'speaking',
      url: config.speakingMethodUrl
    };
  }
  throw new EnpalError(
    ERROR_CODES.CONSISTENCY_ERROR,
    'ACTIVE Session Brief has unsupported Primary Skill',
    false
  );
}

function createDefaultSessionId() {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (!uuid) throw new Error('Secure session ID generation is unavailable');
  return `S-${uuid}`;
}

function isConversationInsideProject(candidateUrl, projectUrl) {
  try {
    const candidate = new URL(candidateUrl);
    const project = new URL(projectUrl);
    const projectPath = project.pathname.replace(/\/+$/, '');
    return candidate.origin === project.origin &&
      candidate.pathname.startsWith(projectPath + '/c/');
  } catch {
    return false;
  }
}

const END_PHASE_ORDER = Object.freeze([
  'CHAT_BOUND',
  'PAUSE_COMMITTED',
  'ANALYZE_COMMITTED',
  'UPDATE_COMMITTED',
  'BRIEF_STAGED',
  'BRIEF_PROMOTED',
  'SESSION_COMPLETED'
]);

function endPhaseAtLeast(current, expected) {
  const currentIndex = END_PHASE_ORDER.indexOf(current);
  const expectedIndex = END_PHASE_ORDER.indexOf(expected);
  return currentIndex >= 0 && expectedIndex >= 0 && currentIndex >= expectedIndex;
}

function completedSequencesThrough(sequence) {
  const current = Number(sequence);
  if (!Number.isInteger(current) || current < 1) return [sequence];
  return Array.from({ length: current }, (_, index) => index + 1);
}

function pauseCheckpointValue(session) {
  for (const field of [
    'pause_checkpoint',
    'pause_checkpoint_json',
    'pause_checkpoint_text',
    'Pause Checkpoint',
    'checkpoint'
  ]) {
    const value = session?.[field];
    if (typeof value === 'string' && value.trim() !== '') return value;
    if (value && typeof value === 'object' && Object.keys(value).length > 0) return value;
  }
  return null;
}

function buildTeachingControl({
  type,
  sessionId,
  config,
  brief,
  checkpoint = false
}) {
  const method = teachingMethodFor(config, brief);
  const lines = [
    'Workspace ID: ' + String(config.id ?? ''),
    `Teacher Role: ${config.teacherRoleUrl}`,
    `Teaching Method (${method.name}): ${method.url}`,
    'EnPal Database: https://docs.google.com/spreadsheets/d/' +
      config.databaseSpreadsheetId + '/edit',
    'Session Brief source: https://docs.google.com/spreadsheets/d/' +
      config.sessionBriefSpreadsheetId + '/edit',
    'Review Ledger source: https://docs.google.com/spreadsheets/d/' +
      config.reviewLedgerSpreadsheetId + '/edit',
    'ACTIVE Session Brief:',
    JSON.stringify(brief)
  ];

  if (checkpoint) {
    lines.push(
      `Pause Checkpoint: read and restore the checkpoint from active Session ${sessionId} before continuing.`
    );
  }

  return makeControl({
    type,
    sessionId,
    workspaceId: config.id,
    body: lines.join('\n')
  });
}

export function createWorkflow(deps) {
  const {
    config,
    journal,
    sessions,
    curriculum,
    briefs,
    chatgpt,
    mask,
    supervisor,
    setupGate = null,
    createSessionId = createDefaultSessionId,
    pauseVerifyAttempts = 40,
    pausePollMs = 500,
    endVerifyAttempts = 40,
    endPollMs = 500,
    briefPromotionRange = { rowCount: 14, columnCount: 2 },
    sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
  } = deps;

  async function verifyBrief(brief, session = null) {
    if (!brief?.ready) {
      throw new EnpalError(
        ERROR_CODES.SETUP_REQUIRED,
        'ACTIVE Session Brief is not READY',
        true
      );
    }

    if (session && !sameIdentity(brief, session)) {
      throw new EnpalError(
        ERROR_CODES.CONSISTENCY_ERROR,
        'ACTIVE Session Brief identity does not match active Session',
        false
      );
    }

    const canonical = await curriculum.getLesson(brief.curriculum_sequence);
    if (!canonical || !sameIdentity(brief, canonical)) {
      throw new EnpalError(
        ERROR_CODES.CONSISTENCY_ERROR,
        'ACTIVE Session Brief does not match canonical curriculum identity',
        false
      );
    }

    return brief;
  }

  async function armMaskIfRequired(tabId, brief) {
    if (!requiresListeningMask(brief)) return { armed: false };

    try {
      const result = await mask.arm(tabId);
      if (result?.armed !== true) {
        throw new Error('Listening Mask did not confirm armed state');
      }
      return result;
    } catch (error) {
      if (error?.code === ERROR_CODES.MASK_REQUIRED) throw error;
      throw new EnpalError(
        ERROR_CODES.MASK_REQUIRED,
        error?.message || 'Required Listening Mask could not be armed',
        true
      );
    }
  }

  async function startSupervisorFailOpen(session, brief) {
    try {
      const method = teachingMethodFor(config, brief).name;
      const result = await supervisor.start({
        sessionId: session.session_id,
        lessonBrief: brief,
        teachingMethod: method
      });
      if (result?.status === 'DEGRADED') {
        await journal.write({ supervisorStatus: 'DEGRADED' });
        return 'DEGRADED';
      }
      return result?.status || 'ON';
    } catch {
      await journal.write({ supervisorStatus: 'DEGRADED' });
      return 'DEGRADED';
    }
  }

  async function finishLearningStart({
    tabId,
    session,
    brief,
    type,
    checkpoint = false,
    bindUrl = null,
    markAfterVoice = false
  }) {
    await armMaskIfRequired(tabId, brief);

    const control = buildTeachingControl({
      type,
      sessionId: session.session_id,
      config,
      brief,
      checkpoint
    });
    await chatgpt.sendControl(tabId, control);

    let boundSession = session;
    if (bindUrl === null && !session.chat_url) {
      const capturedUrl = await chatgpt.waitForConversationUrl(tabId, config.projectUrl);
      if (!isConversationInsideProject(capturedUrl, config.projectUrl)) {
        throw new EnpalError(
          ERROR_CODES.WRONG_CHAT,
          'Created conversation is not inside the configured ChatGPT Project',
          true
        );
      }
      boundSession = await sessions.bindChat(session.session_id, capturedUrl);
    } else if (bindUrl !== null && !session.chat_url) {
      boundSession = await sessions.bindChat(session.session_id, bindUrl);
    }

    await chatgpt.waitUntilIdle(tabId);

    if (!markAfterVoice) {
      boundSession = await sessions.markState(
        session.session_id,
        'IN_PROGRESS',
        { phase: 'CHAT_BOUND' }
      );
    }

    const supervisorStatus = await startSupervisorFailOpen(boundSession, brief);
    await chatgpt.startVoice(tabId);

    if (markAfterVoice) {
      boundSession = await sessions.markState(
        session.session_id,
        'IN_PROGRESS',
        { phase: session.phase || 'CHAT_BOUND' }
      );
    }

    await journal.write({
      sessionId: session.session_id,
      chatUrl: boundSession.chat_url,
      status: 'IN_PROGRESS',
      phase: 'LEARNING_ACTIVE',
      learningReady: true
    });

    return { session: boundSession, supervisorStatus };
  }

  async function startNew(brief) {
    await verifyBrief(brief);

    const sessionId = createSessionId();
    const session = await sessions.createStartingSession({
      session_id: sessionId,
      curriculum_version: brief.curriculum_version,
      curriculum_sequence: brief.curriculum_sequence,
      lesson_id: brief.lesson_id,
      primary_skill: brief['Primary Skill'] ?? brief.primary_skill ?? '',
      chat_url: '',
      phase: 'SESSION_STUB_CREATED'
    });

    await journal.write({
      sessionId,
      phase: 'SESSION_STUB_CREATED'
    });

    const tabId = await chatgpt.openProject(config.projectUrl);
    await journal.write({ pendingTabId: tabId });
    await chatgpt.waitForProjectReady(tabId, config.projectUrl);
    await chatgpt.createConversation(tabId);

    const result = await finishLearningStart({
      tabId,
      session,
      brief,
      type: 'START'
    });

    return {
      action: 'STARTED',
      ...result,
      tabId
    };
  }

  async function recoverStarting(session, brief, journalState) {
    await verifyBrief(brief, session);

    if (session.chat_url) {
      const tabId = await chatgpt.openConversation(session.chat_url);
      const actualUrl = await chatgpt.getConversationUrl(tabId);
      if (normalizeUrl(actualUrl) !== normalizeUrl(session.chat_url)) {
        throw new EnpalError(
          ERROR_CODES.WRONG_CHAT,
          'Recovered STARTING Session opened the wrong ChatGPT conversation',
          true
        );
      }

      const result = await finishLearningStart({
        tabId,
        session,
        brief,
        type: 'START'
      });
      return { action: 'RECOVERED_START', ...result, tabId };
    }

    let tabId = Number.isInteger(journalState?.pendingTabId)
      ? journalState.pendingTabId
      : null;
    let recoveredUrl = null;

    if (tabId !== null) {
      try {
        const candidateUrl = await chatgpt.getConversationUrl(tabId);
        if (isConversationInsideProject(candidateUrl, config.projectUrl)) {
          recoveredUrl = candidateUrl;
        }
      } catch {
        recoveredUrl = null;
      }
    }

    if (recoveredUrl !== null) {
      const boundSession = await sessions.bindChat(session.session_id, recoveredUrl);
      const result = await finishLearningStart({
        tabId,
        session: boundSession,
        brief,
        type: 'START'
      });
      return { action: 'RECOVERED_START', ...result, tabId };
    }

    tabId = await chatgpt.openProject(config.projectUrl);
    await journal.write({
      sessionId: session.session_id,
      pendingTabId: tabId,
      phase: 'SESSION_STUB_CREATED'
    });
    await chatgpt.waitForProjectReady(tabId, config.projectUrl);
    await chatgpt.createConversation(tabId);

    const result = await finishLearningStart({
      tabId,
      session,
      brief,
      type: 'START'
    });
    return { action: 'RECOVERED_START', ...result, tabId };
  }

  async function resumePaused(session, brief) {
    await verifyBrief(brief, session);

    const tabId = await chatgpt.openConversation(session.chat_url);
    const actualUrl = await chatgpt.getConversationUrl(tabId);
    if (normalizeUrl(actualUrl) !== normalizeUrl(session.chat_url)) {
      throw new EnpalError(
        ERROR_CODES.WRONG_CHAT,
        'Opened ChatGPT conversation does not match active Session chat_url',
        true
      );
    }

    const result = await finishLearningStart({
      tabId,
      session,
      brief,
      type: 'RESUME',
      checkpoint: true,
      markAfterVoice: true
    });

    return {
      action: 'RESUMED',
      ...result,
      tabId
    };
  }

  async function recoverInProgress(session, brief) {
    await verifyBrief(brief, session);

    const tabId = await openBoundConversation(session);
    await armMaskIfRequired(tabId, brief);
    const supervisorStatus = await startSupervisorFailOpen(session, brief);
    await chatgpt.startVoice(tabId);

    await journal.write({
      sessionId: session.session_id,
      chatUrl: session.chat_url,
      status: 'IN_PROGRESS',
      phase: 'LEARNING_ACTIVE',
      learningReady: true
    });

    return {
      action: 'RECOVERED_IN_PROGRESS',
      session,
      supervisorStatus,
      tabId
    };
  }


  async function verifyPausedDurably(sessionId) {
    const attempts = Math.max(1, Number(pauseVerifyAttempts) || 1);

    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const current = await sessions.getById(sessionId);
      const checkpoint = pauseCheckpointValue(current);
      if (
        current?.status === 'PAUSED' &&
        current?.phase === 'PAUSE_COMMITTED' &&
        checkpoint !== null
      ) {
        return current;
      }

      if (attempt < attempts - 1 && pausePollMs > 0) {
        await sleep(pausePollMs);
      }
    }

    throw new EnpalError(
      ERROR_CODES.SHEET_WRITE_UNVERIFIED,
      'Pause Checkpoint and PAUSED state could not be verified',
      true
    );
  }

  async function pauseCurrent() {
    const activeSessions = await sessions.listActive();
    const session = activeSessions[0];

    if (
      activeSessions.length !== 1 ||
      session?.status !== 'IN_PROGRESS' ||
      typeof session?.chat_url !== 'string' ||
      session.chat_url.trim() === ''
    ) {
      throw new EnpalError(
        ERROR_CODES.CONSISTENCY_ERROR,
        'PAUSE requires one bound IN_PROGRESS Session',
        false
      );
    }

    const tabId = await chatgpt.openConversation(session.chat_url);
    const actualUrl = await chatgpt.getConversationUrl(tabId);
    if (normalizeUrl(actualUrl) !== normalizeUrl(session.chat_url)) {
      throw new EnpalError(
        ERROR_CODES.WRONG_CHAT,
        'Opened ChatGPT conversation does not match active Session chat_url',
        true
      );
    }

    await chatgpt.stopVoice(tabId);
    await supervisor.stop();

    if (requiresListeningMask(session)) {
      await armMaskIfRequired(tabId, session);
    }

    const control = makeControl({
      type: 'PAUSE',
      sessionId: session.session_id,
      workspaceId: config.id,
      body: [
        'Workspace ID: ' + String(config.id ?? ''),
        'Exact EnPal Database: https://docs.google.com/spreadsheets/d/' +
          config.databaseSpreadsheetId + '/edit',
        'Create and persist the Pause Checkpoint for this active Session.',
        'Write the semantic checkpoint to the durable Session record for session_id=' +
          session.session_id + '.',
        'After that write succeeds, set lifecycle_status=PAUSED and pipeline_phase=PAUSE_COMMITTED.',
        'Do not run ANALYZE, UPDATE, Review Planner, or replace the ACTIVE Session Brief.'
      ].join('\n')
    });
    await chatgpt.sendControl(tabId, control);

    const pausedSession = await verifyPausedDurably(session.session_id);

    await journal.write({
      sessionId: session.session_id,
      chatUrl: session.chat_url,
      status: 'PAUSED',
      phase: 'PAUSE_COMMITTED'
    });

    return {
      action: 'PAUSED',
      session: pausedSession,
      tabId
    };
  }


  async function openBoundConversation(session) {
    if (
      typeof session?.chat_url !== 'string' ||
      session.chat_url.trim() === ''
    ) {
      throw new EnpalError(
        ERROR_CODES.CONSISTENCY_ERROR,
        'Active Session is missing its authoritative chat_url',
        false
      );
    }

    const tabId = await chatgpt.openConversation(session.chat_url);
    const actualUrl = await chatgpt.getConversationUrl(tabId);
    if (normalizeUrl(actualUrl) !== normalizeUrl(session.chat_url)) {
      throw new EnpalError(
        ERROR_CODES.WRONG_CHAT,
        'Opened ChatGPT conversation does not match active Session chat_url',
        true
      );
    }
    return tabId;
  }

  async function verifyEndPhase(sessionId, expectedPhase) {
    const attempts = Math.max(1, Number(endVerifyAttempts) || 1);

    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const current = await sessions.getById(sessionId);
      if (
        current &&
        (current.status === 'PROCESSING' || current.status === 'COMPLETED') &&
        endPhaseAtLeast(current.phase, expectedPhase)
      ) {
        return current;
      }

      if (attempt < attempts - 1 && endPollMs > 0) {
        await sleep(endPollMs);
      }
    }

    throw new EnpalError(
      ERROR_CODES.SHEET_WRITE_UNVERIFIED,
      'END phase could not be verified: ' + expectedPhase,
      true
    );
  }

  async function sendEndControl(tabId, sessionId, type, body) {
    await chatgpt.sendControl(tabId, makeControl({
      type,
      sessionId,
      workspaceId: config.id,
      body
    }));
    await chatgpt.waitUntilIdle(tabId);
  }

  async function determineNextLesson(session) {
    const nextLesson = await curriculum.getNextLesson(
      completedSequencesThrough(session.curriculum_sequence)
    );
    if (!nextLesson) {
      throw new EnpalError(
        ERROR_CODES.CONSISTENCY_ERROR,
        'No deterministic next Base Lesson is available',
        false
      );
    }
    return nextLesson;
  }

  async function attemptRenameOnce(tabId, session, knownJournal = null) {
    const recoveryState = knownJournal ?? await journal.read();
    if (recoveryState.renameAttempted === true) return;

    try {
      await chatgpt.renameConversation(
        tabId,
        'EnPal ' + String(session.lesson_id || session.session_id)
      );
    } catch {
      // Rename is best-effort metadata and never changes core completion.
    }

    await journal.write({ renameAttempted: true });
  }

  async function runEndPipeline(session, tabId, knownJournal = null) {
    let current = { ...session };
    let nextLesson = null;
    let stagingVerified = false;

    if (!endPhaseAtLeast(current.phase, 'ANALYZE_COMMITTED')) {
      await sendEndControl(
        tabId,
        current.session_id,
        'ANALYZE',
        [
          'Workspace ID: ' + String(config.id ?? ''),
          'Exact EnPal Database: https://docs.google.com/spreadsheets/d/' +
            config.databaseSpreadsheetId + '/edit',
          'Analyze only pedagogical teacher/learner evidence from this lesson.',
          'Exclude all ENPAL_CONTROL traffic from lesson evidence.',
          'Persist the required ANALYZE result to Session ' +
            current.session_id + '.',
          'Only after the durable result is written, set lifecycle_status=PROCESSING and pipeline_phase=ANALYZE_COMMITTED.'
        ].join('\n')
      );
      current = await verifyEndPhase(current.session_id, 'ANALYZE_COMMITTED');
      await journal.write({ phase: 'ANALYZE_COMMITTED' });
    }

    if (!endPhaseAtLeast(current.phase, 'UPDATE_COMMITTED')) {
      await sendEndControl(
        tabId,
        current.session_id,
        'UPDATE',
        [
          'Use only the verified ANALYZE result from the active Session.',
          'Apply the approved Review Ledger transition rules.',
          'Exact EnPal Database: https://docs.google.com/spreadsheets/d/' +
            config.databaseSpreadsheetId + '/edit',
          'Exact Review Ledger: https://docs.google.com/spreadsheets/d/' +
            config.reviewLedgerSpreadsheetId + '/edit',
          'Verify the Review Ledger write before setting pipeline_phase=UPDATE_COMMITTED.',
          'Keep lifecycle_status=PROCESSING.'
        ].join('\n')
      );
      current = await verifyEndPhase(current.session_id, 'UPDATE_COMMITTED');
      await journal.write({ phase: 'UPDATE_COMMITTED' });
    }

    if (!endPhaseAtLeast(current.phase, 'BRIEF_STAGED')) {
      nextLesson = await determineNextLesson(current);
      await sendEndControl(
        tabId,
        current.session_id,
        'REVIEW_PLANNER',
        [
          'Create the next Session Brief using only these two approved sources.',
          'Exact next Base Lesson: ' + JSON.stringify(nextLesson),
          'Exact Review Ledger: https://docs.google.com/spreadsheets/d/' +
            config.reviewLedgerSpreadsheetId + '/edit',
          'Exact Session Brief Sheet: https://docs.google.com/spreadsheets/d/' +
            config.sessionBriefSpreadsheetId + '/edit',
          'Do not replace or alter the Base Lesson core curriculum identity.',
          'Write the complete next Session Brief to _STAGING only.'
        ].join('\n')
      );

      await briefs.verifyStaging(nextLesson);
      stagingVerified = true;
      current = await sessions.markState(
        current.session_id,
        'PROCESSING',
        { phase: 'BRIEF_STAGED' }
      );
      await journal.write({ phase: 'BRIEF_STAGED' });
    }

    if (
      endPhaseAtLeast(current.phase, 'BRIEF_STAGED') &&
      !endPhaseAtLeast(current.phase, 'BRIEF_PROMOTED') &&
      !stagingVerified
    ) {
      nextLesson = nextLesson ?? await determineNextLesson(current);
      const activeBrief = await briefs.readActive();

      if (activeBrief?.ready === true && sameIdentity(activeBrief, nextLesson)) {
        current = await sessions.markState(
          current.session_id,
          'PROCESSING',
          { phase: 'BRIEF_PROMOTED' }
        );
        await journal.write({ phase: 'BRIEF_PROMOTED' });
      } else {
        await briefs.verifyStaging(nextLesson);
        stagingVerified = true;
      }
    }

    if (!endPhaseAtLeast(current.phase, 'BRIEF_PROMOTED')) {
      await briefs.promoteStaging(briefPromotionRange);
      current = await sessions.markState(
        current.session_id,
        'PROCESSING',
        { phase: 'BRIEF_PROMOTED' }
      );
      await journal.write({ phase: 'BRIEF_PROMOTED' });
    }

    if (!endPhaseAtLeast(current.phase, 'SESSION_COMPLETED')) {
      current = await sessions.markState(
        current.session_id,
        'COMPLETED',
        { phase: 'SESSION_COMPLETED' }
      );
      await journal.write({ phase: 'SESSION_COMPLETED' });
    }

    await attemptRenameOnce(tabId, current, knownJournal);
    await journal.write({ appState: 'READY', status: 'READY' });

    return {
      action: 'READY',
      session: current,
      nextLesson
    };
  }

  async function endCurrent() {
    const activeSessions = await sessions.listActive();
    const session = activeSessions[0];

    if (
      activeSessions.length !== 1 ||
      session?.status !== 'IN_PROGRESS'
    ) {
      throw new EnpalError(
        ERROR_CODES.CONSISTENCY_ERROR,
        'END requires one bound IN_PROGRESS Session',
        false
      );
    }

    const tabId = await openBoundConversation(session);

    await chatgpt.stopVoice(tabId);
    await supervisor.stop();

    let processingSession = await sessions.markState(
      session.session_id,
      'PROCESSING',
      { phase: session.phase || 'CHAT_BOUND' }
    );

    await journal.write({
      appState: 'PROCESSING',
      sessionId: session.session_id,
      chatUrl: session.chat_url,
      phase: processingSession.phase,
      renameAttempted: false
    });

    return runEndPipeline(processingSession, tabId);
  }

  async function resumeProcessingSession(session, knownJournal = null) {
    if (!session) {
      throw new EnpalError(
        ERROR_CODES.CONSISTENCY_ERROR,
        'No Session is available for PROCESSING recovery',
        false
      );
    }

    const recoveryState = knownJournal ?? await journal.read();

    if (
      session.status === 'COMPLETED' &&
      session.phase === 'SESSION_COMPLETED' &&
      recoveryState.renameAttempted === true
    ) {
      await journal.write({ appState: 'READY', status: 'READY' });
      return {
        action: 'READY',
        session,
        nextLesson: null
      };
    }

    if (
      session.status !== 'PROCESSING' &&
      !(session.status === 'COMPLETED' && session.phase === 'SESSION_COMPLETED')
    ) {
      throw new EnpalError(
        ERROR_CODES.CONSISTENCY_ERROR,
        'PROCESSING recovery requires a PROCESSING or completed Session',
        false
      );
    }

    const tabId = await openBoundConversation(session);
    return runEndPipeline(session, tabId, recoveryState);
  }

  async function resumeProcessingCurrent() {
    const recoveryState = await journal.read();
    let session = null;

    if (typeof recoveryState.sessionId === 'string' && recoveryState.sessionId) {
      session = await sessions.getById(recoveryState.sessionId);
    } else {
      const activeSessions = await sessions.listActive();
      session = activeSessions.find((item) => item.status === 'PROCESSING') ?? null;
    }

    return resumeProcessingSession(session, recoveryState);
  }


  async function verifySetupOnly({ interactive = false } = {}) {
    if (!setupGate) {
      return { state: 'READY' };
    }
    return setupGate.verify({ interactive });
  }

  async function inspectCurrent() {
    const setup = await verifySetupOnly({ interactive: false });
    if (setup?.state !== 'READY') {
      return setup;
    }

    const activeSessions = await sessions.listActive();
    const activeBrief = await briefs.readActive();
    const journalState = await journal.read?.() ?? {};

    const activeSession = activeSessions[0];
    if (
      activeSession?.status === 'IN_PROGRESS' &&
      journalState.learningReady !== true
    ) {
      return {
        state: 'ERROR',
        recoverable: true,
        reason: 'An interrupted learning session is waiting for Retry.',
        session: activeSession
      };
    }

    if (
      activeSessions.length === 0 &&
      journalState.appState === 'PROCESSING' &&
      typeof journalState.sessionId === 'string' &&
      journalState.sessionId
    ) {
      return {
        state: 'ERROR',
        recoverable: true,
        reason: 'An incomplete END pipeline is waiting for Retry.'
      };
    }

    const decision = decideRecovery({
      journal: journalState,
      activeSessions,
      activeBrief
    });

    switch (decision.action) {
      case 'CONSISTENCY_ERROR':
        return {
          state: 'ERROR',
          recoverable: false,
          reason: 'More than one active Session exists'
        };
      case 'SETUP_REQUIRED':
        return { state: 'SETUP_REQUIRED', action: 'SETUP_REQUIRED' };
      case 'RECOVER_STARTING':
        return {
          state: 'ERROR',
          recoverable: true,
          reason: 'An incomplete START is waiting for Retry.',
          session: decision.session
        };
      case 'RESUME_PAUSED':
        return {
          state: 'PAUSED',
          action: 'PAUSED',
          session: decision.session
        };
      case 'RESUME_PROCESSING':
        return {
          state: 'ERROR',
          recoverable: true,
          reason: 'An incomplete END pipeline is waiting for Retry.',
          session: decision.session
        };
      case 'READY':
        return decision.session
          ? {
              state: 'LEARNING',
              action: 'ALREADY_IN_PROGRESS',
              session: decision.session
            }
          : { state: 'READY', action: 'READY' };
      default:
        return {
          state: 'ERROR',
          recoverable: false,
          reason: 'Unsupported recovery state: ' + String(decision.action)
        };
    }
  }

  async function recoverCurrent({ interactiveSetup = false } = {}) {
    if (setupGate) {
      const setup = await setupGate.verify({ interactive: interactiveSetup });
      if (setup?.state !== 'READY') {
        return setup;
      }
    }

    const activeSessions = await sessions.listActive();
    const activeBrief = await briefs.readActive();
    const journalState = await journal.read?.() ?? {};

    const activeSession = activeSessions[0];
    if (
      activeSession?.status === 'IN_PROGRESS' &&
      journalState.learningReady !== true
    ) {
      const result = await recoverInProgress(activeSession, activeBrief);
      return { ...result, state: 'LEARNING' };
    }

    if (
      activeSessions.length === 0 &&
      journalState.appState === 'PROCESSING' &&
      typeof journalState.sessionId === 'string' &&
      journalState.sessionId
    ) {
      const referencedSession = await sessions.getById(journalState.sessionId);
      if (
        referencedSession?.status === 'PROCESSING' ||
        (
          referencedSession?.status === 'COMPLETED' &&
          referencedSession?.phase === 'SESSION_COMPLETED'
        )
      ) {
        const result = await resumeProcessingSession(
          referencedSession,
          journalState
        );
        return { ...result, state: 'READY' };
      }
    }

    const decision = decideRecovery({
      journal: journalState,
      activeSessions,
      activeBrief
    });

    switch (decision.action) {
      case 'CONSISTENCY_ERROR':
        throw new EnpalError(
          ERROR_CODES.CONSISTENCY_ERROR,
          'More than one active Session exists',
          false
        );
      case 'SETUP_REQUIRED':
        return { state: 'SETUP_REQUIRED', action: 'SETUP_REQUIRED' };
      case 'RECOVER_STARTING': {
        const result = await recoverStarting(
          decision.session,
          activeBrief,
          decision.journal
        );
        return { ...result, state: 'LEARNING' };
      }
      case 'RESUME_PAUSED':
        return {
          state: 'PAUSED',
          action: 'PAUSED',
          session: decision.session
        };
      case 'RESUME_PROCESSING': {
        const result = await resumeProcessingSession(
          decision.session,
          journalState
        );
        return { ...result, state: 'READY' };
      }
      case 'READY':
        return decision.session
          ? {
              state: 'LEARNING',
              action: 'ALREADY_IN_PROGRESS',
              session: decision.session
            }
          : { state: 'READY', action: 'READY' };
      default:
        throw new Error('Unsupported recovery action: ' + decision.action);
    }
  }

  return {
    async start() {
      const activeSessions = await sessions.listActive();
      const activeBrief = await briefs.readActive();

      const journalState = activeSessions[0]?.status === 'STARTING'
        ? await journal.read()
        : {};

      const decision = decideRecovery({
        journal: journalState,
        activeSessions,
        activeBrief
      });

      switch (decision.action) {
        case 'CONSISTENCY_ERROR':
          throw new EnpalError(
            ERROR_CODES.CONSISTENCY_ERROR,
            'More than one active Session exists',
            false
          );
        case 'SETUP_REQUIRED':
          throw new EnpalError(
            ERROR_CODES.SETUP_REQUIRED,
            'No READY ACTIVE Session Brief is available',
            true
          );
        case 'RECOVER_STARTING':
          return recoverStarting(decision.session, activeBrief, decision.journal);
        case 'RESUME_PAUSED':
          return resumePaused(decision.session, activeBrief);
        case 'RESUME_PROCESSING':
          return resumeProcessingSession(decision.session);
        case 'READY':
          if (decision.session) {
            return {
              action: 'ALREADY_IN_PROGRESS',
              session: decision.session
            };
          }
          return startNew(activeBrief);
        default:
          throw new Error('Unsupported recovery action: ' + decision.action);
      }
    },

    async pause() {
      return pauseCurrent();
    },

    async end() {
      return endCurrent();
    },

    async resumeProcessing() {
      return resumeProcessingCurrent();
    },

    async verifySetup(options) {
      return verifySetupOnly(options);
    },

    async inspect() {
      return inspectCurrent();
    },

    async recover(options) {
      return recoverCurrent(options);
    },

    async confirmPlatformGate() {
      if (typeof setupGate?.confirmPlatformGate !== 'function') {
        throw new EnpalError(
          ERROR_CODES.SETUP_REQUIRED,
          'Platform gate confirmation is unavailable',
          true
        );
      }
      await setupGate.confirmPlatformGate();
      return verifySetupOnly({ interactive: true });
    }
  };
}
