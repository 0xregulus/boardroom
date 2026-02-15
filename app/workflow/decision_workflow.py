from __future__ import annotations

import os
import re
from difflib import SequenceMatcher
from pathlib import Path
from typing import Any, Dict, List, Literal, TypedDict

from dotenv import load_dotenv
from langgraph.graph import StateGraph, START, END
from notion_client import Client
from openai import OpenAI
from pydantic import ValidationError

from app.agents.ceo import CEOAgent
from app.agents.cfo import CFOAgent
from app.agents.cto import CTOAgent
from app.agents.compliance import ComplianceAgent
from app.agents.chairperson import ChairpersonAgent
from app.agents.base import AgentContext
from app.schemas.decision_snapshot import DecisionSnapshot
from app.schemas.review_output import ReviewOutput
from app.schemas.prd_output import PRDOutput
from app.workflow.states import DecisionWorkflowState
from app.workflow.gates import evaluate_required_gates, infer_governance_checks_from_text
from app.notion.mappers import to_rich_text, to_title


CHECKBOX_FIELDS = [
    "≥3 Options Evaluated",
    "Success Metrics Defined",
    "Leading Indicators Defined",
    "Kill Criteria Defined",
    "Option Trade-offs Explicit",
    "Risk Matrix Completed",
    "Financial Model Included",
    "Downside Modeled",
    "Compliance Reviewed",
    "Decision Memo Written",
    "Root Cause Done",
    "Assumptions Logged",
]


class GraphState(TypedDict):
    decision_id: str
    user_context: dict[str, Any]
    business_constraints: dict[str, Any]
    strategic_goals: list[str]
    # Decision snapshot from Notion
    decision_snapshot: DecisionSnapshot | None
    # Executive reviews
    reviews: dict[str, ReviewOutput]
    # Calculated DQS
    dqs: float
    # Current status
    status: Literal[
        DecisionWorkflowState.PROPOSED,
        DecisionWorkflowState.REVIEWING,
        DecisionWorkflowState.SYNTHESIZED,
        DecisionWorkflowState.DECIDED,
        DecisionWorkflowState.PERSISTED,
    ]
    # Synthesis from Chairperson
    synthesis: dict[str, Any] | None
    # PRD document
    prd: PRDOutput | None
    missing_sections: list[str]
    decision_name: str


# Helper functions for Notion interaction
def _get_notion_db_id(db_name_env_var: str) -> str:
    load_dotenv(".env")
    db_id = os.getenv(db_name_env_var)
    if not db_id:
        raise SystemExit(f"{db_name_env_var} missing in .env")
    return db_id

def _fetch_page_properties(client: Client, page_id: str) -> Dict[str, Any]:
    page = client.pages.retrieve(page_id=page_id)
    return page.get("properties", {})

def _fetch_block_text(client: Client, block_id: str, page_size: int = 100) -> List[str]:
    texts: List[str] = []
    cursor = None
    while True:
        kwargs = {"block_id": block_id, "page_size": page_size}
        if cursor:
            kwargs["start_cursor"] = cursor
        resp = client.blocks.children.list(**kwargs)
        for block in resp.get("results", []):
            block_type = block.get("type")
            rich = block.get(block_type, {}).get("rich_text", []) if block_type else []
            for r in rich:
                if r.get("plain_text"):
                    texts.append(r["plain_text"])
            if block_type == "table_row":
                cells = block.get("table_row", {}).get("cells", [])
                for cell in cells:
                    for r in cell:
                        if r.get("plain_text"):
                            texts.append(r["plain_text"])
            if block.get("has_children") and block.get("id"):
                texts.extend(_fetch_block_text(client, block["id"], page_size))
        if not resp.get("has_more"):
            break
        cursor = resp.get("next_cursor")
        if not cursor:
            break
    return texts

def _fetch_page_text(client: Client, page_id: str, page_size: int = 100) -> str:
    return "\n".join(_fetch_block_text(client, page_id, page_size))

def _rt(text: str) -> Dict[str, Any]:
    return to_rich_text(text)

def _title(text: str) -> Dict[str, Any]:
    return to_title(text)


def _status_property_payload(status_property: dict[str, Any] | None, status_value: str) -> dict[str, Any]:
    prop_type = status_property.get("type") if isinstance(status_property, dict) else None
    if prop_type == "select":
        return {"Status": {"select": {"name": status_value}}}
    return {"Status": {"status": {"name": status_value}}}


def _update_page_status(
    client: Client,
    page_id: str,
    status_value: str,
    page_properties: dict[str, Any] | None = None,
) -> None:
    primary_payload = _status_property_payload((page_properties or {}).get("Status"), status_value)
    try:
        client.pages.update(page_id=page_id, properties=primary_payload)
        return
    except Exception:
        # Retry with the alternate status payload shape for mixed Notion schemas.
        if "status" in primary_payload.get("Status", {}):
            fallback_payload = {"Status": {"select": {"name": status_value}}}
        else:
            fallback_payload = {"Status": {"status": {"name": status_value}}}
        client.pages.update(page_id=page_id, properties=fallback_payload)


DECISION_SOURCE_HEADINGS = [
    "Executive Summary",
    "1. Strategic Context",
    "2. Problem Framing",
    "3. Options Evaluated",
    "4. Financial Model",
    "5. Risk Matrix",
    "6. Final Decision",
    "7. Kill Criteria",
    "8. Monitoring Plan",
]

PRD_SECTION_DEFAULTS = {
    "Goals": "Define the north star: outcomes, why now, tie to OKRs.",
    "Background": "Context: prior decisions, customer insights, incidents, gaps.",
    "Research": "Market scans, competitive benchmarks, and evidence.",
    "User Stories": 'Use: "As a [user], I want [action], so I can [benefit]."',
    "Requirements": "Functional, non-functional, and constraints. Make them testable.",
    "Telemetry": "Events, properties, funnels, KPIs, dashboards, and review cadence.",
    "UX/UI Design": "Capture UX flows, accessibility, and responsive design notes.",
    "Experiment": "Hypothesis, KPIs, success/fail criteria, and sampling plan.",
    "Q&A": "Open questions, blockers, and dependencies.",
    "Notes": "Assumptions, pending decisions, and implementation notes.",
}

LABEL_ONLY_PHRASES = {
    "objective supported",
    "kpi impact",
    "cost of inaction",
    "clear problem statement",
    "root cause",
    "affected segment",
    "quantified impact",
    "chosen option",
    "trade-offs",
    "trade offs",
    "primary metric",
    "leading indicators",
    "review cadence",
    "criteria",
    "revenue impact (12m)",
    "cost impact",
    "margin effect",
    "payback period",
    "confidence level",
    "risk",
    "impact",
    "probability",
    "mitigation",
    "we will stop or pivot if",
}

LINE_PREFIXES_TO_STRIP = (
    "decision requirement:",
    "executive requirement:",
    "problem framing:",
    "options evaluated:",
    "financial model:",
    "kill criterion:",
    "decision memo:",
)


def _clean_line(text: str, max_len: int = 260) -> str:
    normalized = text.replace("**", "").replace("`", "")
    normalized = " ".join(normalized.replace("\t", " ").split()).strip(" -•")
    lowered = normalized.lower()
    for prefix in LINE_PREFIXES_TO_STRIP:
        if lowered.startswith(prefix):
            normalized = normalized[len(prefix) :].strip()
            lowered = normalized.lower()
            break
    trimmed = normalized[:max_len].strip()
    lower_trimmed = trimmed.lower().rstrip(":")
    if lower_trimmed in {"", "+", "|", "-", "chosen option", "trade-offs", "trade offs"}:
        return ""
    return trimmed


def _is_label_only_line(line: str) -> bool:
    normalized = _clean_line(line, max_len=260).lower().strip()
    if not normalized:
        return True
    if normalized in LABEL_ONLY_PHRASES:
        return True
    if normalized in {"combine", "+"}:
        return True
    if ":" in normalized:
        tail = normalized.split(":")[-1].strip()
        if not tail or tail in LABEL_ONLY_PHRASES or tail in {"combine", "+"}:
            return True
        if re.fullmatch(r"option\s+[a-z0-9]+(?:\s*\(.+\))?", tail):
            return True
    if normalized.endswith(":"):
        core = normalized[:-1].strip()
        if not core:
            return True
        if core in LABEL_ONLY_PHRASES:
            return True
        if len(core.split()) <= 4:
            return True
    return False


def _dedupe_keep_order(lines: list[str], limit: int = 8) -> list[str]:
    out: list[str] = []
    seen: set[str] = set()
    for line in lines:
        cleaned = _clean_line(line)
        if not cleaned:
            continue
        key = cleaned.lower()
        if key in seen:
            continue
        seen.add(key)
        out.append(cleaned)
        if len(out) >= limit:
            break
    return out


def _normalize_similarity_text(text: str) -> str:
    normalized = text.lower()
    normalized = re.sub(r"[^a-z0-9\s]", " ", normalized)
    normalized = re.sub(
        r"\b(a|an|the|to|for|of|and|or|with|all|ensure|perform|conduct|develop|comprehensive|thorough|potential|required)\b",
        " ",
        normalized,
    )
    normalized = re.sub(r"\s+", " ", normalized).strip()
    return normalized


def _dedupe_semantic(lines: list[str], limit: int = 8, similarity: float = 0.86) -> list[str]:
    out: list[str] = []
    normalized_out: list[str] = []
    for line in lines:
        cleaned = _clean_line(line)
        if not cleaned:
            continue
        normalized = _normalize_similarity_text(cleaned)
        if not normalized:
            normalized = cleaned.lower()
        duplicate = False
        for prior in normalized_out:
            if normalized == prior:
                duplicate = True
                break
            if SequenceMatcher(None, normalized, prior).ratio() >= similarity:
                duplicate = True
                break
        if duplicate:
            continue
        out.append(cleaned)
        normalized_out.append(normalized)
        if len(out) >= limit:
            break
    return out


def _requirement_topic_key(text: str) -> str:
    lowered = text.lower()
    if "downside model" in lowered or "downside modeling" in lowered:
        return "downside_modeling"
    if "compliance review" in lowered:
        return "compliance_review"
    if "risk matrix" in lowered:
        return "risk_matrix"
    return ""


def _property_value(properties: dict[str, Any], name: str) -> str:
    prop = properties.get(name, {})
    if not isinstance(prop, dict):
        return ""
    prop_type = prop.get("type")
    if prop_type == "title":
        return "".join(x.get("plain_text", "") for x in prop.get("title", []))
    if prop_type == "rich_text":
        return "".join(x.get("plain_text", "") for x in prop.get("rich_text", []))
    if prop_type == "number":
        value = prop.get("number")
        if value is None:
            return ""
        if isinstance(value, float) and value.is_integer():
            return str(int(value))
        return str(value)
    if prop_type == "select":
        return (prop.get("select") or {}).get("name", "")
    if prop_type == "status":
        return (prop.get("status") or {}).get("name", "")
    if prop_type == "checkbox":
        return "Yes" if prop.get("checkbox") else "No"
    if prop_type == "url":
        return prop.get("url", "") or ""
    if prop_type == "email":
        return prop.get("email", "") or ""
    return ""


def _snapshot_body_text(snapshot: DecisionSnapshot | None) -> str:
    if not snapshot:
        return ""
    if not snapshot.section_excerpt:
        return ""
    first = snapshot.section_excerpt[0]
    if not isinstance(first, dict):
        return ""
    return (first.get("text") or {}).get("content", "") or ""


def _extract_decision_section(body_text: str, heading: str) -> str:
    if not body_text:
        return ""
    lowered = body_text.lower()
    marker = heading.lower()
    marker_pos = lowered.find(marker)
    if marker_pos == -1:
        return ""
    content_start = body_text.find("\n", marker_pos)
    if content_start == -1:
        content_start = marker_pos + len(heading)
    else:
        content_start += 1
    content_end = len(body_text)
    for next_heading in DECISION_SOURCE_HEADINGS:
        if next_heading.lower() == marker:
            continue
        idx = lowered.find(next_heading.lower(), content_start)
        if idx != -1 and idx < content_end:
            content_end = idx
    return body_text[content_start:content_end].strip()


def _section_lines(text: str, max_lines: int = 6) -> list[str]:
    if not text:
        return []
    lines = [_clean_line(line) for line in text.splitlines() if _clean_line(line)]
    if len(lines) <= 1 and lines:
        lines = [_clean_line(p) for p in re.split(r"(?<=[.!?])\s+", lines[0]) if _clean_line(p)]
    lines = [line for line in lines if not _is_label_only_line(line)]
    return _dedupe_keep_order(lines, limit=max_lines)


def _reviews_required_changes(reviews: dict[str, ReviewOutput], limit: int = 6) -> list[str]:
    lines: list[str] = []
    seen_topics: set[str] = set()
    for review in reviews.values():
        for change in review.required_changes:
            cleaned = _clean_line(change)
            if not cleaned:
                continue
            topic_key = _requirement_topic_key(cleaned)
            if topic_key and topic_key in seen_topics:
                continue
            if topic_key:
                seen_topics.add(topic_key)
            lines.append(cleaned)
    return _dedupe_semantic(lines, limit=limit)


def _reviews_risk_evidence(reviews: dict[str, ReviewOutput], limit: int = 6) -> list[str]:
    lines: list[str] = []
    for review in reviews.values():
        for risk in review.risks:
            lines.append(f"{risk.type}: {risk.evidence}")
    return _dedupe_keep_order(lines, limit=limit)


def _final_decision_requirements(final_decision_text: str) -> list[str]:
    if not final_decision_text:
        return []

    clean_text = final_decision_text.replace("**", "")
    requirements: list[str] = []

    option_matches = re.findall(r"Option\s+([A-Za-z0-9]+)\s*\(([^)]+)\)", clean_text)
    if option_matches:
        option_descriptions = [f"Option {label} ({name.strip()})" for label, name in option_matches]
        option_descriptions = _dedupe_keep_order(option_descriptions, limit=4)
        if len(option_descriptions) == 1:
            requirements.append(f"Implement {option_descriptions[0]} as the selected approach.")
        else:
            joined = " + ".join(option_descriptions[:3])
            requirements.append(f"Implement a phased rollout combining {joined}.")

    for line in _section_lines(clean_text, max_lines=12):
        lower_line = line.lower().rstrip(":")
        if lower_line in {"chosen option", "trade-offs", "trade offs"}:
            continue
        if lower_line in {"combine", "+"}:
            continue
        if line.lower().startswith("option "):
            continue
        if option_matches and "combine option" in lower_line:
            continue
        if "trade-off" in lower_line or "trade off" in lower_line:
            continue
        if line.startswith("Prioritize ") or line.startswith("Focus "):
            requirements.append(f"Trade-off guardrail: {line.rstrip('.')}.")
        elif "phased rollout" in lower_line and "option" in lower_line:
            requirements.append(line.rstrip("."))

    return _dedupe_semantic(requirements, limit=5, similarity=0.8)


def _build_prd_output(state: GraphState) -> PRDOutput:
    snapshot = state.get("decision_snapshot")
    properties = snapshot.properties if snapshot else {}
    body_text = _snapshot_body_text(snapshot)
    body_lower = body_text.lower()
    synthesis = state.get("synthesis") or {}
    reviews = state.get("reviews") or {}

    objective = _property_value(properties, "Strategic Objective")
    decision_type = _property_value(properties, "Decision Type")
    primary_kpi = _property_value(properties, "Primary KPI")
    baseline = _property_value(properties, "Baseline")
    target = _property_value(properties, "Target")
    time_horizon = _property_value(properties, "Time Horizon")
    probability_of_success = _property_value(properties, "Probability of Success")
    owner = _property_value(properties, "Owner")
    investment_required = _property_value(properties, "Investment Required")
    gross_benefit = _property_value(properties, "12-Month Gross Benefit")
    risk_adjusted_roi = _property_value(properties, "Risk-Adjusted ROI")

    executive_summary = _extract_decision_section(body_text, "Executive Summary")
    strategic_context = _extract_decision_section(body_text, "1. Strategic Context")
    problem_framing = _extract_decision_section(body_text, "2. Problem Framing")
    options_evaluated = _extract_decision_section(body_text, "3. Options Evaluated")
    financial_model = _extract_decision_section(body_text, "4. Financial Model")
    risk_matrix = _extract_decision_section(body_text, "5. Risk Matrix")
    final_decision = _extract_decision_section(body_text, "6. Final Decision")
    kill_criteria = _extract_decision_section(body_text, "7. Kill Criteria")
    monitoring_plan = _extract_decision_section(body_text, "8. Monitoring Plan")

    goals: list[str] = []
    if objective:
        goals.append(f"Strategic objective: {objective}.")
    if primary_kpi:
        metric_line = f"North-star KPI: {primary_kpi}."
        if baseline and target:
            metric_line += f" Baseline {baseline} -> Target {target}."
        goals.append(metric_line)
    if time_horizon:
        goals.append(f"Planning horizon: {time_horizon}.")
    goals.extend(_section_lines(strategic_context, max_lines=4))
    goals = _dedupe_keep_order(goals, limit=8)

    background: list[str] = []
    background.extend(_section_lines(executive_summary, max_lines=4))
    if decision_type:
        background.append(f"Decision type: {decision_type}.")
    if owner:
        background.append(f"Decision owner: {owner}.")
    background = _dedupe_keep_order(background, limit=8)

    research: list[str] = []
    research.extend(_section_lines(problem_framing, max_lines=5))
    research.extend(_section_lines(options_evaluated, max_lines=5))
    research.extend(_section_lines(financial_model, max_lines=4))
    research.extend(_section_lines(risk_matrix, max_lines=4))
    research = _dedupe_semantic(research, limit=10, similarity=0.88)

    user_stories: list[str] = []
    if "mobile" in body_lower:
        user_stories.append("As a mobile buyer, I want a fast and predictable checkout so I can complete purchases with low friction.")
    if "bundle" in body_lower or "recommendation" in body_lower:
        user_stories.append("As a returning buyer, I want relevant bundles and recommendations so I can discover complementary products quickly.")
    if "international" in body_lower:
        user_stories.append("As an international buyer, I want transparent fulfillment and delivery options so I can purchase with confidence.")
    if not user_stories:
        user_stories.append("As a buyer, I want a frictionless purchase flow so I can complete orders quickly and confidently.")
    user_stories = _dedupe_keep_order(user_stories, limit=5)

    requirements: list[str] = []
    requirements.extend(_final_decision_requirements(final_decision))
    requirements.extend(_reviews_required_changes(reviews, limit=5))
    requirements = _dedupe_semantic(requirements, limit=8)

    telemetry: list[str] = []
    if primary_kpi:
        telemetry.append(f"Primary metric: {primary_kpi}.")
    primary_metric_norm = _normalize_similarity_text(primary_kpi) if primary_kpi else ""
    for line in _section_lines(monitoring_plan, max_lines=8):
        norm = _normalize_similarity_text(line)
        if line.lower().startswith("primary metric"):
            continue
        if primary_metric_norm and (norm == primary_metric_norm or primary_metric_norm in norm or norm in primary_metric_norm):
            continue
        telemetry.append(line)
    telemetry = _dedupe_semantic(telemetry, limit=8, similarity=0.88)

    ux_ui_design: list[str] = []
    if "mobile" in body_lower:
        ux_ui_design.append("Prioritize a simplified mobile checkout path with fewer steps and clear progress feedback.")
    if "bundle" in body_lower or "recommendation" in body_lower:
        ux_ui_design.append("Design recommendation and bundle surfaces on PDP/cart with clear relevance cues and opt-out controls.")
    ux_ui_design.append("Ensure accessible interaction patterns (contrast, focus order, keyboard support, readable touch targets).")
    ux_ui_design.append("Validate responsive behavior across core mobile breakpoints before rollout.")
    ux_ui_design = _dedupe_keep_order(ux_ui_design, limit=6)

    experiment: list[str] = []
    if primary_kpi:
        experiment.append(f"Hypothesis: improving checkout and merchandising will increase {primary_kpi}.")
    if probability_of_success:
        experiment.append(f"Initial probability of success estimate: {probability_of_success}.")
    if time_horizon:
        experiment.append(f"Experiment horizon: {time_horizon}.")
    for line in _section_lines(kill_criteria, max_lines=4):
        experiment.append(line)
    experiment = _dedupe_semantic(experiment, limit=8, similarity=0.88)

    qa: list[str] = []
    for blocker in synthesis.get("blockers", []):
        qa.append(f"Open blocker: {blocker}")
    for conflict in synthesis.get("conflicts", []):
        qa.append(f"Conflict to resolve: {conflict}")
    for revision in synthesis.get("required_revisions", []):
        qa.append(f"Required revision: {revision}")
    if not qa:
        qa.append("No additional unresolved questions were captured at synthesis time.")
    qa = _dedupe_keep_order(qa, limit=8)

    notes: list[str] = []
    if owner:
        notes.append(f"Owner: {owner}.")
    if investment_required:
        notes.append(f"Investment required: {investment_required}.")
    if gross_benefit:
        notes.append(f"12-month gross benefit estimate: {gross_benefit}.")
    if risk_adjusted_roi:
        notes.append(f"Risk-adjusted ROI estimate: {risk_adjusted_roi}.")
    final_recommendation = synthesis.get("final_recommendation")
    if final_recommendation:
        notes.append(f"Chairperson recommendation snapshot: {final_recommendation}.")
    notes = _dedupe_keep_order(notes, limit=8)

    risks = _reviews_risk_evidence(reviews, limit=6)
    if not risks:
        for line in _section_lines(risk_matrix, max_lines=4):
            risks.append(f"Risk matrix: {line}")
    risks = _dedupe_keep_order(risks, limit=8)

    milestones = [
        "Milestone 1: Finalize implementation scope, instrumentation plan, and rollout guardrails.",
        "Milestone 2: Ship core checkout + merchandising changes behind a controlled rollout.",
        "Milestone 3: Evaluate experiment outcomes against kill criteria and decide scale-up or rollback.",
    ]
    if time_horizon:
        milestones[0] = f"Milestone 1 ({time_horizon} plan): finalize scope, instrumentation, and launch criteria."

    sections: dict[str, list[str]] = {
        "Goals": goals,
        "Background": background,
        "Research": research,
        "User Stories": user_stories,
        "Requirements": requirements,
        "Telemetry": telemetry,
        "UX/UI Design": ux_ui_design,
        "Experiment": experiment,
        "Q&A": qa,
        "Notes": notes,
    }

    for section_name, default_line in PRD_SECTION_DEFAULTS.items():
        if not sections.get(section_name):
            sections[section_name] = [default_line]

    scope = _dedupe_keep_order(requirements + goals, limit=8)
    telemetry_out = _dedupe_keep_order(telemetry, limit=8)

    return PRDOutput(
        title=f"PRD for Decision {state['decision_name']}",
        scope=scope or [PRD_SECTION_DEFAULTS["Requirements"]],
        milestones=milestones,
        telemetry=telemetry_out or [PRD_SECTION_DEFAULTS["Telemetry"]],
        risks=risks or ["No explicit risks were captured; complete risk review before execution."],
        sections=sections,
    )


def _prd_children(decision_name: str, prd: PRDOutput | None = None) -> List[Dict[str, Any]]:
    """Return PRD blocks derived from strategic decision and executive feedback."""
    def h1(text: str) -> Dict[str, Any]:
        return {"object": "block", "type": "heading_1", "heading_1": {"rich_text": [{"type": "text", "text": {"content": text[:1800]}}]}}

    def para(text: str) -> Dict[str, Any]:
        return {"object": "block", "type": "paragraph", "paragraph": {"rich_text": [{"type": "text", "text": {"content": text[:1800]}}]}}

    def bullet(text: str) -> Dict[str, Any]:
        return {
            "object": "block",
            "type": "bulleted_list_item",
            "bulleted_list_item": {"rich_text": [{"type": "text", "text": {"content": text[:1800]}}]},
        }

    section_order = [
        ("1. Goals", "Goals"),
        ("2. Background", "Background"),
        ("3. Research", "Research"),
        ("4. User Stories", "User Stories"),
        ("5. Requirements", "Requirements"),
        ("6. Telemetry", "Telemetry"),
        ("7. UX/UI Design", "UX/UI Design"),
        ("8. Experiment", "Experiment"),
        ("9. Q&A", "Q&A"),
        ("10. Notes", "Notes"),
    ]

    sections = prd.sections if prd else {}
    blocks: list[dict[str, Any]] = [
        h1(f"Product Requirements Document: {decision_name}"),
        para("Generated from the strategic decision document and executive review feedback."),
    ]

    for heading, key in section_order:
        blocks.append(h1(heading))
        lines = sections.get(key) or [PRD_SECTION_DEFAULTS.get(key, "To be completed.")]
        for line in _dedupe_keep_order(lines, limit=8):
            blocks.append(bullet(line))

    return blocks[:100]

def _invalid_review_fallback(agent_name: str, reason: str) -> ReviewOutput:
    return ReviewOutput(
        agent=agent_name,
        thesis=f"{agent_name} review output was invalid and requires manual follow-up.",
        score=1,
        confidence=0.0,
        blocked=True,
        blockers=[f"Invalid review output schema: {reason}"],
        risks=[
            {
                "type": "schema_validation",
                "severity": 9,
                "evidence": "LLM response did not match required ReviewOutput schema.",
            }
        ],
        required_changes=["Regenerate review with strict JSON schema compliance."],
        approval_conditions=[],
        apga_impact_view="Unknown due to invalid review output.",
        governance_checks_met={},
    )

def _upsert_notion_review(client: Client, executive_reviews_db_id: str, page_id: str, agent_name: str, review_output: ReviewOutput) -> None:
    try:
        stable_key = f"{page_id}:{agent_name}"
        executive_reviews_data_source_id = _first_data_source_id(client, executive_reviews_db_id)
        existing_reviews = client.data_sources.query(
            data_source_id=executive_reviews_data_source_id,
            filter={"property": "Review Name", "title": {"equals": stable_key}},
        ).get("results", [])

        properties = {
            "Review Name": _title(stable_key),
            "Agent Type": {"select": {"name": agent_name}},
            "Score": {"number": review_output.score},
            "Blocked": {"checkbox": review_output.blocked},
            "Main Risks": _rt("; ".join(r.evidence for r in review_output.risks) or review_output.thesis),
            "Recommendations": _rt("; ".join(review_output.required_changes) or review_output.thesis),
            "📊 Strategic Decision ": {"relation": [{"id": page_id}]},
        }

        if existing_reviews:
            client.pages.update(page_id=existing_reviews[0]["id"], properties=properties)
        else:
            client.pages.create(parent={"database_id": executive_reviews_db_id}, properties=properties)
    except Exception as exc:
        raise RuntimeError(
            "Failed to persist executive review to Notion "
            f"(decision_id={page_id}, agent={agent_name}, database_id={executive_reviews_db_id})."
        ) from exc

def _create_notion_prd_page(client: Client, prd_db_id: str, decision_name: str, page_id: str, prd: PRDOutput) -> None:
    try:
        prd_title = f"PRD — {decision_name}"
        prd_data_source_id = _first_data_source_id(client, prd_db_id)
        existing_prd = client.data_sources.query(
            data_source_id=prd_data_source_id,
            filter={"property": "Project name", "title": {"equals": prd_title}},
        ).get("results", [])

        prd_properties = {
            "Project name": _title(prd_title),
            "Status": {"status": {"name": "Draft"}},
        }
        children = _prd_children(decision_name, prd)

        if existing_prd:
            existing_page_id = existing_prd[0]["id"]
            client.pages.update(page_id=existing_page_id, properties=prd_properties, erase_content=True)
            client.blocks.children.append(block_id=existing_page_id, children=children)
        else:
            client.pages.create(
                parent={"database_id": prd_db_id},
                properties=prd_properties,
                children=children,
            )
    except Exception as exc:
        raise RuntimeError(
            "Failed to persist PRD page to Notion "
            f"(decision_id={page_id}, decision_name={decision_name}, database_id={prd_db_id})."
        ) from exc


def _first_data_source_id(client: Client, database_id: str) -> str:
    try:
        database = client.databases.retrieve(database_id=database_id)
    except Exception as exc:
        raise RuntimeError(
            f"Unable to retrieve Notion database '{database_id}' to resolve its data source ID."
        ) from exc

    data_sources = database.get("data_sources", [])
    for data_source in data_sources:
        data_source_id = data_source.get("id")
        if data_source_id:
            return data_source_id

    raise RuntimeError(f"No data source found for Notion database '{database_id}'.")



class BoardroomDecisionWorkflow:
    def _add_nodes(self):
        """Add nodes to the workflow graph."""
        self.workflow.add_node("build_decision", self._build_decision_node)
        self.workflow.add_node("executive_review", self._executive_review_node)
        self.workflow.add_node("synthesize_reviews", self._synthesize_node)
        self.workflow.add_node("calculate_dqs", self._calculate_dqs_node)
        self.workflow.add_node("generate_prd", self._generate_prd_node)
        self.workflow.add_node("persist_artifacts", self._persist_artifacts_node)

    def _add_edges(self):
        """Add edges and conditional edges to the workflow graph."""
        self.workflow.add_edge(START, "build_decision")
        self.workflow.add_edge("build_decision", "executive_review")
        self.workflow.add_edge("executive_review", "synthesize_reviews")
        self.workflow.add_edge("synthesize_reviews", "calculate_dqs")
        
        self.workflow.add_conditional_edges(
            "calculate_dqs",
            self._decide_gate,
            {
                "approved": "generate_prd",
                "revision_required": "persist_artifacts", # Route to persist_artifacts
                "blocked": "persist_artifacts", # Route to persist_artifacts
            },
        )
        self.workflow.add_edge("generate_prd", "persist_artifacts")
        self.workflow.add_edge("persist_artifacts", END)


    def _get_agent_review_output(self, agent: Any, state: GraphState, missing_sections: list[str]) -> ReviewOutput:
        """Helper to run an agent and return its ReviewOutput."""
        agent_context = AgentContext(
            snapshot=state["decision_snapshot"].model_dump() if state["decision_snapshot"] else {},
            memory_context={
                "missing_sections": missing_sections,
                "governance_checkbox_fields": CHECKBOX_FIELDS # Pass CHECKBOX_FIELDS
            },
        )
        agent_name = getattr(agent, "name", "UnknownAgent")
        try:
            raw_review = agent.evaluate(agent_context)
        except Exception as exc:
            print(f"ERROR: {agent_name} evaluation failed: {exc}")
            return _invalid_review_fallback(agent_name, "agent evaluate call failed")

        try:
            return ReviewOutput(**raw_review)
        except ValidationError as exc:
            print(f"ERROR: {agent_name} produced invalid review output: {exc}")
            return _invalid_review_fallback(agent_name, "pydantic validation failed")

    def _build_decision_node(self, state: GraphState) -> GraphState:
        """Node: Initialize the decision state by fetching from Notion."""
        print("--- Building Decision from Notion ---")
        decision_id = state["decision_id"]

        try:
            page_properties = self.notion_client.pages.retrieve(page_id=decision_id).get("properties", {})
            body_text = _fetch_page_text(self.notion_client, page_id=decision_id)
            inferred_checks = infer_governance_checks_from_text(body_text)

            checkbox_updates: dict[str, dict[str, bool]] = {}
            for gate, is_met in inferred_checks.items():
                if not is_met:
                    continue
                prop = page_properties.get(gate)
                if isinstance(prop, dict) and "checkbox" in prop and not bool(prop.get("checkbox")):
                    checkbox_updates[gate] = {"checkbox": True}
                    prop["checkbox"] = True

            missing_sections = evaluate_required_gates(page_properties, inferred_checks=inferred_checks)
            status_value = "Under Evaluation" if not missing_sections else "Incomplete"

            _update_page_status(
                self.notion_client,
                page_id=decision_id,
                status_value=status_value,
                page_properties=page_properties,
            )
            if checkbox_updates:
                self.notion_client.pages.update(page_id=decision_id, properties=checkbox_updates)

            decision_name = "".join(t.get("plain_text", "") for t in page_properties.get("Decision Name", {}).get("title", [])) or f"Untitled Decision {decision_id}"

            initial_snapshot = DecisionSnapshot(
                page_id=decision_id,
                captured_at=page_properties.get("Created time", {}).get("created_time", ""),
                properties=page_properties,
                section_excerpt=[{"type": "text", "text": {"content": body_text[:12000]}}],
                computed={
                    "inferred_governance_checks": inferred_checks,
                    "autochecked_governance_fields": sorted(checkbox_updates.keys()),
                },
            )

            return {
                **state,
                "decision_snapshot": initial_snapshot,
                "status": DecisionWorkflowState.PROPOSED,
                "missing_sections": missing_sections,
                "decision_name": decision_name
            }
        except Exception as e:
            print(f"Error fetching decision {decision_id} from Notion: {e}")
            raise

    def _executive_review_node(self, state: GraphState) -> GraphState:
        """Node: Run executive agent reviews in parallel."""
        print("--- Running Executive Reviews ---")
        missing_sections = state["missing_sections"]
        
        reviews = {
            "ceo": self._get_agent_review_output(self.ceo_agent, state, missing_sections),
            "cfo": self._get_agent_review_output(self.cfo_agent, state, missing_sections),
            "cto": self._get_agent_review_output(self.cto_agent, state, missing_sections),
            "compliance": self._get_agent_review_output(self.compliance_agent, state, missing_sections),
        }
        return {**state, "reviews": reviews, "status": DecisionWorkflowState.REVIEWING}

    def _synthesize_node(self, state: GraphState) -> GraphState:
        """Node: Synthesize executive reviews using Chairperson Agent."""
        print("--- Synthesizing Reviews ---")
        chairperson_snapshot = state["decision_snapshot"].model_dump() if state["decision_snapshot"] else {}
        chairperson_snapshot["reviews"] = [review.model_dump() for review in state["reviews"].values()]

        agent_context = AgentContext(
            snapshot=chairperson_snapshot,
            memory_context={},
        )
        
        synthesis = self.chairperson_agent.evaluate(agent_context)

        return {**state, "synthesis": synthesis, "status": DecisionWorkflowState.SYNTHESIZED}

    def _calculate_dqs_node(self, state: GraphState) -> GraphState:
        """Node: Calculate Decision Quality Score (DQS)."""
        print("--- Calculating DQS ---")
        reviews = state["reviews"]
        dqs = (
            reviews["ceo"].score * 0.30
            + reviews["cfo"].score * 0.25
            + reviews["cto"].score * 0.25
            + reviews["compliance"].score * 0.20
        )
        return {**state, "dqs": dqs}

    def _decide_gate(self, state: GraphState) -> Literal["approved", "revision_required", "blocked"]:
        """Node: Determine if decision is approved, requires revision, or is blocked."""
        print("--- Deciding Gate ---")
        dqs = state["dqs"]
        decision_id = state["decision_id"]
        page_properties = state["decision_snapshot"].properties if state.get("decision_snapshot") else None
        
        any_blocked = any(review.blocked for review in state["reviews"].values())

        if any_blocked:
            print("Decision BLOCKED by an executive agent.")
            _update_page_status(self.notion_client, decision_id, "Blocked", page_properties=page_properties)
            return "blocked"
        elif dqs < 7.0:
            print(f"DQS ({dqs}) is below threshold (7.0). Revision required.")
            _update_page_status(self.notion_client, decision_id, "Challenged", page_properties=page_properties)
            return "revision_required"
        else:
            print(f"DQS ({dqs}) is sufficient. Decision APPROVED.")
            _update_page_status(self.notion_client, decision_id, "Approved", page_properties=page_properties)
            return "approved"

    def _generate_prd_node(self, state: GraphState) -> GraphState:
        """Node: Generate PRD document."""
        print("--- Generating PRD ---")
        prd = _build_prd_output(state)
        return {**state, "prd": prd, "status": DecisionWorkflowState.DECIDED}

    def _persist_artifacts_node(self, state: GraphState) -> GraphState:
        """Node: Persist all artifacts to local files and Notion."""
        print("--- Persisting Artifacts ---")
        # Notion persistence
        executive_reviews_db_id_for_func = _get_notion_db_id("NOTION_EXECUTIVE_REVIEWS_DB_ID")
        prd_db_id_for_func = _get_notion_db_id("NOTION_PRDS_DB_ID")

        for agent_name, review_output in state["reviews"].items():
            _upsert_notion_review(self.notion_client, executive_reviews_db_id_for_func, state["decision_id"], agent_name, review_output)
        print("Executive reviews upserted to Notion.")

        # Also persist Chairperson's synthesis to the Executive Reviews Log DB
        if state["synthesis"]:
            chairperson_summary = state["synthesis"].get("executive_summary", "No executive summary provided.")
            final_recommendation = state["synthesis"].get("final_recommendation", "Challenged")
            
            # Map Chairperson's summary to a ReviewOutput-like structure for upserting
            chairperson_review_output = ReviewOutput(
                agent="Chairperson",
                thesis=chairperson_summary,
                score=5, # Default score, as Chairperson doesn't provide one directly
                confidence=1.0, # High confidence in own synthesis
                blocked=final_recommendation == "Blocked",
                blockers=state["synthesis"].get("blockers", []),
                risks=[], # Chairperson summarizes, not identifies new risks
                required_changes=state["synthesis"].get("required_revisions", []),
                approval_conditions=[],
                apga_impact_view="N/A", # Not applicable for Chairperson
            )
            _upsert_notion_review(self.notion_client, executive_reviews_db_id_for_func, state["decision_id"], "Chairperson", chairperson_review_output)
            print("Chairperson's summary upserted to Executive Reviews Log DB.")

        if state["status"] == DecisionWorkflowState.DECIDED and state["prd"]:
            _create_notion_prd_page(
                self.notion_client,
                prd_db_id_for_func,
                state["decision_name"],
                state["decision_id"],
                state["prd"],
            )
            print("PRD page created in Notion.")

        return {**state, "status": DecisionWorkflowState.PERSISTED}
    
    def __init__(self, artifacts_root: Path, notion_client: Client, openai_client: OpenAI) -> None:
        self.artifacts_root = artifacts_root
        self.notion_client = notion_client
        self.openai_client = openai_client
        self.workflow = StateGraph(GraphState)

        self.ceo_agent = CEOAgent(openai_client=self.openai_client)
        self.cfo_agent = CFOAgent(openai_client=self.openai_client)
        self.cto_agent = CTOAgent(openai_client=self.openai_client)
        self.compliance_agent = ComplianceAgent(openai_client=self.openai_client)
        self.chairperson_agent = ChairpersonAgent(openai_client=self.openai_client)

        self._add_nodes()
        self._add_edges()

    def run(self, user_context: dict[str, Any], business_constraints: dict[str, Any], strategic_goals: list[str], decision_id: str) -> GraphState:
        """Run the boardroom decision workflow."""
        app = self.workflow.compile()
        initial_state = GraphState(
            decision_id=decision_id,
            user_context=user_context,
            business_constraints=business_constraints,
            strategic_goals=strategic_goals,
            decision_snapshot=None,
            reviews={},
            dqs=0.0,
            status=DecisionWorkflowState.PROPOSED,
            synthesis=None,
            prd=None,
            missing_sections=[],
            decision_name=f"Decision {decision_id}"
        )
        final_state = app.invoke(initial_state)
        return final_state
