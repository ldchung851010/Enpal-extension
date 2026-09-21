import { getSidePanelView } from './view-model.js';
import {
  createRuntimeWorkflow,
  DEFAULT_WORKSPACE
} from './runtime.js';
import {
  createWorkspaceRegistry,
  isWorkspaceRuntimeReady
} from '../storage/workspace-registry.js';
import { createWorkspaceManager } from './workspace-manager.js';

const ACTION_BUTTONS = Object.freeze({
  SETUP: 'setup-action',
  CONFIRM_PLATFORM: 'confirm-platform-action',
  START: 'start-action',
  PAUSE: 'pause-action',
  END: 'end-action',
  RETRY: 'retry-action'
});

const CORE_LEARNER_ACTIONS = new Set(['START', 'PAUSE', 'END']);

function learnerStateFromResult(action, result) {
  if (typeof result?.state === 'string') return result.state;

  if (action === 'START') {
    if (['STARTED', 'RESUMED', 'RECOVERED_START', 'ALREADY_IN_PROGRESS'].includes(result?.action)) {
      return 'LEARNING';
    }
    if (result?.action === 'READY') return 'READY';
  }

  if (action === 'PAUSE' && result?.action === 'PAUSED') return 'PAUSED';
  if (action === 'END' && result?.action === 'READY') return 'READY';

  return 'ERROR';
}

export function createSidePanelController({
  workflow,
  documentRef = document,
  onStateChange = () => {}
}) {
  let currentState = 'SETUP_REQUIRED';
  let recoverable = false;
  let diagnostic = '';

  function render() {
    const view = getSidePanelView(currentState, recoverable);
    documentRef.documentElement.dataset.enpalState = view.state;
    onStateChange(view.state);

    const status = documentRef.getElementById('status');
    if (status) {
      status.textContent = diagnostic
        ? view.message + ' ' + diagnostic
        : view.message;
    }

    const allowed = new Set(view.actions);
    for (const [action, id] of Object.entries(ACTION_BUTTONS)) {
      const button = documentRef.getElementById(id);
      if (!button) continue;
      const enabled = allowed.has(action);

      if (CORE_LEARNER_ACTIONS.has(action)) {
        button.hidden = false;
        button.disabled = !enabled;
        continue;
      }

      button.hidden = !enabled;
      button.disabled = !enabled;
    }
  }

  function applyFailure(error, action = null) {
    currentState = action === 'SETUP' ? 'SETUP_REQUIRED' : 'ERROR';
    recoverable = action === 'SETUP' ? false : error?.recoverable === true;
    diagnostic = error?.message || 'Unknown error';
    render();
  }

  function applyResult(action, result) {
    currentState = learnerStateFromResult(action, result);
    recoverable = false;
    diagnostic = typeof result?.reason === 'string' ? result.reason : '';
    render();
  }

  async function invoke(action) {
    try {
      let result;
      switch (action) {
        case 'SETUP':
          result = await workflow.verifySetup({ interactive: true });
          break;
        case 'CONFIRM_PLATFORM':
          result = await workflow.confirmPlatformGate();
          break;
        case 'START':
          result = await workflow.start();
          break;
        case 'PAUSE':
          result = await workflow.pause();
          break;
        case 'END':
          currentState = 'PROCESSING';
          recoverable = false;
          diagnostic = '';
          render();
          result = await workflow.end();
          break;
        case 'RETRY':
          result = await workflow.recover();
          break;
        default:
          return;
      }

      applyResult(action, result);
    } catch (error) {
      applyFailure(error, action);
    }
  }

  async function initialize() {
    try {
      const result = await workflow.inspect();
      currentState = typeof result?.state === 'string'
        ? result.state
        : learnerStateFromResult('RETRY', result);
      recoverable = result?.recoverable === true;
      diagnostic = typeof result?.reason === 'string' ? result.reason : '';
      render();
      return result;
    } catch (error) {
      applyFailure(error);
      return null;
    }
  }

  for (const [action, id] of Object.entries(ACTION_BUTTONS)) {
    const button = documentRef.getElementById(id);
    button?.addEventListener('click', () => invoke(action));
  }

  render();

  return {
    render,
    invoke,
    initialize
  };
}

export async function bootstrapSidePanel({
  chromeApi = chrome,
  documentRef = document,
  fetchImpl = fetch,
  registry = null,
  workflowFactory = createRuntimeWorkflow,
  workspaceManagerFactory = createWorkspaceManager,
  reload = () => globalThis.location?.reload()
} = {}) {
  const workspaceRegistry = registry ?? createWorkspaceRegistry(
    chromeApi,
    { defaultWorkspace: DEFAULT_WORKSPACE }
  );
  const activeWorkspace = await workspaceRegistry.ensureInitialized();
  if (!activeWorkspace) {
    throw new Error('At least one EnPal workspace is required');
  }

  const workspaceManager = workspaceManagerFactory({
    registry: workspaceRegistry,
    documentRef,
    activeWorkspace,
    reload
  });

  await workspaceManager.initialize();

  const workflow = isWorkspaceRuntimeReady(activeWorkspace)
    ? workflowFactory({
        chromeApi,
        fetchImpl,
        workspace: activeWorkspace
      })
    : {
        async verifySetup() {
          return {
            state: 'SETUP_REQUIRED',
            reason: 'Complete workspace setup before starting a lesson.'
          };
        },
        async inspect() {
          return {
            state: 'SETUP_REQUIRED',
            reason: 'Complete workspace setup before starting a lesson.'
          };
        },
        async recover() {
          return {
            state: 'SETUP_REQUIRED',
            reason: 'Complete workspace setup before starting a lesson.'
          };
        },
        async confirmPlatformGate() {
          return {
            state: 'SETUP_REQUIRED',
            reason: 'Complete workspace setup before starting a lesson.'
          };
        },
        async start() {
          throw new Error('Complete workspace setup before starting a lesson.');
        },
        async pause() {
          throw new Error('Complete workspace setup before starting a lesson.');
        },
        async end() {
          throw new Error('Complete workspace setup before starting a lesson.');
        }
      };

  const controller = createSidePanelController({
    workflow,
    documentRef,
    onStateChange(state) {
      if (typeof workspaceManager.setLearnerState === 'function') {
        workspaceManager.setLearnerState(state);
        return;
      }
      workspaceManager.setLocked?.(
        state === 'LEARNING' || state === 'PROCESSING'
      );
    }
  });
  await controller.initialize();

  return {
    activeWorkspace,
    workspaceManager,
    controller,
    workflow
  };
}

if (typeof document !== 'undefined' && typeof chrome !== 'undefined') {
  bootstrapSidePanel().catch((error) => {
    const status = document.getElementById('status');
    if (status) {
      status.textContent =
        'EnPal needs attention before continuing. ' +
        (error?.message || String(error));
    }
  });
}
