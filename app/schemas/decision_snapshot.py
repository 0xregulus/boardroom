from __future__ import annotations

from pydantic import BaseModel


class DecisionSnapshot(BaseModel):
    page_id: str
    captured_at: str
    properties: dict
    section_excerpt: list[dict]
    computed: dict

