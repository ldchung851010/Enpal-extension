import test from 'node:test';
import assert from 'node:assert/strict';
import { createListeningMaskController } from '../../listening/listening-mask-controller.js';

test('arm confirms protected state before START can continue', async () => {
  const adapter = {
    async setListeningMask() {
      return { ok: true, armed: true };
    }
  };
  const mask = createListeningMaskController(adapter);
  assert.deepEqual(await mask.arm(4), { armed: true });
});

test('required mask failure is surfaced as MASK_REQUIRED', async () => {
  const adapter = {
    async setListeningMask() {
      return { ok: false, armed: false };
    }
  };
  const mask = createListeningMaskController(adapter);
  await assert.rejects(mask.arm(4), (error) => error.code === 'MASK_REQUIRED');
});

test('pause does not disarm the mask', async () => {
  const calls = [];
  const adapter = {
    async setListeningMask(tabId, armed) {
      calls.push({ tabId, armed });
      return { ok: true, armed };
    }
  };
  const mask = createListeningMaskController(adapter);
  await mask.arm(4);
  assert.deepEqual(calls, [{ tabId: 4, armed: true }]);
});

test('disarm requires a confirmed unmasked state', async () => {
  const calls = [];
  const adapter = {
    async setListeningMask(tabId, armed) {
      calls.push({ tabId, armed });
      return { ok: true, armed };
    }
  };
  const mask = createListeningMaskController(adapter);
  assert.deepEqual(await mask.disarm(4), { armed: false });
  assert.deepEqual(calls, [{ tabId: 4, armed: false }]);
});
