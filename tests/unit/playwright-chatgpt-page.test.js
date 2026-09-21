import test from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeUrl,
  isAnyConversationUrl,
  isConversationInsideProject,
  isProjectNewChatSurface
} from '../../playwright/chatgpt-page.js';

const project = 'https://chatgpt.com/g/g-p-enpal';

test('normalizeUrl removes hash and trailing slash', () => {
  assert.equal(
    normalizeUrl('https://chatgpt.com/g/g-p-enpal/#hello'),
    project
  );
});

test('recognizes a conversation only when it is inside the configured Project', () => {
  assert.equal(
    isConversationInsideProject(
      'https://chatgpt.com/g/g-p-enpal/c/abc123',
      project
    ),
    true
  );

  assert.equal(
    isConversationInsideProject(
      'https://chatgpt.com/c/abc123',
      project
    ),
    false
  );

  assert.equal(
    isConversationInsideProject(
      'https://chatgpt.com/g/g-p-other/c/abc123',
      project
    ),
    false
  );
});

test('recognizes global conversation URLs', () => {
  assert.equal(isAnyConversationUrl('https://chatgpt.com/c/abc123'), true);
  assert.equal(isAnyConversationUrl(project), false);
});

test('recognizes Project new-chat surface but not an existing Project conversation', () => {
  assert.equal(isProjectNewChatSurface(project, project), true);
  assert.equal(
    isProjectNewChatSurface(project + '/c/abc123', project),
    false
  );
});
