from __future__ import annotations

from .event_store import EventStore


def acquire(store: EventStore, decision_id: str, run_id: str, ttl_seconds: int = 900) -> bool:
    # optimistic lock stub
    return True


def release(store: EventStore, decision_id: str, run_id: str) -> None:
    return None
