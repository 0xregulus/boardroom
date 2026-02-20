# Live Governance Briefing (UI Contract)

This document defines the current Boardroom UI behavior for workflow execution and report output.

## 1) Workflow Editor (Execution Surface)

From Dashboard strategy details, selecting **Run Analysis** opens the **Workflow Editor** in full-page mode (navbar and footer preserved).

### Canvas behavior
- Decision Pulse is the center of execution feedback.
- Orbit nodes include core reviewers, optional red-team personas, and any custom user-created agents.
- Red-team personas show:
  - `Disabled` when red-team switch is off.
  - `Queued` when red-team switch is on and they have not started.
- Research indicator appears on-canvas as `Research` with globe icon (bottom-left).
- Hygiene score appears on-canvas in the bottom-right badge.

### Workflow Editor aside
- Always visible during execution.
- Includes run controls:
  - `Enable Research`
  - `Enable Red-Team`
  - `Cross-Agent Rebuttal Rounds` (`0..3`)
- Includes `Execution Trace`.

### Execution Trace semantics
- Unified stream that includes:
  - pipeline execution events,
  - refinement/debate events,
  - external evidence events.

## 2) Live Governance Briefing (Report Surface)

Report output follows an **inverted-pyramid** decision model:

1. **Outcome Layer**
   - Decision status badge: `APPROVED`, `CHALLENGED`, `BLOCKED`
   - DQS gauge (`0..100`)
   - Chairperson one-sentence verdict
2. **Substance vs. Hygiene Layer**
   - Two-row scorecard (dimension, score, primary driver)
3. **Evidence Layer**
   - Debate summary (consensus points + primary contention)
   - External citations
   - Live research feed + refinement log
4. **Implementation Layer**
   - PRD summary
   - Risk register
   - Decision Ancestry save action (`Save to Vault`)

## 3) Three-Column Layout

- **Left (Governance / What):** outcome badge + Decision Pulse / DQS.
- **Center (Analysis / Why):** scorecard, persona summaries, artifacts.
- **Right (Evidence / How):** debate summary, citations, research feed, refinement log, ancestry snapshot.

## 4) Notes

- Decision ancestry retrieval mode can be `vector-db` or lexical fallback.
- When Tavily is disabled or unavailable, external evidence sections may be sparse.
