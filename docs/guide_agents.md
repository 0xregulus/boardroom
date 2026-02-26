# The Board of Reviewers

Each Boardroom agent exists to generate deliberate strategic friction. Agents do not only output text; they produce sentiment and confidence signals that shape the DecisionPulse2D and the final DQS path.

## Agent Matrix

| Agent | Primary Concern | Tugging Logic |
| :--- | :--- | :--- |
| **CEO** | Strategic alignment | Pulls toward long-term moat, positioning, and strategic coherence. |
| **CFO** | Economic logic | Pulls toward capital efficiency, unit economics, downside exposure, and ROI realism. |
| **CTO** | Feasibility | Pulls toward implementation risk, scalability, and technical debt containment. |
| **Compliance** | Policy and governance | Pulls toward regulatory defensibility, auditability, and control coverage. |
| **Pre-Mortem** | Failure simulation | Pulls toward failure modes, fragility, and scenario stress outcomes. |
| **Resource Competitor** | Operational contention | Pulls toward resource scarcity, sequencing risk, and org collision. |
| **Risk Simulation** | Tail risk pressure | Pulls toward low-probability/high-impact exposure and resilience. |
| **Devil's Advocate** | Contrarian challenge | Pulls against consensus to expose hidden assumptions and weak logic. |
| **Red Team** | Adversarial risk | Constricts the nucleus until critical logic gaps are closed. |

## Defining Stance
- Agents are intentionally specialized and opinionated.
- Contradiction is a governance feature, not a failure state.
- DQS improves when disagreement is resolved through substantive mitigation, not narrative smoothing.

## Integration Rules
- Core weighting prioritizes CEO, CFO, CTO, and Compliance.
- Risk-oriented dissent receives stronger penalty influence.
- Agent confidence contributes to confidence penalties when weakly substantiated.

See [docs/architecture.md](docs/architecture.md) for the formal scoring and gate mechanics.
