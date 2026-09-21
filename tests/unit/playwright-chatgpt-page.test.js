import test from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeUrl,
  projectIdentityPath,
  isAnyConversationUrl,
  isConversationInsideProject,
  isProjectNewChatSurface
} from '../../playwright/chatgpt-page.js';

const projectRoot = 'https://chatgpt.com/g/g-p-enpal';
const projectRoute = projectRoot + '/project';

test('normalizeUrl removes hash and trailing slash', () => {
  assert.equal(
    normalizeUrl(projectRoute + '/#hello'),
    projectRoute
  );
});

test('projectIdentityPath strips the UI-only /project suffix', () => {
  assert.equal(projectIdentityPath(projectRoute), '/g/g-p-enpal');
  assert.equal(projectIdentityPath(projectRoot), '/g/g-p-enpal');
});

test('recognizes a conversation inside a Project whose UI URL ends in /project', () => {
  assert.equal(
    isConversationInsideProject(
      projectRoot + '/c/abc123',
      projectRoute
    ),
    true
  );

  assert.equal(
    isConversationInsideProject(
      'https://chatgpt.com/c/abc123',
      projectRoute
    ),
    false
  );

  assert.equal(
    isConversationInsideProject(
      'https://chatgpt.com/g/g-p-other/c/abc123',
      projectRoute
    ),
    false
  );
});

test('recognizes global conversation URLs', () => {
  assert.equal(isAnyConversationUrl('https://chatgpt.com/c/abc123'), true);
  assert.equal(isAnyConversationUrl(projectRoute), false);
});

test('recognizes the /project new-chat surface', () => {
  assert.equal(isProjectNewChatSurface(projectRoute, projectRoute), true);
  assert.equal(isProjectNewChatSurface(projectRoot, projectRoute), true);
  assert.equal(
    isProjectNewChatSurface(projectRoot + '/c/abc123', projectRoute),
    false
  );
});

test('does not mistake another Project for the configured Project surface', () => {
  assert.equal(
    isProjectNewChatSurface(
      'https://chatgpt.com/g/g-p-other/project',
      projectRoute
    ),
    false
  );
});
