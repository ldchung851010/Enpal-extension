function requiredToken(value, name) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(name + ' is required');
  }
  if (/[
]/.test(value)) {
    throw new TypeError(name + ' must be a single-line token');
  }
  return value.trim();
}

export function makeControl({ type, sessionId, workspaceId = null, body }) {
  const lines = [
    'ENPAL_CONTROL',
    'type=' + requiredToken(type, 'type'),
    'session_id=' + requiredToken(sessionId, 'sessionId')
  ];

  if (workspaceId != null && String(workspaceId).trim() !== '') {
    lines.push(
      'workspace_id=' + requiredToken(String(workspaceId), 'workspaceId')
    );
  }

  lines.push(
    'BEGIN_BODY',
    String(body ?? ''),
    'END_BODY',
    'END_ENPAL_CONTROL'
  );

  return lines.join('\n');
}

export function isEnpalControl(text) {
  return typeof text === 'string' && text.startsWith('ENPAL_CONTROL\n');
}
