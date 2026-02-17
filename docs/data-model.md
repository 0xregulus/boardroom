# Data Model


Tables are created automatically from `src/store/postgres.ts` on first database access.

```mermaid
erDiagram
    DECISIONS ||--|| DECISION_DOCUMENTS : "Has Body Text"
    DECISIONS ||--o{ DECISION_GOVERNANCE_CHECKS : "Has Gates"
    DECISIONS ||--o{ DECISION_REVIEWS : "Has Reviews"
    DECISIONS ||--o{ DECISION_SYNTHESIS : "Has Summary"
    DECISIONS ||--o| DECISION_PRDS : "Generates PRD"
    DECISIONS ||--o{ WORKFLOW_RUNS : "Has History"

    DECISIONS {
        uuid id PK
        text name
        text status
        float8 dqs
    }
    DECISION_REVIEWS {
        uuid decision_id FK
        text agent_name
        float8 score
        jsonb structured_review
    }
    WORKFLOW_RUNS {
        uuid id PK
        uuid decision_id FK
        float8 dqs
        text gate_decision
        jsonb run_state
    }
    AGENT_CONFIGS {
        text agent_name PK
        text provider
        text model
        jsonb config
    }
```


## Core Decision Tables
- `decisions`
  - Strategic decision metadata (`id`, `name`, `status`, owner/date/summary + scoring context fields).
- `decision_documents`
  - One document body per decision (`decision_id`, `body_text`).
- `decision_governance_checks`
  - Governance gate flags per decision (`decision_id`, `gate_name`, `is_checked`).

## Workflow Output Tables
- `decision_reviews`
  - One row per decision/agent with normalized review output fields.
- `decision_synthesis`
  - Chairperson summary and recommendation.
- `decision_prds`
  - Generated PRD output for approved decisions.
- `workflow_runs`
  - Immutable run history records with DQS, gate decision, workflow status, and state snapshot.

## Runtime Support Tables
- `agent_configs`
  - Persisted runtime agent configurations used by review workflow.
- `rate_limits`
  - Rate-limiter buckets for API protection when PostgreSQL backend is enabled.
