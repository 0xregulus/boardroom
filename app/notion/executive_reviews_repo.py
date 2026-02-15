from __future__ import annotations

from typing import Any

from notion_client import Client

from app.workflow.decision_workflow import _first_data_source_id


class ExecutiveReviewsRepo:
    def __init__(self, client: Client, parent_type: str, parent_id: str, query_database_id: str | None, title_property: str) -> None:
        self.client = client
        self.parent_type = parent_type
        self.parent_id = parent_id
        self.query_database_id = query_database_id
        if query_database_id: # Only derive if a database ID is provided
            self.query_data_source_id = _first_data_source_id(client, query_database_id)
        else:
            self.query_data_source_id = None
        self.title_property = title_property

    def upsert(self, stable_key: str, properties: dict[str, Any]) -> str:
        page_id = None
        if self.query_data_source_id:
            try:
                q = self.client.data_sources.query(
                    data_source_id=self.query_data_source_id,
                    filter={"property": self.title_property, "title": {"equals": stable_key}},
                    page_size=1,
                )
                if q.get("results"):
                    page_id = q["results"][0]["id"]
            except Exception:
                page_id = None
        if page_id:
            self.client.pages.update(page_id=page_id, properties=properties)
            return page_id
        created = self.client.pages.create(parent={self.parent_type: self.parent_id}, properties=properties)
        return created["id"]
