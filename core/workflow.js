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

function buildTeachingControl({
  type,
  sessionId,
  config,
  brief,
  checkpoint = false
}) {
  const method = teachingMethodFor(config, brief);
  const lines = [
    `Teacher Role: ${config.teacherRoleUrl}`,
    `Teaching Method (${method.name}): ${method.url}`,
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
    createSessionId = createDefaultSessionId
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
    await chatgpt.waitUntilIdle(tabId);

    let boundSession = session;
    if (bindUrl === null && !session.chat_url) {
      const capturedUrl = await chatgpt.getConversationUrl(tabId);
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
          return {
            action: 'RESUME_PROCESSING',
            session: decision.session
          };
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
    }
  };
}
