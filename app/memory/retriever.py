from __future__ import annotations

from pathlib import Path
import json


def retrieve_local_memory(history_file: Path, max_items: int = 5) -> list[dict]:
    if not history_file.exists():
        return []
    lines = history_file.read_text(encoding="utf-8").splitlines()[-max_items:]
    out = []
    for line in lines:
        if not line.strip():
            continue
        try:
            out.append(json.loads(line))
        except json.JSONDecodeError:
            continue
    return out

