# Architectural Integrity & Governance Math

Boardroom is designed as a governance protocol, not a chat surface. This document defines the integrity mechanics behind scoring, adjudication, and visual truthfulness.

## 1. The Vector-Based Nucleus
Boardroom's DecisionPulse2D is computed using **weighted vector displacement**.

- Each vertex starts from a base radial shell.
- For each agent, displacement is added toward that agent's anchor vector.
- The displacement strength is proportional to:
  - agent influence weight,
  - angular cosine proximity,
  - runtime state (active, settling, stable).

### Why this matters
- Prevents generic radial bulging and groupthink-looking geometry.
- Preserves localized influence from dissenting agents.
- Produces a physically interpretable governance signal.

## 2. DQS and Adversarial Weighting
The Decision Quality Score (DQS) is a weighted, penalty-adjusted governance score.

### Core weighting
- `CEO = 0.30`
- `CFO = 0.25`
- `CTO = 0.25`
- `Compliance = 0.20`
- Additional custom agents use `0.20` each.

### Adversarial correction
- Risk-weighted dissent (especially CFO/Compliance) carries stronger penalty.
- Low specialized confidence introduces an explicit confidence penalty.
- Final DQS blends substance and hygiene (`substance 75%`, `hygiene 25%`).

### Gate outcomes
- `Blocked`: any hard blocker remains.
- `Challenged`: guardrails fail or DQS is below threshold.
- `Approved`: strategic, hygiene, and confidence thresholds hold.

## 3. The Semantic Mitigation Gate
Boardroom enforces a **Semantic Substance Validator** to prevent logic gaming.

- Mitigations are evaluated by an LLM referee returning:
  - `substanceScore` (`0..1`)
  - `approved` (`boolean`)
  - `feedback` (`string`)
- Practical acceptance threshold is **0.7**.
- Superficial numeric claims are insufficient without explicit causal controls and executable steps.

Endpoint: `POST /api/socratic/validate-substance`

## 4. Persistence, Replay, and Strategic Delta
Governance output is persisted in PostgreSQL at run time.

- `workflow_runs`: immutable run snapshots and state.
- `decision_reviews`: per-agent judgments and blocker logic.
- `decision_synthesis`: chairperson synthesis.
- `decision_prds`: implementation artifact for approved decisions.
- `decision_ancestry_embeddings`: historical memory for strategic retrieval.

Boardroom also computes **mitigation velocity** so teams can measure risk-to-resolution behavior over time.

## 5. Executive Integrity Principle
Boardroom's architecture is built so visuals, scores, and gates all tell the same truth:

- visual deformation mirrors reviewer influence,
- mathematical scoring reflects adversarial friction,
- semantic validation blocks non-substantive mitigation,
- persistence preserves auditability and institutional memory.
