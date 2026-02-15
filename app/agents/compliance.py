from __future__ import annotations

import json
from openai import OpenAI
from .base import BaseAgent, AgentContext


class ComplianceAgent(BaseAgent):
    name = "Compliance"

    def __init__(self, openai_client: OpenAI) -> None:
        super().__init__(openai_client)
        self.system_msg, self.user_msg_template = self._load_prompts(self.name)

    def _request_completion(self, user_msg: str, max_tokens: int):
        return self.openai_client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": self.system_msg},
                {"role": "user", "content": user_msg},
            ],
            temperature=0.2,
            max_tokens=max_tokens,
            response_format={"type": "json_object"},
        )

    @staticmethod
    def _parse_json(content: str) -> dict | None:
        if not content:
            return None
        try:
            return json.loads(content)
        except json.JSONDecodeError:
            start_index = content.find("{")
            end_index = content.rfind("}")
            if start_index == -1 or end_index == -1 or start_index >= end_index:
                return None
            try:
                return json.loads(content[start_index : end_index + 1])
            except json.JSONDecodeError:
                return None

    def evaluate(self, context: AgentContext) -> dict:
        snapshot = context.snapshot
        missing = context.memory_context.get("missing_sections", [])

        snapshot_json = json.dumps(snapshot, separators=(",", ":"))
        missing_sections_str = ', '.join(missing) if missing else 'None'
        governance_checkbox_fields_str = ', '.join(context.memory_context.get('governance_checkbox_fields', []))

        user_msg = self.user_msg_template.format(
            snapshot_json=snapshot_json,
            missing_sections_str=missing_sections_str,
            governance_checkbox_fields_str=governance_checkbox_fields_str
        )
        user_msg += (
            "\nReturn concise JSON: thesis <= 60 words, max 3 blockers, max 3 risks, "
            "max 3 required_changes, short evidence strings."
        )

        try:
            max_tokens_plan = [1200, 2400]
            last_finish_reason = None
            last_content = ""

            for attempt, max_tokens in enumerate(max_tokens_plan, start=1):
                resp = self._request_completion(user_msg, max_tokens=max_tokens)
                choice = resp.choices[0]
                last_finish_reason = choice.finish_reason
                last_content = choice.message.content or ""
                parsed = self._parse_json(last_content)
                if parsed is not None:
                    parsed["agent"] = self.name
                    return parsed
                if attempt < len(max_tokens_plan):
                    print(
                        f"DEBUG: Compliance JSON parse failed "
                        f"(finish_reason={last_finish_reason}, attempt={attempt}). Retrying with higher max_tokens."
                    )

            tail = last_content[-240:] if last_content else "<empty>"
            return self._placeholder_output(
                "Compliance JSON parsing failed after retry "
                f"(finish_reason={last_finish_reason}, tail={tail})."
            )
        except Exception as e:
            print(f"Error in Compliance Agent LLM call: {e}")
            return self._placeholder_output(f"Compliance LLM call failed: {e}")
