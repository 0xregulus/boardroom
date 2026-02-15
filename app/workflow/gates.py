from __future__ import annotations

import re
from typing import Any


REQUIRED_BOOLEAN_GATES = [
    "Strategic Alignment Brief",
    "Problem Quantified",
    "≥3 Options Evaluated",
    "Success Metrics Defined",
    "Leading Indicators Defined",
    "Kill Criteria Defined",
]


def _checkbox_true(prop: dict[str, Any] | None) -> bool:
    if not prop:
        return False
    return bool(prop.get("checkbox"))


def _number_present(prop: dict[str, Any] | None) -> bool:
    if not prop:
        return False
    return prop.get("number") is not None


def _select_present(prop: dict[str, Any] | None) -> bool:
    if not prop:
        return False
    sel = prop.get("select")
    return bool(sel and sel.get("name"))


def infer_governance_checks_from_text(body_text: str) -> dict[str, bool]:
    text = body_text.lower()

    def has_any(*phrases: str) -> bool:
        return any(phrase in text for phrase in phrases)

    def explicitly_no(gate_name: str) -> bool:
        return f"{gate_name.lower()}: no" in text

    option_matches = re.findall(r"\boption\s+[a-z0-9]+\b", text)
    numeric_matches = re.findall(r"\b\d[\d,\.%]*\b", text)

    return {
        "Strategic Alignment Brief": (not explicitly_no("Strategic Alignment Brief")) and has_any("strategic context", "strategic alignment", "objective supported"),
        "Problem Quantified": (not explicitly_no("Problem Quantified")) and has_any("problem framing", "quantified impact", "problem statement") and len(numeric_matches) >= 3,
        "≥3 Options Evaluated": (not explicitly_no("≥3 Options Evaluated")) and has_any("options evaluated", "chosen option") and len(set(option_matches)) >= 3,
        "Success Metrics Defined": (not explicitly_no("Success Metrics Defined")) and has_any("success metrics", "primary metric", "kpi impact"),
        "Leading Indicators Defined": (not explicitly_no("Leading Indicators Defined")) and has_any("leading indicators"),
        "Kill Criteria Defined": (not explicitly_no("Kill Criteria Defined")) and has_any("kill criteria", "we will stop or pivot"),
        "Option Trade-offs Explicit": (not explicitly_no("Option Trade-offs Explicit")) and has_any("trade-offs", "trade offs"),
        "Risk Matrix Completed": (not explicitly_no("Risk Matrix Completed")) and has_any("risk matrix") and has_any("mitigation", "probability", "impact"),
        "Financial Model Included": (not explicitly_no("Financial Model Included")) and has_any("financial model", "payback period", "revenue impact", "cost impact"),
        "Downside Modeled": (not explicitly_no("Downside Modeled")) and has_any("downside", "risk-adjusted", "sensitivity"),
        "Compliance Reviewed": (not explicitly_no("Compliance Reviewed")) and has_any("compliance review", "compliance reviewed", "legal review", "regulatory review"),
        "Decision Memo Written": (not explicitly_no("Decision Memo Written")) and has_any("executive summary", "final decision"),
        "Root Cause Done": (not explicitly_no("Root Cause Done")) and has_any("root cause"),
        "Assumptions Logged": (not explicitly_no("Assumptions Logged")) and has_any("assumptions", "confidence level"),
    }


def evaluate_required_gates(
    page_properties: dict[str, Any],
    inferred_checks: dict[str, bool] | None = None,
) -> list[str]:
    missing: list[str] = []
    if not _number_present(page_properties.get("Baseline")):
        missing.append("Baseline")
    if not _number_present(page_properties.get("Target")):
        missing.append("Target")
    if not _select_present(page_properties.get("Time Horizon")):
        missing.append("Time Horizon")
    for gate in REQUIRED_BOOLEAN_GATES:
        checkbox_set = _checkbox_true(page_properties.get(gate))
        inferred_set = bool(inferred_checks and inferred_checks.get(gate))
        if not (checkbox_set or inferred_set):
            missing.append(gate)
    return missing
