from __future__ import annotations

from app.workflow.gates import REQUIRED_BOOLEAN_GATES, evaluate_required_gates, infer_governance_checks_from_text


def test_inferred_gates_satisfy_required_sections() -> None:
    body_text = """
    Strategic context: objective supported by APGA growth strategy.
    Problem framing with quantified impact: conversion is 5%, target is 8%, traffic is 120000 users.
    Options evaluated include Option A, Option B, and Option C. Chosen option combines learnings.
    Success metrics and primary metric are defined in KPI impact notes.
    Leading indicators include checkout completion and add-to-cart rate.
    Kill criteria: we will stop or pivot if conversion drops below 4%.
    """
    inferred = infer_governance_checks_from_text(body_text)

    page_properties = {
        "Baseline": {"number": 100},
        "Target": {"number": 120},
        "Time Horizon": {"select": {"name": "Quarterly"}},
    }

    missing = evaluate_required_gates(page_properties, inferred_checks=inferred)
    assert missing == []


def test_explicit_no_overrides_inference() -> None:
    body_text = """
    Strategic context with objective supported.
    Problem framing and quantified impact include 5% and 8% and 120000.
    Problem Quantified: no
    Options evaluated include Option A, Option B, and Option C.
    Success metrics and KPI impact are included.
    Leading indicators are listed.
    Kill criteria: we will stop or pivot if APGA drops.
    """
    inferred = infer_governance_checks_from_text(body_text)
    assert inferred["Problem Quantified"] is False

    page_properties = {
        "Baseline": {"number": 100},
        "Target": {"number": 120},
        "Time Horizon": {"select": {"name": "Quarterly"}},
    }
    for gate in REQUIRED_BOOLEAN_GATES:
        page_properties[gate] = {"checkbox": True}
    page_properties["Problem Quantified"] = {"checkbox": False}

    missing = evaluate_required_gates(page_properties, inferred_checks=inferred)
    assert missing == ["Problem Quantified"]
