from __future__ import annotations

from pydantic import BaseModel, Field


class ReviewRisk(BaseModel):
    type: str
    severity: int = Field(ge=1, le=10)
    evidence: str


class ReviewOutput(BaseModel):
    agent: str
    thesis: str
    score: int = Field(ge=1, le=10)
    confidence: float = Field(ge=0, le=1)
    blocked: bool
    blockers: list[str] = Field(default_factory=list)
    risks: list[ReviewRisk] = Field(default_factory=list)
    required_changes: list[str] = Field(default_factory=list)
    approval_conditions: list[str] = Field(default_factory=list)
    apga_impact_view: str
    governance_checks_met: dict[str, bool] = Field(default_factory=dict)

