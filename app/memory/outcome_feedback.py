from __future__ import annotations

from dataclasses import dataclass


@dataclass
class OutcomeFeedback:
    decision_id: str
    outcome: str
    lessons_learned: str

