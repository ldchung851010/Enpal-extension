import test from 'node:test';
import assert from 'node:assert/strict';
import { createEnpalMcpServer } from '../server.js';

async function withServer(fn) {
  const server = createEnpalMcpServer();
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
    assert.deepEqual(await res.json(), { ok: true, service: 'enpal-mcp-spike', version: '0.0.1' });
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

test('tools/list exposes exactly the three read-only spike tools', async () => {
  await withServer(async base => {
    const { body } = await rpc(base, { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
    assert.deepEqual(body.result.tools.map(t => t.name), [
      'enpal_ping',
      'get_active_brief',
      'get_supervisor_test_instruction'
    ]);
    for (const tool of body.result.tools) {
      assert.equal(tool.annotations.readOnlyHint, true);
      assert.equal(tool.annotations.destructiveHint, false);
    }
  });
});

test('tools/call returns deterministic EnPal test payloads', async () => {
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

    const supervisor = await rpc(base, {
      jsonrpc: '2.0', id: 5, method: 'tools/call',
      params: { name: 'get_supervisor_test_instruction', arguments: { observed: 'learner hesitated' } }
    });
    assert.equal(supervisor.body.result.structuredContent.decision, 'NUDGE');
    assert.match(supervisor.body.result.structuredContent.instruction, /one short follow-up/i);
  });
});

test('unknown tool returns an MCP tool error instead of crashing', async () => {
  await withServer(async base => {
    const { body } = await rpc(base, {
      jsonrpc: '2.0', id: 6, method: 'tools/call',
      params: { name: 'does_not_exist', arguments: {} }
    });
    assert.equal(body.result.isError, true);
    assert.match(body.result.content[0].text, /unknown tool/i);
  });
});
