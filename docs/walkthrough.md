# Quick Start Walkthrough: Mitigating a Critical Failure State

This walkthrough demonstrates the full governance loop: draft -> adversarial challenge -> semantic mitigation -> approval.

## Objective
Take a strategy from a critical blocker to a validated mitigation state.

## Steps
1. Start Boardroom with demo data:
   - `npm run local:start:demo`
2. Open `http://localhost:3000` and select a strategy in `Proposed` status.
3. Enter **The Forge** and run with:
   - Red Team: `ON`
   - Rebuttal Rounds: `1` or `2`
4. Capture one `Critical` risk pill from the output.
5. Draft a mitigation with:
   - explicit owner,
   - control/action steps,
   - implementation timing,
   - rollback/contingency.
6. Submit mitigation and verify semantic acceptance:
   - target: `substanceScore >= 0.7`
   - expected: risk pill moves out of blocked state.
7. Re-run governance. Confirm:
   - improved DQS,
   - reduced blocker count,
   - updated run entry in history.

## Example Semantic Validation Call

```bash
curl -X POST http://localhost:3000/api/socratic/validate-substance \
  -H 'Content-Type: application/json' \
  -H 'x-boardroom-admin-key: <BOARDROOM_ADMIN_KEY>' \
  -d '{
    "riskTitle": "Single-cloud deployment fragility",
    "riskDescription": "A regional outage would stop all transaction processing.",
    "mitigationText": "Platform team will ship active-active failover across two regions in 30 days, with automated health checks, quarterly failover drills, and rollback to single-region mode if latency exceeds SLO for 15 minutes."
  }'
```

Expected response shape:

```json
{
  "substanceScore": 0.84,
  "approved": true,
  "feedback": "Mitigation is specific, causal, and executable."
}
```

## Exit Criteria
- Critical risk is mitigated with approved substance.
- Decision moves from `Blocked/Challenged` pressure toward `Approved` readiness.
- Run history records the delta in governance posture.
