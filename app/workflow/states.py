from __future__ import annotations

from enum import Enum


class DecisionWorkflowState(str, Enum):
    PROPOSED = "PROPOSED"
    LOCKED = "LOCKED"
    SNAPSHOTTED = "SNAPSHOTTED"
    RETRIEVED_MEMORY = "RETRIEVED_MEMORY"
    REVIEWING = "REVIEWING"
    SYNTHESIZED = "SYNTHESIZED"
    DECIDED = "DECIDED"
    PERSISTED = "PERSISTED"
    UNLOCKED = "UNLOCKED"

