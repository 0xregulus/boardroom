from __future__ import annotations

from dataclasses import dataclass


@dataclass
class RunModel:
    run_id: str
    decision_id: str
    status: str
    started_at: str
    ended_at: str | None = None

