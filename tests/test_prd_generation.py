from __future__ import annotations

from app.schemas.decision_snapshot import DecisionSnapshot
from app.schemas.review_output import ReviewOutput
from app.workflow.decision_workflow import _build_prd_output


def _rich_text(value: str) -> dict:
    return {"type": "rich_text", "rich_text": [{"plain_text": value}]}


def _number(value: float) -> dict:
    return {"type": "number", "number": value}


def _select(value: str) -> dict:
    return {"type": "select", "select": {"name": value}}


def test_prd_sections_filter_label_only_lines_and_noise() -> None:
    body_text = """
Executive Summary
Decision requirement: Chosen option:
Decision requirement: Combine
Decision requirement: Option A (Mobile Checkout Optimization)
Decision requirement: +
Decision requirement: Option B (Product Bundles & Recommendations)

1. Strategic Context
Objective supported:
Increase APGA by improving conversion and basket size.

2. Problem Framing
Problem framing: Clear problem statement:
VelAfrika receives significant traffic but conversions are flat.
Problem framing: Root cause:
Checkout friction and weak discovery patterns.

3. Options Evaluated
Options evaluated: Criteria
Options evaluated: Option A - Mobile Checkout Optimization
Options evaluated: Option B - Product Bundles & Recommendations
Options evaluated: Option C - Personalized Recommendations

4. Financial Model
Financial model: Revenue impact (12m):
+12-18% estimated increase via conversion + basket growth.
Financial model: Cost impact:
Moderate implementation cost with fast payback.

5. Risk Matrix
Risk:
Shipping reliability variance
Impact:
High
Probability:
Medium
Mitigation:
Add SLA monitoring and backup carrier support.

6. Final Decision
Chosen option:
Combine Option A (Mobile Checkout Optimization) + Option B (Product Bundles & Recommendations)
Trade-offs:
Prioritize low-risk rollout sequence first.

7. Kill Criteria
Kill criterion: We will stop or pivot if:
Kill criterion: APGA increase < 5% after 8 weeks
Kill criterion: Checkout conversion drops by >5%
Kill criterion: Recommendation CTR < baseline navigation CTR

8. Monitoring Plan
Primary metric:
APGA (African Products Going Abroad)
Leading indicators:
Mobile checkout completion rate
Items per order
Add-to-cart rate
"""
    snapshot = DecisionSnapshot(
        page_id="decision-1",
        captured_at="2026-02-15T00:00:00.000Z",
        properties={
            "Strategic Objective": _rich_text(
                "Increase APGA (African Products Going Abroad) by 20% next quarter by improving customer conversion and basket size."
            ),
            "Primary KPI": _rich_text("APGA (African Products Going Abroad)"),
            "Baseline": _number(100),
            "Target": _number(120),
            "Time Horizon": _select("Next quarter"),
            "Decision Type": _select("Growth"),
            "Owner": _rich_text("CEO"),
        },
        section_excerpt=[{"type": "text", "text": {"content": body_text}}],
        computed={},
    )

    reviews = {
        "ceo": ReviewOutput(
            agent="CEO",
            thesis="Proceed with phased rollout.",
            score=8,
            confidence=0.8,
            blocked=False,
            blockers=[],
            risks=[],
            required_changes=[
                "Conduct downside modeling to assess potential negative impacts of the decision.",
                "Develop a comprehensive downside model to assess potential financial impacts.",
            ],
            approval_conditions=[],
            apga_impact_view="Positive",
            governance_checks_met={},
        ),
        "compliance": ReviewOutput(
            agent="Compliance",
            thesis="Proceed with compliance check.",
            score=8,
            confidence=0.8,
            blocked=False,
            blockers=[],
            risks=[],
            required_changes=[
                "Conduct a compliance review to ensure all regulatory requirements are met.",
                "Conduct a compliance review to ensure all regulatory requirements are met.",
            ],
            approval_conditions=[],
            apga_impact_view="Neutral",
            governance_checks_met={},
        ),
    }

    state = {
        "decision_name": "VelAfrika Growth",
        "decision_snapshot": snapshot,
        "synthesis": {},
        "reviews": reviews,
    }

    prd = _build_prd_output(state)
    all_lines = [line for section in prd.sections.values() for line in section]

    forbidden_lines = {
        "Decision requirement: Chosen option:",
        "Decision requirement: Combine",
        "Decision requirement: Option A (Mobile Checkout Optimization)",
        "Decision requirement: +",
        "Problem framing: Clear problem statement:",
        "Problem framing: Root cause:",
        "Options evaluated: Criteria",
        "Financial model: Revenue impact (12m):",
        "Kill criterion: We will stop or pivot if:",
        "Primary metric:",
        "Leading indicators:",
    }
    for forbidden in forbidden_lines:
        assert forbidden not in all_lines

    requirements = prd.sections["Requirements"]
    assert any(line.startswith("Implement ") for line in requirements)
    assert "Primary metric: APGA (African Products Going Abroad)." in prd.sections["Telemetry"]
