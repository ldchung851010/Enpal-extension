# EnPal Voice MCP Spike

Throwaway feasibility spike for testing ChatGPT Voice -> remote MCP.

## Scope

Read-only, synthetic, stateless. No Google Sheets writes and no EnPal runtime mutation.

Tools:
- `enpal_ping`
- `get_active_brief`
- `get_supervisor_test_instruction`

Run:

```bash
npm test
npm start
```

MCP endpoint: `POST /mcp`
Health endpoint: `GET /health`
