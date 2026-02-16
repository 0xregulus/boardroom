# Boardroom Architecture (Next.js + PostgreSQL)

## Core Flow

1. `build_decision`
- Fetch decision metadata + body text from PostgreSQL (`decisions`, `decision_documents`).
- Infer governance gates from text.
- Auto-mark inferred governance checks in `decision_governance_checks`.
- Move decision status to `Under Evaluation` or `Incomplete`.

2. `executive_review`
- Run normalized review-agent configs (core agents plus optional custom reviewers).
- Agent runtime config (provider/model/system/user/temperature/max tokens) comes from `agent_configs`, with defaults when no persisted config exists.
- Each agent uses its configured provider client (`OpenAI`, `Anthropic`, `Mistral`, `Meta`).
- Prompt templates are configurable per agent; prompt markdown in `src/prompts/*_v3.md` is used as a fallback.
- When `TAVILY_API_KEY` is configured and `includeExternalResearch` is `true` (default), each review agent runs a Tavily search and receives recent external evidence with source URLs in prompt context.
- LLM output is parsed via JSON fallback extraction and validated with Zod.

3. `synthesize_reviews`
- Chairperson agent produces executive summary and final recommendation.

4. `calculate_dqs`
- DQS is a weighted mean over configured review agents:
  - core weights: `CEO=0.30`, `CFO=0.25`, `CTO=0.25`, `Compliance=0.20`
  - each additional custom reviewer uses weight `0.20`
  - `DQS = SUM(score_i * weight_i) / SUM(weight_i)`

5. gate decision
- `Blocked` if any review blocks.
- `Challenged` if `DQS < 7.0`.
- `Approved` otherwise.

6. `generate_prd` (approved only)
- Build structured PRD sections from decision text + review feedback.

7. `persist_artifacts`
- Upsert executive reviews in `decision_reviews`.
- Upsert chairperson synthesis in `decision_synthesis`.
- Upsert PRD in `decision_prds` when approved.
- Append run record in `workflow_runs`.

## Runtime Surfaces

- Web UI: `/`
- API: `POST /api/workflow/run`
- API: `GET /api/workflow/runs` (decision run history)
- API: `GET /api/strategies`
- API: `GET /api/strategies/:decisionId`
- API: `GET|PUT /api/agent-configs`
- API: `GET /api/health`
- CLI: `npm run workflow`

## Main Code

- `src/workflow/decision_workflow.ts` orchestration
- `src/config/agent_config.ts` normalized/persisted agent config model
- `src/config/llm_providers.ts` provider/model/env-key registry
- `src/llm/client.ts` provider client implementations
- `src/agents/base.ts` agent execution + parsing
- `src/workflow/prd.ts` PRD synthesis helpers
- `src/workflow/gates.ts` governance checks
- `src/store/postgres.ts` PostgreSQL schema + repository functions

## Legacy Archive

- No archived legacy implementation directory is currently tracked in this repository root.
