from __future__ import annotations

from typing import Any


def to_rich_text(value: str) -> dict[str, Any]:
    return {"rich_text": [{"type": "text", "text": {"content": value[:1900]}}]}


def to_title(value: str) -> dict[str, Any]:
    return {"title": [{"type": "text", "text": {"content": value[:1900]}}]}

