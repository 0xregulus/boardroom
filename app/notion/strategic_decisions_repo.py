from __future__ import annotations

from typing import Any

from notion_client import Client

from app.workflow.decision_workflow import _first_data_source_id # Import _first_data_source_id


class StrategicDecisionsRepo:
    def __init__(self, client: Client, database_id: str) -> None:
        self.client = client
        self.database_id = database_id
        self.data_source_id = _first_data_source_id(client, database_id) # Derive data_source_id

    def list_proposed(self) -> list[dict[str, Any]]:
        try:
            res = self.client.data_sources.query(
                data_source_id=self.data_source_id,
                filter={"property": "Status", "status": {"equals": "Proposed"}},
                page_size=100,
            )
        except Exception:
            res = self.client.data_sources.query(
                data_source_id=self.data_source_id,
                filter={"property": "Status", "select": {"equals": "Proposed"}},
                page_size=100,
            )
        return res.get("results", [])
