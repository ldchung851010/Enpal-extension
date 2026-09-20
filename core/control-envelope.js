export function makeControl({ type, sessionId, body }) {
  return [
    'ENPAL_CONTROL',
    `type=${type}`,
    `session_id=${sessionId}`,
    'BEGIN_BODY',
    body,
    'END_BODY',
    'END_ENPAL_CONTROL'
  ].join('\n');
}

export function isEnpalControl(text) {
  return typeof text === 'string' && text.startsWith('ENPAL_CONTROL\n');
}
