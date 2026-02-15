from __future__ import annotations

import os

from dotenv import load_dotenv
from notion_client import Client


def get_notion_client() -> Client:
    load_dotenv(".env")
    api_key = os.getenv("NOTION_API_KEY")
    if not api_key:
        raise ValueError("NOTION_API_KEY is required.")
    return Client(auth=api_key)

