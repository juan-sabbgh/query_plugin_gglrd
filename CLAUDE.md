# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Install dependencies
npm install

# Start the server (runs on http://localhost:3000)
node server.js
```

There are no configured tests (`npm test` exits with an error).

## Architecture

The entire application lives in a single file: `server.js`. It is an Express.js API server that:

1. Receives a SQL `SELECT` query and a `graph` type from a client
2. Optionally passes the query through a **Filter agent** (to scope results by user/role)
3. Executes the query against a **PostgreSQL database** (Supabase) via a `pg` connection pool
4. If the query fails, sends it to a **Fixer agent** which returns a corrected SQL and retries
5. Sends the results + original question to a **Summarizer agent** to get a natural language `desc`
6. Returns a JSON response shaped for either chart rendering or markdown display

### Endpoints

| Endpoint | User Role | Summarizer Agent | Extra pre-processing |
|---|---|---|---|
| `POST /api/get_recommendation` | Consultant | `AGENT_KEY` / `AGENT_TOKEN` | Filter agent scopes by consultant |
| `POST /api/get_recommendation_coordinator` | Coordinator | `AGENT_KEY_COORD` | Filter agent scopes by coordinator |
| `POST /api/get_recommendation_director` | Director | `AGENT_KEY_DIRECT` | Enhancer agent improves the SQL |
| `POST /api/get_recommendation_demo` | Demo | `AGENT_KEY_DEMO` | No scoping |

All four endpoints share the same request shape (`{ query, graph, question, function_call_username }`) and response shape.

### Dyna AI Agents (external)

All agent calls go to `https://agents.dyna.ai/openapi/v1/conversation/dialog/` via `getChatSummaryGeneral()`. Credentials are per-agent pairs of `AGENT_TOKEN_*` / `AGENT_KEY_*` env vars:

- **Filter** — rewrites the SQL to scope data to the calling user's name/role
- **Fixer** — auto-repairs a SQL query that threw a PostgreSQL error
- **Debug** — generates a human-readable explanation when a query returns 0 rows
- **Enhancer** — improves/expands the SQL before execution (director endpoint only)
- **Summarizer variants** — one per role (consultant, coordinator, director, demo)

### Response shape

- `type: "chart"` — includes `data`, `raw`, `markdown`, `field_headers`, `chart_type`, `dimension` (+ `metrics` for pie)
- `type: "markdown"` — includes `raw` object, `markdown` string, `desc`

The `desc` field always contains the AI-generated natural language answer. Results are capped at 100 rows before being sent to the AI. Floats are rounded to 2 decimal places. Date columns are normalized to `YYYY-MM-DD`. Only `SELECT` queries are allowed; DDL/DML is blocked by regex before execution.

### Environment variables

All credentials live in `.env`. Required keys: `AS_ACCOUNT`, `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, plus `AGENT_TOKEN_*` / `AGENT_KEY_*` pairs for each agent role listed above.
