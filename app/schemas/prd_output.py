from __future__ import annotations

from pydantic import BaseModel, Field


class PRDOutput(BaseModel):
    title: str
    scope: list[str]
    milestones: list[str]
    telemetry: list[str]
    risks: list[str]
    sections: dict[str, list[str]] = Field(default_factory=dict)
