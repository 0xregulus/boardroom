# AI-Driven Strategic Decision & PRD System

Multi-agent pipeline that:
1. Builds a strategic decision document from structured input.
2. Runs executive reviews in parallel (CEO, CFO, CTO, Compliance/Legal).
3. Synthesizes feedback and computes DQS.
4. Generates a PRD when approved.
5. Persists artifacts locally and optionally in Notion databases.

## Run (plain scripts)

Install deps on the fly and run scripts directly (no package install required):

```bash
uv run python app/runner.py
```

## Required Notion Environment Variables

Set these in `.env`:
- `NOTION_API_KEY`
- `NOTION_STRATEGIC_DECISIONS_DB_ID`
- `NOTION_EXECUTIVE_REVIEWS_DB_ID`
- `NOTION_PRDS_DB_ID`

Optional:
- `NOTION_RISKS_DB_ID`

## Notion Write Behavior

- Creates one `Strategic Decisions` record.
- Creates four linked `Executive Reviews` records.
- Creates one linked `PRDs` record when approved.
- Creates linked `Risks` records when optional risks DB is configured.
