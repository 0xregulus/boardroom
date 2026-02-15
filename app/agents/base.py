from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any, Tuple

from openai import OpenAI


@dataclass
class AgentContext:
    snapshot: dict[str, Any]
    memory_context: dict[str, Any]


class BaseAgent:
    name: str = "base"

    def __init__(self, openai_client: OpenAI) -> None:
        self.openai_client = openai_client

    @staticmethod
    def _load_prompts(agent_name: str) -> Tuple[str, str]:
        prompt_file = Path(__file__).parent.parent / "prompts" / f"{agent_name.lower()}_v3.md"
        if not prompt_file.exists():
            raise FileNotFoundError(f"Prompt file not found for agent {agent_name}: {prompt_file}")

        content = prompt_file.read_text()
        system_msg_start = content.find("## System Message")
        user_msg_start = content.find("## User Message Template")

        if system_msg_start == -1 or user_msg_start == -1:
            raise ValueError(f"System Message or User Message Template sections not found in {prompt_file}")

        system_msg = content[system_msg_start + len("## System Message"): user_msg_start].strip().strip('---').strip()
        user_msg_template = content[user_msg_start + len("## User Message Template"):].strip().strip('---').strip()
        
        return system_msg, user_msg_template

    def evaluate(self, context: AgentContext) -> dict[str, Any]:
        raise NotImplementedError

    def _placeholder_output(self, reason: str = "LLM output missing or malformed.") -> dict[str, Any]:
        return {
            "agent": self.name,
            "thesis": f"{self.name} review unavailable due to output parsing failure.",
            "score": 1,
            "confidence": 0.0,
            "blocked": True,
            "blockers": [reason],
            "risks": [
                {
                    "type": "llm_output_error",
                    "severity": 8,
                    "evidence": reason,
                }
            ],
            "required_changes": ["Regenerate review with strict valid JSON output."],
            "approval_conditions": [],
            "apga_impact_view": "Unknown due to invalid model output.",
            "governance_checks_met": {},
        }
