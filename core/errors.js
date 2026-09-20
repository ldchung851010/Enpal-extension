export const ERROR_CODES = Object.freeze({
  SETUP_REQUIRED: 'SETUP_REQUIRED',
  CONSISTENCY_ERROR: 'CONSISTENCY_ERROR',
  WRONG_CHAT: 'WRONG_CHAT',
  MASK_REQUIRED: 'MASK_REQUIRED',
  SHEET_READ_FAILED: 'SHEET_READ_FAILED',
  SHEET_WRITE_UNVERIFIED: 'SHEET_WRITE_UNVERIFIED',
  VOICE_START_FAILED: 'VOICE_START_FAILED',
  VOICE_STOP_FAILED: 'VOICE_STOP_FAILED',
  CHAT_UI_UNAVAILABLE: 'CHAT_UI_UNAVAILABLE'
});

export class EnpalError extends Error {
  constructor(code, message, recoverable = false) {
    super(message);
    this.name = 'EnpalError';
    this.code = code;
    this.recoverable = recoverable;
  }
}
