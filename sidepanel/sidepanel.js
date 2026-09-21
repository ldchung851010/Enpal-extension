import { getSidePanelView } from './view-model.js';

const ACTION_BUTTONS = Object.freeze({
  SETUP: 'setup-action',
  START: 'start-action',
  PAUSE: 'pause-action',
  END: 'end-action',
  RETRY: 'retry-action'
});

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

export function createSidePanelController({ workflow, documentRef = document }) {
  let currentState = 'SETUP_REQUIRED';
  let recoverable = false;

  function render() {
    const view = getSidePanelView(currentState, recoverable);
    documentRef.documentElement.dataset.enpalState = view.state;

    const status = documentRef.getElementById('status');
    if (status) status.textContent = view.message;

    const allowed = new Set(view.actions);
    for (const [action, id] of Object.entries(ACTION_BUTTONS)) {
      const button = documentRef.getElementById(id);
      if (!button) continue;
      const visible = allowed.has(action);
      button.hidden = !visible;
      button.disabled = !visible;
    }
  }

  async function invoke(action) {
    try {
      let result;
      switch (action) {
        case 'SETUP':
          result = await workflow.recover({ interactiveSetup: true });
          break;
        case 'START':
          result = await workflow.start();
          break;
        case 'PAUSE':
          result = await workflow.pause();
          break;
        case 'END':
          result = await workflow.end();
          break;
        case 'RETRY':
          result = await workflow.recover();
          break;
        default:
          return;
      }

      currentState = learnerStateFromResult(action, result);
      recoverable = false;
    } catch (error) {
      currentState = 'ERROR';
      recoverable = error?.recoverable === true;
    }

    render();
  }

  for (const [action, id] of Object.entries(ACTION_BUTTONS)) {
    const button = documentRef.getElementById(id);
    button?.addEventListener('click', () => invoke(action));
  }

  render();

  return {
    render,
    invoke
  };
}

if (typeof document !== 'undefined') {
  const workflow = globalThis.EnPalWorkflow;
  if (workflow) {
    createSidePanelController({ workflow, documentRef: document });
  } else {
    const view = getSidePanelView('SETUP_REQUIRED', false);
    document.documentElement.dataset.enpalState = view.state;
    const status = document.getElementById('status');
    if (status) status.textContent = view.message;

    const allowed = new Set(view.actions);
    for (const [action, id] of Object.entries(ACTION_BUTTONS)) {
      const button = document.getElementById(id);
      if (!button) continue;
      const visible = allowed.has(action);
      button.hidden = !visible;
      button.disabled = !visible;
    }
  }
}
