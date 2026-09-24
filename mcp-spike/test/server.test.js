import test from 'node:test';
import assert from 'node:assert/strict';
import { createEnpalMcpServer } from '../server.js';

async function withServer(fn) {
  const server = createEnpalMcpServer({ supervisorToken: 'test-token' });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try { await fn(`http://127.0.0.1:${port}`); }
  finally { await new Promise(resolve => server.close(resolve)); }
}

async function rpc(base, payload) {
  const response = await fetch(`${base}/mcp`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'accept': 'application/json, text/event-stream'
    },
    body: JSON.stringify(payload)
  });
  return { status: response.status, body: await response.json() };
}

test('health endpoint identifies the spike', async () => {
  await withServer(async base => {
    const res = await fetch(`${base}/health`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true, service: 'enpal-mcp-spike', version: '0.0.2' });
  });
});

test('initialize negotiates MCP and advertises tools', async () => {
  await withServer(async base => {
    const { status, body } = await rpc(base, {
      jsonrpc: '2.0', id: 1, method: 'initialize',
      params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'test', version: '1' } }
    });
    assert.equal(status, 200);
    assert.equal(body.result.protocolVersion, '2025-11-25');
    assert.deepEqual(body.result.capabilities, { tools: {} });
    assert.equal(body.result.serverInfo.name, 'enpal-mcp-spike');
  });
});

test('teacher surface exposes ping, active brief, and pending-guidance reader as read-only tools', async () => {
  await withServer(async base => {
    const { body } = await rpc(base, { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
    assert.deepEqual(body.result.tools.map(t => t.name), ['enpal_ping', 'get_active_brief', 'get_pending_supervisor_guidance']);

    const brief = body.result.tools.find(t => t.name === 'get_active_brief');
    assert.match(brief.description, /start/i);
    assert.match(brief.description, /begin/i);
    assert.match(brief.description, /resume/i);
    assert.match(brief.description, /continue/i);
    assert.match(brief.description, /before teaching/i);

    const guidance = body.result.tools.find(t => t.name === 'get_pending_supervisor_guidance');
    assert.match(guidance.description, /already-created/i);
    assert.match(guidance.description, /control plane/i);
    assert.equal(body.result.tools.some(t => t.name === 'get_supervisor_test_instruction'), false);

    for (const tool of body.result.tools) {
      assert.equal(tool.annotations.readOnlyHint, true);
      assert.equal(tool.annotations.destructiveHint, false);
    }
  });
});

test('tools/call returns deterministic ping and active brief payloads', async () => {
  await withServer(async base => {
    const ping = await rpc(base, {
      jsonrpc: '2.0', id: 3, method: 'tools/call',
      params: { name: 'enpal_ping', arguments: { message: 'voice-check-42' } }
    });
    assert.equal(ping.body.result.structuredContent.echo, 'voice-check-42');
    assert.equal(ping.body.result.structuredContent.marker, 'ENPAL_MCP_OK');

    const brief = await rpc(base, {
      jsonrpc: '2.0', id: 4, method: 'tools/call',
      params: { name: 'get_active_brief', arguments: {} }
    });
    assert.equal(brief.body.result.structuredContent.lesson_id, 'MCP-SPIKE-L001');
    assert.equal(brief.body.result.structuredContent.primary_skill, 'Speaking');
  });
});

test('supervisor decision tool is unavailable on the teacher MCP surface', async () => {
  await withServer(async base => {
    const { body } = await rpc(base, {
      jsonrpc: '2.0', id: 5, method: 'tools/call',
      params: { name: 'get_supervisor_test_instruction', arguments: { observed: 'learner hesitated' } }
    });
    assert.equal(body.result.isError, true);
    assert.match(body.result.content[0].text, /unknown tool/i);
  });
});

test('independent supervisor side-channel enqueues guidance by session id and teacher can read it', async () => {
  await withServer(async base => {
    const enqueue = await fetch(`${base}/supervisor/enqueue`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'authorization': 'Bearer test-token' },
      body: JSON.stringify({
        session_id: 'voice-session-1',
        decision: 'NUDGE',
        instruction: 'Ask one shorter question.',
        evidence: 'Learner hesitated.'
      })
    });
    assert.equal(enqueue.status, 202);
    const ack = await enqueue.json();
    assert.equal(ack.marker, 'ENPAL_SUPERVISOR_ENQUEUED');
    assert.equal(ack.session_id, 'voice-session-1');

    const { body } = await rpc(base, {
      jsonrpc: '2.0', id: 6, method: 'tools/call',
      params: { name: 'get_pending_supervisor_guidance', arguments: { session_id: 'voice-session-1' } }
    });
    assert.equal(body.result.structuredContent.marker, 'ENPAL_MCP_SUPERVISOR_QUEUE_OK');
    assert.equal(body.result.structuredContent.pending, true);
    assert.equal(body.result.structuredContent.guidance.decision, 'NUDGE');
    assert.equal(body.result.structuredContent.guidance.instruction, 'Ask one shorter question.');
  });
});

test('side-channel rejects unauthorized writes', async () => {
  await withServer(async base => {
    const res = await fetch(`${base}/supervisor/enqueue`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ session_id: 'x', decision: 'NUDGE', instruction: 'x' })
    });
    assert.equal(res.status, 401);
  });
});

test('pending guidance is isolated by session id', async () => {
  await withServer(async base => {
    await fetch(`${base}/supervisor/enqueue`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'authorization': 'Bearer test-token' },
      body: JSON.stringify({ session_id: 'A', decision: 'CORRECT_COURSE', instruction: 'Return to the lesson focus.' })
    });
    const { body } = await rpc(base, {
      jsonrpc: '2.0', id: 7, method: 'tools/call',
      params: { name: 'get_pending_supervisor_guidance', arguments: { session_id: 'B' } }
    });
    assert.equal(body.result.structuredContent.pending, false);
    assert.equal(body.result.structuredContent.session_id, 'B');
  });
});

test('unknown tool returns an MCP tool error instead of crashing', async () => {
  await withServer(async base => {
    const { body } = await rpc(base, {
      jsonrpc: '2.0', id: 8, method: 'tools/call',
      params: { name: 'does_not_exist', arguments: {} }
    });
    assert.equal(body.result.isError, true);
    assert.match(body.result.content[0].text, /unknown tool/i);
  });
});


test('server.js starts an HTTP server when executed directly', async () => {
  const { spawn } = await import('node:child_process');
  const net = await import('node:net');
  const probe = net.createServer();
  await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
  const { port } = probe.address();
  await new Promise(resolve => probe.close(resolve));

  const child = spawn(process.execPath, ['server.js'], {
    cwd: new URL('..', import.meta.url),
    env: { ...process.env, HOST: '127.0.0.1', PORT: String(port), SUPERVISOR_SPIKE_TOKEN: 'test-token' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  try {
    let ok = false;
    for (let i = 0; i < 20; i += 1) {
      if (child.exitCode !== null) break;
      try {
        const res = await fetch(`http://127.0.0.1:${port}/health`);
        if (res.ok) { ok = true; break; }
      } catch {}
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    assert.equal(ok, true, 'direct execution must keep the server running and serve /health');
  } finally {
    if (child.exitCode === null) {
      child.kill('SIGTERM');
      await new Promise(resolve => child.once('exit', resolve));
    }
  }
});
