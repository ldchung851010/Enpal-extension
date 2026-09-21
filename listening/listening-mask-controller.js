import { EnpalError, ERROR_CODES } from '../core/errors.js';

export function createListeningMaskController(chatGptAdapter) {
  return {
    async arm(tabId) {
      const result = await chatGptAdapter.setListeningMask(tabId, true);
      if (result?.ok !== true || result?.armed !== true) {
        throw new EnpalError(
          ERROR_CODES.MASK_REQUIRED,
          'Required Listening Mask could not be confirmed',
          true
        );
      }
      return { armed: true };
    },

    async disarm(tabId) {
      const result = await chatGptAdapter.setListeningMask(tabId, false);
      if (result?.ok !== true || result?.armed !== false) {
        throw new EnpalError(
          ERROR_CODES.CHAT_UI_UNAVAILABLE,
          'Listening Mask could not be removed',
          true
        );
      }
      return { armed: false };
    }
  };
}
