import { APP_STATES } from '../core/state.js';
import { runTask3LiveProbe } from '../tests/live/task3-live-probe.js';

document.documentElement.dataset.enpalState = APP_STATES[0];

const button = document.getElementById('task3-probe-action');
const result = document.getElementById('task3-probe-result');

button?.addEventListener('click', async () => {
  button.disabled = true;
  result.textContent = 'RUNNING...';

  try {
    const evidence = await runTask3LiveProbe();
    result.textContent = [
      'TASK 3 LIVE: PASS',
      'Extension ID: ' + evidence.extensionId,
      'OAuth: PASS',
      'Curriculum read: PASS',
      'Database write/read: PASS',
      'Temporary sheet cleanup: PASS'
    ].join('\n');
  } catch (error) {
    result.textContent = [
      'TASK 3 LIVE: FAIL',
      error?.message || String(error)
    ].join('\n');
  } finally {
    button.disabled = false;
  }
});
