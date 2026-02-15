from __future__ import annotations

import json
from types import SimpleNamespace

from app.agents.base import AgentContext
from app.agents.ceo import CEOAgent
from app.agents.cfo import CFOAgent
from app.agents.compliance import ComplianceAgent


def _review_payload(thesis: str = "Valid review") -> dict:
    return {
        "thesis": thesis,
        "score": 8,
        "confidence": 0.8,
        "blocked": False,
        "blockers": [],
        "risks": [{"type": "execution", "severity": 4, "evidence": "Manageable risk."}],
        "required_changes": [],
        "approval_conditions": [],
        "apga_impact_view": "Positive",
        "governance_checks_met": {"Compliance Reviewed": True},
    }


class _FakeCompletions:
    def __init__(self, payloads: list[tuple[str, str] | str]) -> None:
        self.payloads = payloads
        self.calls = 0

    def create(self, **kwargs):  # noqa: ANN003
        item = self.payloads[min(self.calls, len(self.payloads) - 1)]
        self.calls += 1
        if isinstance(item, tuple):
            content, finish_reason = item
        else:
            content, finish_reason = item, "stop"
        choice = SimpleNamespace(message=SimpleNamespace(content=content), finish_reason=finish_reason)
        return SimpleNamespace(choices=[choice])


class _FakeOpenAI:
    def __init__(self, payloads: list[tuple[str, str] | str]) -> None:
        self.chat = SimpleNamespace(completions=_FakeCompletions(payloads))


def _context() -> AgentContext:
    return AgentContext(snapshot={"page_id": "decision-1"}, memory_context={"missing_sections": [], "governance_checkbox_fields": []})


def test_ceo_returns_placeholder_when_json_not_parseable() -> None:
    agent = CEOAgent(openai_client=_FakeOpenAI(["not-json-at-all"]))
    output = agent.evaluate(_context())
    assert output["agent"] == "CEO"
    assert output["blocked"] is True
    assert "no parseable JSON object" in output["blockers"][0]


def test_cfo_extracts_embedded_json_payload() -> None:
    payload = _review_payload(thesis="Embedded JSON")
    content = f"prefix text {json.dumps(payload)} trailing text"
    agent = CFOAgent(openai_client=_FakeOpenAI([content]))
    output = agent.evaluate(_context())
    assert output["agent"] == "CFO"
    assert output["thesis"] == "Embedded JSON"
    assert output["blocked"] is False


def test_compliance_retries_and_recovers_json() -> None:
    valid = json.dumps(_review_payload(thesis="Recovered on retry"))
    fake_openai = _FakeOpenAI(
        [
            ("malformed-json", "length"),
            (valid, "stop"),
        ]
    )
    agent = ComplianceAgent(openai_client=fake_openai)
    output = agent.evaluate(_context())
    assert output["agent"] == "Compliance"
    assert output["thesis"] == "Recovered on retry"
    assert fake_openai.chat.completions.calls == 2
