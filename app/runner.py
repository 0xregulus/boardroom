from __future__ import annotations

import os
import sys
from pathlib import Path

from dotenv import load_dotenv
from notion_client import Client
from openai import OpenAI

# Ensure the app directory is in the sys.path for imports
ROOT = Path(__file__).resolve().parent
if str(ROOT.parent) not in sys.path:
    sys.path.append(str(ROOT.parent))

from app.notion.strategic_decisions_repo import StrategicDecisionsRepo  # noqa: E402
from app.workflow.decision_workflow import BoardroomDecisionWorkflow, _get_notion_db_id  # noqa: E402


def _load_notion_client() -> Client:
    load_dotenv(".env")
    api_key = os.getenv("NOTION_API_KEY")
    if not api_key:
        raise SystemExit("NOTION_API_KEY missing in .env")
    return Client(auth=api_key)

def _require_openai() -> OpenAI:
    load_dotenv(".env")
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise SystemExit("OPENAI_API_KEY missing in .env")
    return OpenAI(api_key=api_key)


def main() -> int:
    load_dotenv(".env")

    artifacts_root = Path(os.getenv("ARTIFACTS_ROOT", "./artifacts/runs"))
    artifacts_root.mkdir(parents=True, exist_ok=True)

    notion_client = _load_notion_client()
    openai_client = _require_openai()

    # Get the strategic decisions database ID
    strategic_decisions_db_id = _get_notion_db_id("NOTION_STRATEGIC_DECISIONS_DB_ID")
    strategic_repo = StrategicDecisionsRepo(client=notion_client, database_id=strategic_decisions_db_id)

    # Fetch proposed decisions
    proposed_decisions = strategic_repo.list_proposed()

    if not proposed_decisions:
        print("No 'Proposed' strategic decisions found in Notion database. Exiting.")
        return 0

    print(f"Found {len(proposed_decisions)} 'Proposed' strategic decisions.")

    for proposed_decision in proposed_decisions:
        decision_id = proposed_decision["id"]
        properties = proposed_decision.get("properties", {})
        decision_name = "".join(t.get("plain_text", "") for t in properties.get("Decision Name", {}).get("title", [])) or f"Untitled Decision {decision_id}"

        print(f"\n--- Processing Decision: {decision_name} ({decision_id}) ---")

        workflow = BoardroomDecisionWorkflow(artifacts_root=artifacts_root, notion_client=notion_client, openai_client=openai_client)

        # Pass empty dummy inputs, as the workflow will fetch actual data from Notion
        final_state = workflow.run(
            user_context={},
            business_constraints={},
            strategic_goals=[],
            decision_id=decision_id
        )

        print("\n--- Workflow Completed ---")
        print(f"Final Decision ID: {final_state['decision_id']}")
        print(f"Final Status: {final_state['status'].value}")
        print(f"Final DQS: {final_state['dqs']:.2f}")
        if final_state["synthesis"]:
            print(f"Chairperson Synthesis: {final_state['synthesis'].get('executive_summary', 'N/A')}")
        if final_state["prd"]:
            print(f"Generated PRD Title: {final_state['prd'].title}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
