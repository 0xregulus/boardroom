# Setup and Operations

## Prerequisites
- Node.js 20+
- npm
- PostgreSQL instance reachable by `POSTGRES_URL`

## Environment

Copy `.env.example` to `.env` and set required values.

Required:
- `POSTGRES_URL`
- at least one provider key (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `MISTRAL_API_KEY`, `META_API_KEY`)

Common optional:
- `BOARDROOM_PROVIDER` (default model provider)
- `BOARDROOM_MODEL` (default model name)
- `TAVILY_API_KEY` (enables external research mode)
- `BOARDROOM_ADMIN_KEY` (required for non-loopback access to sensitive endpoints)
- `BOARDROOM_RUN_APPROVAL_KEY` (used when workflow approval policy is active)

Security and policy toggles:
- `BOARDROOM_REQUIRE_BULK_RUN_APPROVAL`
- `BOARDROOM_REQUIRE_EXTERNAL_RESEARCH_APPROVAL`
- `BOARDROOM_REQUIRE_SENSITIVE_OUTPUT_APPROVAL`
- `BOARDROOM_MAX_BULK_RUN_DECISIONS`
- `BOARDROOM_TRUST_PROXY`
- `BOARDROOM_RATE_LIMIT_BACKEND`

## Install

```bash
npm install
```

## Seed Sample Data

```bash
npm run db:seed -- --reset
```

## Run

Development server:

```bash
npm run dev
```

Production build:

```bash
npm run build
npm run start
```

## Quality and Security Checks

```bash
npm run lint
npm run typecheck
npm run test
npm run test:coverage
npm run security:audit
npm run security:doctor
```
