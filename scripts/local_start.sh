#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

RUN_MODE="zero"

set_run_mode() {
  local next_mode="$1"
  if [[ "$RUN_MODE" != "zero" && "$RUN_MODE" != "$next_mode" ]]; then
    echo "[Boardroom Easy Start] Choose only one mode: --demo or --fresh." >&2
    exit 1
  fi
  RUN_MODE="$next_mode"
}

print_usage() {
  cat <<'EOF'
Usage: bash scripts/local_start.sh [--demo|--fresh]

Options:
  --demo    Seed demo strategy data.
  --fresh   Reset strategy data tables and keep zero data.
  --help    Show this help message.
EOF
}

for arg in "$@"; do
  case "$arg" in
    --demo)
      set_run_mode "demo"
      ;;
    --fresh)
      set_run_mode "fresh"
      ;;
    --help|-h)
      print_usage
      exit 0
      ;;
    *)
      echo "[Boardroom Easy Start] Unknown option: $arg" >&2
      print_usage
      exit 1
      ;;
  esac
done

info() {
  echo "[Boardroom Easy Start] $1"
}

warn() {
  echo "[Boardroom Easy Start] $1" >&2
}

fail() {
  echo "[Boardroom Easy Start] $1" >&2
  exit 1
}

command_exists() {
  command -v "$1" >/dev/null 2>&1
}

has_docker_compose_file() {
  [[ -f docker-compose.yml || -f docker-compose.yaml || -f compose.yml || -f compose.yaml ]]
}

read_env_var() {
  local key="$1"

  if [[ ! -f .env ]]; then
    return 0
  fi

  local line
  line="$(grep -E "^${key}=" .env | head -n 1 || true)"
  if [[ -z "$line" ]]; then
    return 0
  fi

  printf '%s' "${line#*=}"
}

upsert_env_var() {
  local key="$1"
  local value="$2"
  local file="$3"
  local tmp_file

  tmp_file="$(mktemp)"
  awk -v key="$key" -v value="$value" '
    BEGIN { updated = 0 }
    index($0, key "=") == 1 {
      print key "=" value
      updated = 1
      next
    }
    { print }
    END {
      if (updated == 0) {
        print key "=" value
      }
    }
  ' "$file" > "$tmp_file"

  mv "$tmp_file" "$file"
}

start_local_postgres() {
  if ! command_exists docker || ! docker compose version >/dev/null 2>&1; then
    fail "Docker Compose is required for the built-in local PostgreSQL option."
  fi

  if ! has_docker_compose_file; then
    fail "docker-compose.yml is missing. Cannot auto-start local PostgreSQL."
  fi

  if ! docker info >/dev/null 2>&1; then
    fail "Docker is installed but not running. Start Docker Desktop and rerun."
  fi

  info "Starting local PostgreSQL container..."
  docker compose up -d postgres

  local attempts=30
  local attempt=1
  while [[ "$attempt" -le "$attempts" ]]; do
    if docker compose exec -T postgres pg_isready -U boardroom -d boardroom >/dev/null 2>&1; then
      info "Local PostgreSQL is ready."
      return
    fi

    sleep 2
    attempt=$((attempt + 1))
  done

  fail "PostgreSQL did not become ready in time. Check Docker logs with: docker compose logs postgres"
}

ensure_node_and_npm() {
  if ! command_exists node; then
    fail "Node.js is not installed. Install Node.js 20+ from https://nodejs.org and rerun."
  fi

  if ! command_exists npm; then
    fail "npm is not installed. Reinstall Node.js from https://nodejs.org and rerun."
  fi

  local node_major
  node_major="$(node -p 'Number(process.versions.node.split(".")[0])' 2>/dev/null || echo 0)"
  if [[ "$node_major" -lt 20 ]]; then
    fail "Node.js 20+ is required. Current version: $(node -v)"
  fi
}

ensure_env_file() {
  if [[ -f .env ]]; then
    return
  fi

  if [[ ! -f .env.example ]]; then
    fail ".env.example was not found. Cannot create .env."
  fi

  cp .env.example .env
  info "Created .env from .env.example."
}

ensure_postgres_url() {
  local default_url
  default_url="postgresql://boardroom:boardroom@localhost:5432/boardroom"

  local current_url
  current_url="$(read_env_var POSTGRES_URL)"

  if [[ -n "$current_url" ]]; then
    if [[ "$current_url" == "$default_url" ]] && has_docker_compose_file && command_exists docker && docker compose version >/dev/null 2>&1; then
      info "POSTGRES_URL points to the built-in local database."
      start_local_postgres
      return
    fi

    info "Using PostgreSQL from existing POSTGRES_URL."
    return
  fi

  if command_exists docker && docker compose version >/dev/null 2>&1 && has_docker_compose_file; then
    upsert_env_var "POSTGRES_URL" "$default_url" ".env"
    info "POSTGRES_URL was missing. Set to local Docker database URL."
    start_local_postgres
    return
  fi

  warn "No POSTGRES_URL found and Docker Compose is unavailable."
  warn "Paste a PostgreSQL URL, then press Enter."
  printf "POSTGRES_URL: "

  local manual_url
  read -r manual_url
  if [[ -z "$manual_url" ]]; then
    fail "POSTGRES_URL is required."
  fi

  upsert_env_var "POSTGRES_URL" "$manual_url" ".env"
}

ensure_provider_key() {
  local openai_key anthropic_key mistral_key meta_key
  openai_key="$(read_env_var OPENAI_API_KEY)"
  anthropic_key="$(read_env_var ANTHROPIC_API_KEY)"
  mistral_key="$(read_env_var MISTRAL_API_KEY)"
  meta_key="$(read_env_var META_API_KEY)"

  if [[ -n "$openai_key" || -n "$anthropic_key" || -n "$mistral_key" || -n "$meta_key" ]]; then
    info "Using AI provider key from .env."
    return
  fi

  warn "No AI provider key found in .env."
  warn "Paste your OpenAI API key (recommended), then press Enter."
  printf "OPENAI_API_KEY: "

  read -r openai_key
  if [[ -z "$openai_key" ]]; then
    fail "At least one provider key is required to run workflows."
  fi

  upsert_env_var "OPENAI_API_KEY" "$openai_key" ".env"
  upsert_env_var "BOARDROOM_PROVIDER" "OpenAI" ".env"

  local model
  model="$(read_env_var BOARDROOM_MODEL)"
  if [[ -z "$model" ]]; then
    upsert_env_var "BOARDROOM_MODEL" "gpt-4o-mini" ".env"
  fi
}

install_dependencies() {
  info "Installing project dependencies (npm install)..."
  npm install
}

prepare_data_mode() {
  if [[ "$RUN_MODE" == "demo" ]]; then
    info "Seeding demo strategy data..."
    npm run db:seed
    return
  fi

  if [[ "$RUN_MODE" == "fresh" ]]; then
    info "Resetting strategy data tables and keeping zero data..."
    npm run db:reset
    return
  fi

  info "Starting with zero data (no seed and no reset)."
}

start_app() {
  info "Starting Boardroom at http://localhost:3000"
  info "Keep this terminal window open. Press Ctrl+C to stop the app."
  npm run dev
}

info "Preparing Boardroom local run..."
ensure_node_and_npm
ensure_env_file
ensure_postgres_url
ensure_provider_key
install_dependencies
prepare_data_mode
start_app
