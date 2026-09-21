export function decideRecovery({
  journal = {},
  activeSessions = [],
  activeBrief = null
} = {}) {
  if (!Array.isArray(activeSessions)) {
    throw new TypeError('activeSessions must be an array');
  }

  if (activeSessions.length > 1) {
    return { action: 'CONSISTENCY_ERROR' };
  }

  const active = activeSessions[0];

  if (!active) {
    return activeBrief?.ready === true
      ? { action: 'READY' }
      : { action: 'SETUP_REQUIRED' };
  }

  if (active.status === 'STARTING') {
    return {
      action: 'RECOVER_STARTING',
      session: active,
      journal
    };
  }

  if (active.status === 'PAUSED') {
    return {
      action: 'RESUME_PAUSED',
      session: active
    };
  }

  if (active.status === 'PROCESSING') {
    return {
      action: 'RESUME_PROCESSING',
      session: active
    };
  }

  return {
    action: 'READY',
    session: active
  };
}
