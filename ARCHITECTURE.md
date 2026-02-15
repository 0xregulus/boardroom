# Boardroom Architecture

## Core Components

1. Decision Intake
- Source: Notion Strategic Decisions database.
- The workflow reads one `Proposed` decision page and its page body.

2. Executive Review Agents
- Files: `app/agents/ceo.py`, `app/agents/cfo.py`, `app/agents/cto.py`, `app/agents/compliance.py`
- Each agent returns structured JSON mapped to `ReviewOutput`.
- Current execution order is sequential inside one workflow node.

3. Chairperson Synthesis
- File: `app/agents/chairperson.py`
- Synthesizes executive reviews into:
  - `executive_summary`
  - `final_recommendation` (`Approved|Challenged|Blocked`)
  - `conflicts`, `blockers`, `required_revisions`

4. PRD Builder
- File: `app/workflow/decision_workflow.py` (`_build_prd_output`, `_prd_children`)
- Produces structured `PRDOutput` and renders a Notion-friendly PRD page body.

## Orchestration

- File: `app/workflow/decision_workflow.py`
- Runtime: LangGraph `StateGraph`

Execution flow:
1. `build_decision` (fetch Notion page + infer governance checks)
2. `executive_review` (CEO/CFO/CTO/Compliance)
3. `synthesize_reviews` (Chairperson)
4. `calculate_dqs`
5. gate:
   - `approved` -> `generate_prd`
   - `revision_required` -> `persist_artifacts`
   - `blocked` -> `persist_artifacts`
6. `persist_artifacts` (Notion upserts for reviews and optional PRD)

## Decision Quality Score

`DQS = CEO*0.30 + CFO*0.25 + CTO*0.25 + Compliance*0.20`

Gate rules:
- If any executive review is blocked -> `Blocked`
- Else if `DQS < 7.0` -> `Challenged`
- Else -> `Approved`

## Governance Gate Evaluation

- File: `app/workflow/gates.py`
- Required typed fields:
  - `Baseline` (number)
  - `Target` (number)
  - `Time Horizon` (select)
- Required boolean gates:
  - `Strategic Alignment Brief`
  - `Problem Quantified`
  - `≥3 Options Evaluated`
  - `Success Metrics Defined`
  - `Leading Indicators Defined`
  - `Kill Criteria Defined`
- Checks can be satisfied by either:
  - explicit checkbox properties on the page, or
  - inferred signals from decision body text.

## Notion Data Integration

- `app/notion/strategic_decisions_repo.py`
  - Lists `Proposed` decisions with pagination.
  - Supports both `status` and `select` Notion property variants for `Status`.
- `app/workflow/decision_workflow.py`
  - Updates decision status safely for both `status` and `select` schemas.
  - Upserts executive reviews using stable key: `"{decision_page_id}:{agent_name}"`.
  - Creates/updates PRD page by title: `PRD - {decision_name}`.

## Schemas

- `app/schemas/review_output.py`: executive review contract.
- `app/schemas/prd_output.py`: PRD contract.
- `app/schemas/decision_snapshot.py`: decision snapshot contract passed through workflow.
