import { APP_STATES } from '../core/state.js';
import { connectGoogle } from './google-connect.js';

document.documentElement.dataset.enpalState = APP_STATES[0];

const status = document.querySelector('#status');
const connectButton = document.querySelector('#connect-google');

connectButton?.addEventListener('click', async () => {
  connectButton.disabled = true;
  status.textContent = 'Connecting Google...';
  try {
    await connectGoogle();
    status.textContent = 'Google connected';
  } catch (error) {
    status.textContent = `Google connection failed: ${error?.message || 'unknown error'}`;
  } finally {
    connectButton.disabled = false;
  }
});
