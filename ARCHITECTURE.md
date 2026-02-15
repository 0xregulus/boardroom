# Agent Architecture & Workflow

## Agent Topology

1. Strategy Builder Agent
- Inputs: `user_context`, `business_constraints`, `strategic_goals`
- Output: `StrategicDecisionDoc` (JSON + Markdown)

2. Executive Review Agents (parallel)
- CEO Agent: strategy coherence, opportunity cost, long-term leverage
- CFO Agent: capital efficiency, ROI, sensitivity, financial risk
- CTO Agent: architecture feasibility, complexity, execution risk
- Compliance/Legal Agent: regulatory exposure, legal/data/privacy risk
- Output: one `ExecutiveReview` per agent

3. Decision Synthesizer Agent
- Inputs: all executive reviews
- Output: `DecisionSynthesis` with conflicts, risks, revisions, open questions

4. PRD Generator Agent
- Trigger: approved decision
- Input: `StrategicDecisionDoc` + `DecisionSynthesis`
- Output: `PRDDocument` (JSON + Markdown)

## Orchestration

- File: `/Users/facundorodriguez/Projects/Boardroom/src/strategic_system/workflow.py`
- Runtime: LangGraph (`StateGraph`) with fallback sequential runner
- Parallel stage: executive reviews use `asyncio.gather`

Execution:
1. `build_decision`
2. `review_executives` (parallel)
3. `synthesize`
4. `gate` (DQS + blocker check)
5. `generate_prd` (conditional on approval)
6. persist artifacts

## DQS Rule

`DQS = CEO*0.30 + CFO*0.25 + CTO*0.25 + Compliance*0.20`

- If `DQS < threshold` (default `7.0`) -> `revision_required`
- If any review has `blocked = true` -> `revision_required`
- Else -> `approved` and PRD generation runs

## Data Model

```json
{
  "decision_id": "",
  "decision_doc": {},
  "reviews": {
    "ceo": {},
    "cfo": {},
    "cto": {},
    "compliance": {}
  },
  "dqs": 0,
  "status": "draft | review | approved | rejected | revision_required",
  "synthesis": {},
  "prd": {}
}
```

## Persistence

- Run artifacts: `/Users/facundorodriguez/Projects/Boardroom/artifacts/runs/<decision_id>/`
- History log: `/Users/facundorodriguez/Projects/Boardroom/artifacts/history/decision_history.jsonl`
- Optional Notion persistence via:
  - `NOTION_STRATEGIC_DECISIONS_DB_ID`
  - `NOTION_EXECUTIVE_REVIEWS_DB_ID`
  - `NOTION_PRDS_DB_ID`
  - `NOTION_RISKS_DB_ID` (optional)
- Format: JSON + Markdown (Notion-compatible headings/tables)

## Validation Gates

- Enforced via Pydantic models in `/Users/facundorodriguez/Projects/Boardroom/src/strategic_system/schemas.py`
- Mandatory sections block progression when missing
- At least 3 options required for strategic decision docs
