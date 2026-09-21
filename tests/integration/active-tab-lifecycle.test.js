import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorkflow } from '../../core/workflow.js';

test('PAUSE reuses the authoritative active tab instead of opening a duplicate chat tab', async () => {
  const chatUrl = 'https://chatgpt.com/g/g-p-A/c/chat-A';
  const session = {
    session_id: 'S-A',
    status: 'IN_PROGRESS',
    phase: 'CHAT_BOUND',
    chat_url: chatUrl,
    primary_skill: 'Speaking'
  };
  const calls = [];
  let journalState = {
    activeTabId: 77,
    sessionId: 'S-A',
    chatUrl,
    status: 'IN_PROGRESS',
    learningReady: true
  };

  const workflow = createWorkflow({
    config: {
      id: 'A',
      projectUrl: 'https://chatgpt.com/g/g-p-A',
      databaseSpreadsheetId: 'database-A'
    },
    journal: {
      async read() {
        calls.push('journal.read');
        return { ...journalState };
      },
      async write(patch) {
        calls.push('journal.write');
        journalState = { ...journalState, ...patch };
        return { ...journalState };
      }
    },
    sessions: {
      async listActive() {
        calls.push('sessions.listActive');
        return [{ ...session }];
      },
      async getById() {
        calls.push('sessions.getById');
        return {
          ...session,
          status: 'PAUSED',
          phase: 'PAUSE_COMMITTED',
          pause_checkpoint: 'checkpoint'
        };
      }
    },
    chatgpt: {
      async getConversationUrl(tabId) {
        calls.push('chatgpt.getConversationUrl:' + tabId);
        assert.equal(tabId, 77);
        return chatUrl;
      },
      async focusTab(tabId) {
        calls.push('chatgpt.focusTab:' + tabId);
      },
      async openConversation() {
        calls.push('chatgpt.openConversation');
        throw new Error('must not open a duplicate tab');
      },
      async stopVoice(tabId) {
        calls.push('chatgpt.stopVoice:' + tabId);
        assert.equal(tabId, 77);
      },
      async sendControl(tabId) {
        calls.push('chatgpt.sendControl:' + tabId);
        assert.equal(tabId, 77);
      }
    },
    mask: {},
    supervisor: {
      stop() {
        calls.push('supervisor.stop');
      }
    },
    pauseVerifyAttempts: 1,
    pausePollMs: 0
  });

  const result = await workflow.pause();

  assert.equal(result.action, 'PAUSED');
  assert.equal(result.tabId, 77);
  assert.equal(calls.includes('chatgpt.openConversation'), false);
  assert.equal(calls.includes('chatgpt.stopVoice:77'), true);
});
