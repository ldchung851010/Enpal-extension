const KEY = 'enpal_journal_v1';

const DEFAULTS = Object.freeze({
  workflow_state: 'READY',
  pipeline_phase: null,
  active_session_id: null,
  active_lesson_id: null,
  active_chat_url: null,
  active_tab_id: null,
  project_url: null,
  next_session_id: null,
  masked_paused_chat_url: null,
  pending_google_sync: false,
  rename_pending: false,
  last_error: null,
  updated_at: null,
  current_session_pack: null,
  last_known_next_session: null
});

function normalize(value = {}) {
  return { ...DEFAULTS, ...value };
}

export function createLocalJournal(chromeApi = chrome, now = Date.now) {
  async function load() {
    const stored = await chromeApi.storage.local.get(KEY);
    return normalize(stored[KEY]);
  }

  async function replace(next) {
    const value = normalize({ ...next, updated_at: now() });
    await chromeApi.storage.local.set({ [KEY]: value });
    return value;
  }

  async function patch(delta) {
    const current = await load();
    const value = normalize({ ...current, ...delta, updated_at: now() });
    await chromeApi.storage.local.set({ [KEY]: value });
    return value;
  }

  async function checkpoint(pipeline_phase) {
    return patch({ pipeline_phase });
  }

  async function setLastError(last_error) {
    return patch({ last_error });
  }

  async function clearActiveSession() {
    return patch({
      workflow_state: 'READY',
      pipeline_phase: null,
      active_session_id: null,
      active_lesson_id: null,
      active_chat_url: null,
      active_tab_id: null,
      masked_paused_chat_url: null,
      current_session_pack: null,
      last_error: null
    });
  }

  return {
    load,
    replace,
    patch,
    checkpoint,
    setLastError,
    clearActiveSession
  };
}
