from __future__ import annotations

from pathlib import Path

class EventStore:
    """Minimal placeholder event store."""

    def __init__(self, root: Path) -> None:
        self.root = root

    def log(self, *args, **kwargs) -> None:  # noqa: D401
        return None


def get_event_store(root: Path) -> EventStore:
    return EventStore(root)
