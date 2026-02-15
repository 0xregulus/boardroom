from __future__ import annotations

import json
from openai import OpenAI
from .base import BaseAgent, AgentContext


class CFOAgent(BaseAgent):
    name = "CFO"

    def __init__(self, openai_client: OpenAI) -> None:
        super().__init__(openai_client)
        self.system_msg, self.user_msg_template = self._load_prompts(self.name)

    def evaluate(self, context: AgentContext) -> dict:
        snapshot = context.snapshot
        missing = context.memory_context.get("missing_sections", [])

        snapshot_json = json.dumps(snapshot, indent=2)
        missing_sections_str = ', '.join(missing) if missing else 'None'
        governance_checkbox_fields_str = ', '.join(context.memory_context.get('governance_checkbox_fields', []))

        user_msg = self.user_msg_template.format(
            snapshot_json=snapshot_json,
            missing_sections_str=missing_sections_str,
            governance_checkbox_fields_str=governance_checkbox_fields_str
        )

        try:
            resp = self.openai_client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": self.system_msg},
                    {"role": "user", "content": user_msg},
                ],
                temperature=0.2,
                max_tokens=1200,
                response_format={"type": "json_object"}
            )
            content = resp.choices[0].message.content
            if not content:
                return self._placeholder_output("CFO model returned empty content.")

            try:
                parsed = json.loads(content)
            except json.JSONDecodeError:
                # Attempt to extract JSON from potentially malformed output
                start_index = content.find('{')
                end_index = content.rfind('}')
                if start_index != -1 and end_index != -1 and start_index < end_index:
                    try:
                        extracted_json_str = content[start_index : end_index + 1]
                        parsed = json.loads(extracted_json_str)
                    except json.JSONDecodeError:
                        print(f"DEBUG: Could not extract valid JSON from malformed content: {content}")
                        return self._placeholder_output("CFO JSON parsing failed after extraction attempt.")
                else:
                    print(f"DEBUG: No valid JSON structure found in content: {content}")
                    return self._placeholder_output("CFO output had no parseable JSON object.")

            parsed["agent"] = self.name
            return parsed
        except Exception as e:
            print(f"Error in CFO Agent LLM call: {e}")
            return self._placeholder_output(f"CFO LLM call failed: {e}")
