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
        filters = [
            {"property": "Status", "status": {"equals": "Proposed"}},
            {"property": "Status", "select": {"equals": "Proposed"}},
        ]

        active_filter: dict[str, Any] | None = None
        first_response: dict[str, Any] | None = None
        for query_filter in filters:
            try:
                first_response = self.client.data_sources.query(
                    data_source_id=self.data_source_id,
                    filter=query_filter,
                    page_size=100,
                )
                active_filter = query_filter
                break
            except Exception:
                continue

        if not first_response or not active_filter:
            return []

        results = list(first_response.get("results", []))
        cursor = first_response.get("next_cursor")
        has_more = bool(first_response.get("has_more"))

        while has_more and cursor:
            page = self.client.data_sources.query(
                data_source_id=self.data_source_id,
                filter=active_filter,
                page_size=100,
                start_cursor=cursor,
            )
            results.extend(page.get("results", []))
            has_more = bool(page.get("has_more"))
            cursor = page.get("next_cursor")

        return results
