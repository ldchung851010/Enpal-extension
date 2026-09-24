import http from 'node:http';

const VERSION = '0.0.2';
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
    description: 'Authoritative EnPal Session Brief for lesson bootstrap. Call this whenever the learner asks to start, begin, resume, or continue an EnPal lesson. Retrieve and use this brief before teaching.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: READ_ONLY
  },
  {
    name: 'get_pending_supervisor_guidance',
    title: 'Get Pending Supervisor Guidance',
    description: 'Reads an already-created Supervisor decision for one EnPal session. This tool never decides whether supervision is needed. Call it only when explicitly instructed by the EnPal control plane to fetch pending guidance.',
    inputSchema: {
      type: 'object',
      properties: { session_id: { type: 'string', description: 'Exact EnPal session identifier supplied by the control plane.' } },
      required: ['session_id'],
      additionalProperties: false
    },
    annotations: READ_ONLY
  }
]);

function textResult(structuredContent) {
  return { content: [{ type: 'text', text: JSON.stringify(structuredContent) }], structuredContent };
}

function callTool(name, args = {}, guidanceBySession = new Map()) {
  switch (name) {
    case 'enpal_ping': {
      if (typeof args.message !== 'string' || args.message.length === 0) {
        return { isError: true, content: [{ type: 'text', text: 'message must be a non-empty string' }] };
      }
      return textResult({ marker: 'ENPAL_MCP_OK', echo: args.message, server_version: VERSION });
    }
    case 'get_active_brief':
      return textResult({
        marker: 'ENPAL_MCP_BRIEF_OK', curriculum_version: 'mcp-spike-v1', curriculum_sequence: 1,
        lesson_id: 'MCP-SPIKE-L001', primary_skill: 'Speaking',
        communicative_goal: 'Verify that ChatGPT Voice can retrieve a structured EnPal Session Brief through MCP.',
        focus: ['Ask one natural follow-up question after a learner response.'],
        completion_criteria: ['Voice successfully invokes this tool and uses at least one returned field correctly.'],
        mask_policy: 'NONE', review_focus: []
      });
    case 'get_pending_supervisor_guidance': {
      if (typeof args.session_id !== 'string' || args.session_id.length === 0) {
        return { isError: true, content: [{ type: 'text', text: 'session_id must be a non-empty string' }] };
      }
      const guidance = guidanceBySession.get(args.session_id) ?? null;
      return textResult({
        marker: 'ENPAL_MCP_SUPERVISOR_QUEUE_OK',
        session_id: args.session_id,
        pending: guidance !== null,
        guidance
      });
    }
    default:
      return { isError: true, content: [{ type: 'text', text: `Unknown tool: ${name}` }] };
  }
}

function rpcResult(id, result) { return { jsonrpc: '2.0', id, result }; }
function rpcError(id, code, message) { return { jsonrpc: '2.0', id: id ?? null, error: { code, message } }; }
function handleRpc(payload, guidanceBySession) {
  if (!payload || payload.jsonrpc !== '2.0' || typeof payload.method !== 'string') return rpcError(payload?.id, -32600, 'Invalid Request');
  const { id, method, params = {} } = payload;
  if (method === 'initialize') {
    const requested = params?.protocolVersion;
    return rpcResult(id, { protocolVersion: typeof requested === 'string' && requested ? requested : DEFAULT_PROTOCOL_VERSION, capabilities: { tools: {} }, serverInfo: SERVER_INFO, instructions: 'EnPal MCP feasibility spike. All exposed tools are synthetic and read-only.' });
  }
  if (method === 'notifications/initialized') return null;
  if (method === 'ping') return rpcResult(id, {});
  if (method === 'tools/list') return rpcResult(id, { tools: TOOLS });
  if (method === 'tools/call') {
    if (!params || typeof params.name !== 'string') return rpcError(id, -32602, 'Invalid params');
    return rpcResult(id, callTool(params.name, params.arguments ?? {}, guidanceBySession));
  }
  return rpcError(id, -32601, `Method not found: ${method}`);
}
async function readBody(req) { const chunks=[]; for await (const chunk of req) chunks.push(chunk); return Buffer.concat(chunks).toString('utf8'); }
function writeJson(res,status,body){const text=JSON.stringify(body);res.writeHead(status,{'content-type':'application/json; charset=utf-8','content-length':Buffer.byteLength(text),'cache-control':'no-store','access-control-allow-origin':'*','access-control-allow-headers':'content-type, accept, authorization, mcp-protocol-version, mcp-session-id','access-control-allow-methods':'GET, POST, OPTIONS'});res.end(text);}
export function createEnpalMcpServer({ supervisorToken = process.env.SUPERVISOR_SPIKE_TOKEN ?? '' } = {}) {
  const guidanceBySession = new Map();
  return http.createServer(async (req,res)=>{
    const url=new URL(req.url??'/',`http://${req.headers.host??'localhost'}`);
    if(req.method==='OPTIONS'){res.writeHead(204,{'access-control-allow-origin':'*','access-control-allow-headers':'content-type, accept, authorization, mcp-protocol-version, mcp-session-id','access-control-allow-methods':'GET, POST, OPTIONS'});return res.end();}
    if(req.method==='GET'&&url.pathname==='/health')return writeJson(res,200,{ok:true,service:SERVER_INFO.name,version:VERSION});
    if(url.pathname==='/supervisor/enqueue') {
      if(req.method!=='POST') return writeJson(res,405,{error:'method_not_allowed'});
      if(!supervisorToken) return writeJson(res,503,{error:'supervisor_side_channel_disabled'});
      if(req.headers.authorization !== `Bearer ${supervisorToken}`) return writeJson(res,401,{error:'unauthorized'});
      try {
        const raw = await readBody(req);
        const body = JSON.parse(raw || 'null');
        const allowed = new Set(['CONTINUE','NUDGE','CORRECT_COURSE']);
        if(!body || typeof body.session_id !== 'string' || !body.session_id || !allowed.has(body.decision) || typeof body.instruction !== 'string' || !body.instruction) {
          return writeJson(res,400,{error:'invalid_supervisor_guidance'});
        }
        const guidance = {
          decision: body.decision,
          instruction: body.instruction,
          evidence: typeof body.evidence === 'string' ? body.evidence : '',
          queued_at: new Date().toISOString()
        };
        guidanceBySession.set(body.session_id, guidance);
        return writeJson(res,202,{marker:'ENPAL_SUPERVISOR_ENQUEUED',session_id:body.session_id,decision:body.decision});
      } catch(error) {
        return writeJson(res,400,{error:'invalid_json',message:error.message});
      }
    }
    if(url.pathname!=='/mcp')return writeJson(res,404,{error:'not_found'});
    if(req.method==='GET')return writeJson(res,405,rpcError(null,-32000,'SSE stream not enabled in this stateless spike'));
    if(req.method!=='POST')return writeJson(res,405,{error:'method_not_allowed'});
    try{const raw=await readBody(req);const payload=JSON.parse(raw||'null');if(Array.isArray(payload)){const responses=payload.map(item => handleRpc(item, guidanceBySession)).filter(Boolean);return responses.length?writeJson(res,200,responses):res.writeHead(202).end();}const response=handleRpc(payload, guidanceBySession);if(response===null)return res.writeHead(202).end();return writeJson(res,200,response);}catch(error){return writeJson(res,400,rpcError(null,-32700,`Parse error: ${error.message}`));}
  });
}
