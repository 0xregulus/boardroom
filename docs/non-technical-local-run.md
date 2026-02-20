# Non-Technical Local Run Guide

This guide is for PMs, CEOs, and founders who want to run Boardroom locally without manual engineering setup.

## What this does for you

The guided launcher:
- creates `.env` from `.env.example` if missing
- sets up a local PostgreSQL URL automatically
- starts the bundled PostgreSQL container from `docker-compose.yml`
- installs dependencies
- applies the selected data mode (zero data, demo data, or fresh reset to zero)
- starts the app on `http://localhost:3000`

## One-time install (5 minutes)

1. Install [Node.js 20+](https://nodejs.org/en/download).
2. Install [Docker Desktop](https://www.docker.com/products/docker-desktop/).
3. Keep one AI API key ready (OpenAI recommended).

## Start Boardroom

Choose one command mode:

1. `npm run local:start` for zero data.
2. `npm run local:start:demo` to load demo data.
3. `npm run local:start:fresh` to reset tables and keep zero data.

Or use macOS Finder:

1. Double-click `Start-Boardroom.command` (same as `npm run local:start`, zero data).

Then follow prompts in the terminal window.

## Data modes summary

- `local:start`: no seed, no reset.
- `local:start:demo`: seed demo strategy records.
- `local:start:fresh`: truncate strategy tables and keep them empty.

## Stop Boardroom

1. In the terminal running Boardroom, press `Ctrl + C`.
2. Optional: stop local PostgreSQL container:

```bash
docker compose stop postgres
```

## Troubleshooting

- `Node.js 20+ is required`: install/update Node and rerun.
- `Docker is installed but not running`: open Docker Desktop and wait until it is ready.
- `port is already allocated` for `5432`: another Postgres is already using that port. Stop it, or update `POSTGRES_URL` in `.env` to your existing Postgres instance.
- `POSTGRES_URL is required`: rerun and paste your database URL when prompted.
- Workflow errors about provider keys: rerun and provide an API key, or add one in `.env`.
