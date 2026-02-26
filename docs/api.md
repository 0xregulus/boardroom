# API Reference

## Access and Security Model
- `GET /api/health` is public.
- Other API routes are protected by sensitive-route access rules:
  - loopback requests are allowed.
  - non-loopback requests require `x-boardroom-admin-key` matching `BOARDROOM_ADMIN_KEY`.
- Workflow runs also enforce policy-based approvals for certain modes via `x-boardroom-run-approval`.

## Endpoints

### POST `/api/workflow/run`
Runs one decision or all proposed decisions.

Request body:
- `decisionId?: string`
- `modelName?: string`
- `temperature?: number` (`0..1`)
- `maxTokens?: number` (`256..8000`)
- `interactionRounds?: number` (`0..3`)
- `includeRedTeamPersonas?: boolean` (default `false`, adds pre-mortem + resource-competition reviewers)
- `agentConfigs?: AgentConfig[]`
- `includeExternalResearch?: boolean` (default `false`)
- `includeSensitive?: boolean` (default `false`, returns redacted preview when false)

Behavior:
- with `decisionId`: single-run mode
- without `decisionId`: bulk run over `Proposed` decisions

### GET `/api/workflow/runs?decisionId=<id>&limit=<n>`
Returns run history for one decision.

Query params:
- `decisionId` required
- `limit` optional (`1..100`, default `20`)

Response:
- `runs[]` with `id`, `decision_id`, `dqs`, `gate_decision`, `workflow_status`, `state_preview`, `created_at`

### GET `/api/strategies`
Returns strategy list from PostgreSQL.

### GET `/api/strategies/:decisionId`
Returns one strategy with resolved artifact sections when available.

### GET `/api/agent-configs`
Returns persisted agent configs or normalized defaults.

Query params:
- `includeSensitive=true` includes raw prompt text
- default response redacts prompt text fields

### PUT `/api/agent-configs`
Persists normalized agent configs.

Request body:
- `agentConfigs: AgentConfig[]`

### POST `/api/socratic/validate-substance`
Semantic mitigation validator used by the governance gate.

Request body:
- `riskTitle: string` (`3..220` chars)
- `riskDescription: string` (`3..500` chars)
- `mitigationText: string` (`10..2000` chars)

Response body:
- `substanceScore: number` (`0..1`)
- `approved: boolean`
- `feedback: string`

Operational contract:
- Used to reject superficial mitigations that are not causally tied to the risk.
- Typical acceptance threshold in UX flow: `substanceScore >= 0.7` and `approved = true`.

### POST `/api/socratic/validate`
Binary mitigation validator used for tactical acceptance checks.

Request body:
- `riskTitle: string`
- `riskDescription: string`
- `mitigationText: string`
- `riskLevel?: "Critical" | "Warning"`

Response body:
- `approved: boolean`
- `feedback: string`

### POST `/api/socratic/observe`
Runs Socratic observation and returns structured governance feedback for drafts.

### GET `/api/health`
Checks API and PostgreSQL connectivity.
