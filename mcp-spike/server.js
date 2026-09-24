import http from 'node:http';

const VERSION = '0.0.1';
const SERVER_INFO = { name: 'enpal-mcp-spike', version: VERSION };
const DEFAULT_PROTOCOL_VERSION = '2026-07-28';

const READ_ONLY = Object.freeze({
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false
});

const TOOLS = Object.freeze([
  {
    name: 'enpal_ping',
    title: 'EnPal Ping',
    description: 'Connectivity probe for EnPal Voice/MCP testing. Echoes a caller-supplied marker and returns ENPAL_MCP_OK.',
    inputSchema: {
      type: 'object',
      properties: { message: { type: 'string', description: 'Short marker to echo back.' } },
      required: ['message'],
      additionalProperties: false
    },
    annotations: READ_ONLY
  },
  {
    name: 'get_active_brief',
    title: 'Get Active EnPal Brief',
    description: 'Returns a fixed synthetic Session Brief used only for the Voice/MCP feasibility spike.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: READ_ONLY
  },
  {
    name: 'get_supervisor_test_instruction',
    title: 'Get Supervisor Test Instruction',
    description: 'Returns a deterministic synthetic supervisor NUDGE for testing whether Voice can consume structured EnPal guidance.',
    inputSchema: {
      type: 'object',
      properties: { observed: { type: 'string', description: 'Short observation about the current learner turn.' } },
      required: ['observed'],
      additionalProperties: false
    },
    annotations: READ_ONLY
  }
]);

function textResult(structuredContent) {
  return {
    content: [{ type: 'text', text: JSON.stringify(structuredContent) }],
    structuredContent
  };
}

function callTool(name, args = {}) {
  switch (name) {
    case 'enpal_ping': {
      if (typeof args.message !== 'string' || args.message.length === 0) {
        return { isError: true, content: [{ type: 'text', text: 'message must be a non-empty string' }] };
      }
      return textResult({ marker: 'ENPAL_MCP_OK', echo: args.message, server_version: VERSION });
    }
    case 'get_active_brief':
      return textResult({
        marker: 'ENPAL_MCP_BRIEF_OK',
        curriculum_version: 'mcp-spike-v1',
        curriculum_sequence: 1,
        lesson_id: 'MCP-SPIKE-L001',
        primary_skill: 'Speaking',
        communicative_goal: 'Verify that ChatGPT Voice can retrieve a structured EnPal Session Brief through MCP.',
        focus: ['Ask one natural follow-up question after a learner response.'],
        completion_criteria: ['Voice successfully invokes this tool and uses at least one returned field correctly.'],
        mask_policy: 'NONE',
        review_focus: []
      });
    case 'get_supervisor_test_instruction': {
      if (typeof args.observed !== 'string' || args.observed.length === 0) {
        return { isError: true, content: [{ type: 'text', text: 'observed must be a non-empty string' }] };
      }
      return textResult({
        marker: 'ENPAL_MCP_SUPERVISOR_OK',
        decision: 'NUDGE',
        instruction: 'Ask one short follow-up question, then give the learner time to answer without adding an explanation.',
        observed: args.observed
      });
    }
    default:
      return { isError: true, content: [{ type: 'text', text: `Unknown tool: ${name}` }] };
  }
}

function rpcResult(id, result) {
  return { jsonrpc: '2.0', id, result };
}

function rpcError(id, code, message) {
  return { jsonrpc: '2.0', id: id ?? null, error: { code, message } };
}

function handleRpc(payload) {
  if (!payload || payload.jsonrpc !== '2.0' || typeof payload.method !== 'string') {
    return rpcError(payload?.id, -32600, 'Invalid Request');
  }
  const { id, method, params = {} } = payload;
  if (method === 'initialize') {
    const requested = params?.protocolVersion;
    return rpcResult(id, {
      protocolVersion: typeof requested === 'string' && requested ? requested : DEFAULT_PROTOCOL_VERSION,
      capabilities: { tools: {} },
      serverInfo: SERVER_INFO,
      instructions: 'EnPal MCP feasibility spike. All exposed tools are synthetic and read-only.'
    });
  }
  if (method === 'notifications/initialized') return null;
  if (method === 'ping') return rpcResult(id, {});
  if (method === 'tools/list') return rpcResult(id, { tools: TOOLS });
  if (method === 'tools/call') {
    if (!params || typeof params.name !== 'string') return rpcError(id, -32602, 'Invalid params');
    return rpcResult(id, callTool(params.name, params.arguments ?? {}));
  }
  return rpcError(id, -32601, `Method not found: ${method}`);
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

function writeJson(res, status, body) {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(text),
    'cache-control': 'no-store',
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'content-type, accept, mcp-protocol-version, mcp-session-id',
    'access-control-allow-methods': 'GET, POST, OPTIONS'
  });
  res.end(text);
}

export function createEnpalMcpServer() {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'access-control-allow-origin': '*',
        'access-control-allow-headers': 'content-type, accept, mcp-protocol-version, mcp-session-id',
        'access-control-allow-methods': 'GET, POST, OPTIONS'
      });
      return res.end();
    }
    if (req.method === 'GET' && url.pathname === '/health') {
      return writeJson(res, 200, { ok: true, service: SERVER_INFO.name, version: VERSION });
    }
    if (url.pathname !== '/mcp') return writeJson(res, 404, { error: 'not_found' });
    if (req.method === 'GET') {
      return writeJson(res, 405, rpcError(null, -32000, 'SSE stream not enabled in this stateless spike'));
    }
    if (req.method !== 'POST') return writeJson(res, 405, { error: 'method_not_allowed' });
    try {
      const raw = await readBody(req);
      const payload = JSON.parse(raw || 'null');
      if (Array.isArray(payload)) {
        const responses = payload.map(handleRpc).filter(Boolean);
        return responses.length ? writeJson(res, 200, responses) : res.writeHead(202).end();
      }
      const response = handleRpc(payload);
      if (response === null) return res.writeHead(202).end();
      return writeJson(res, 200, response);
    } catch (error) {
      return writeJson(res, 400, rpcError(null, -32700, `Parse error: ${error.message}`));
    }
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number.parseInt(process.env.PORT ?? '3000', 10);
  const host = process.env.HOST ?? '0.0.0.0';
  const server = createEnpalMcpServer();
  server.listen(port, host, () => {
    console.log(`enpal-mcp-spike listening on http://${host}:${port}/mcp`);
  });
}
