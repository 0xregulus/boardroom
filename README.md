# Boardroom

This repository runs as a **Next.js + TypeScript** project.

It executes a multi-agent boardroom workflow that:
1. Pulls proposed strategic decisions from PostgreSQL.
2. Runs configurable executive reviews (default: CEO/CFO/CTO/Compliance, plus optional custom reviewers) with provider-specific LLM clients (OpenAI, Anthropic, Mistral, Meta).
3. Synthesizes with a Chairperson summary.
4. Computes DQS and applies the approval gate.
5. Persists reviews, synthesis, PRDs, and run history in PostgreSQL.

## Stack

- Next.js (Pages Router)
- TypeScript
- OpenAI Node SDK + provider HTTP clients
- PostgreSQL (`pg`)
- Zod

## Project Structure

- `src/agents/*` executive and chairperson agents
- `src/config/llm_providers.ts` provider/model/api-key registry
- `src/config/agent_config.ts` default/normalized agent configuration model
- `src/llm/client.ts` provider-agnostic LLM client layer
- `src/store/postgres.ts` PostgreSQL schema + repository helpers
- `src/schemas/*` workflow contracts and validation
- `src/workflow/*` orchestration, gates, states, PRD builder
- `src/prompts/*` agent prompt templates
- `src/runner.ts` CLI entrypoint

## Setup

Create a `.env` file:

```bash
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
MISTRAL_API_KEY=
META_API_KEY=
POSTGRES_URL=
```

Optional:

```bash
BOARDROOM_PROVIDER=OpenAI
BOARDROOM_MODEL=gpt-4o-mini
MISTRAL_BASE_URL=
META_BASE_URL=
TAVILY_API_KEY=
```

When `TAVILY_API_KEY` is set, executive review agents automatically run a Tavily web-research pass and receive cited external snippets in their prompt context.

## Install

```bash
npm install
```

## Database Schema

The app automatically initializes required tables on first DB access from `src/store/postgres.ts`.

Core tables:
- `decisions`
- `decision_documents`
- `decision_governance_checks`
- `decision_reviews`
- `decision_synthesis`
- `decision_prds`
- `workflow_runs`
- `agent_configs`

## Run (Web)

```bash
npm run dev
```

Open `http://localhost:3000` and run either:
- one decision by ID, or
- all decisions in `Proposed` status.

## Run (CLI)

Single decision:

```bash
npm run workflow -- --decision-id <DECISION_ID>
```

All proposed decisions:

```bash
npm run workflow
```

## API

- `POST /api/workflow/run`
  - body with `decisionId` runs a single decision
  - empty body runs all proposed decisions
  - body flag `includeExternalResearch` (boolean, default `true`) toggles Tavily research per run
- `GET /api/workflow/runs?decisionId=<id>&limit=<n>`
  - returns run history for one decision (limit defaults to `20`, max `100`)
- `GET /api/strategies`
  - returns strategy rows from PostgreSQL
- `GET /api/strategies/:decisionId`
  - returns one strategy, with resolved artifact sections when available
- `GET /api/agent-configs`
  - returns persisted agent configs, or normalized defaults when none are saved
- `PUT /api/agent-configs`
  - persists normalized agent configs used by workflow runs
- `GET /api/health`
  - checks API and DB connectivity

## Next steps
- Add vector DB for use previous decisions and reviews as context.
- Add assitant that help to create the strategic decisions document.
