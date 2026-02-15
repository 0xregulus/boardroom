from __future__ import annotations

import json
from openai import OpenAI
from .base import BaseAgent, AgentContext


class ChairpersonAgent(BaseAgent):
    name = "Chairperson"

    def __init__(self, openai_client: OpenAI) -> None:
        super().__init__(openai_client)
        self.system_msg, self.user_msg_template = self._load_prompts(self.name)

    def evaluate(self, context: AgentContext) -> dict:
        snapshot = context.snapshot
        reviews = snapshot.get("reviews", [])

        reviews_json = json.dumps(reviews, indent=2)

        user_msg = self.user_msg_template.format(reviews_json=reviews_json)

        try:
            resp = self.openai_client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": self.system_msg},
                    {"role": "user", "content": user_msg},
                ],
                temperature=0.2,
                max_tokens=500,
                response_format={"type": "json_object"}
            )
            content = resp.choices[0].message.content
            if not content:
                # Fallback to a placeholder synthesis if LLM returns nothing
                return {
                    "executive_summary": "Chair synthesis pending LLM output.",
                    "final_recommendation": "Challenged",
                    "conflicts": [],
                    "blockers": [],
                    "required_revisions": [],
                }

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
                        return {
                            "executive_summary": "Chair synthesis failed due to malformed JSON output from LLM.",
                            "final_recommendation": "Challenged",
                            "conflicts": [],
                            "blockers": [],
                            "required_revisions": [],
                        }
                else:
                    print(f"DEBUG: No valid JSON structure found in content: {content}")
                    return {
                        "executive_summary": "Chair synthesis failed due to no valid JSON structure from LLM.",
                        "final_recommendation": "Challenged",
                        "conflicts": [],
                        "blockers": [],
                        "required_revisions": [],
                    }

            # Ensure final_recommendation is one of the allowed values
            allowed_recommendations = ["Approved", "Challenged", "Blocked"]
            if parsed.get("final_recommendation") not in allowed_recommendations:
                parsed["final_recommendation"] = "Challenged" # Default to challenged if invalid

            return parsed
        except Exception as e:
            print(f"Error in Chairperson Agent LLM call: {e}")
            # Fallback to a placeholder synthesis if LLM call fails
            return {
                "executive_summary": "Chair synthesis failed due to LLM error.",
                "final_recommendation": "Challenged",
                "conflicts": [],
                "blockers": [],
                "required_revisions": [],
            }
