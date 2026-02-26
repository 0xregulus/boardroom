#!/usr/bin/env bash
set -euo pipefail

is_true() {
  local value="${1:-}"
  value="$(printf "%s" "$value" | tr '[:upper:]' '[:lower:]')"
  [[ "$value" == "1" || "$value" == "true" || "$value" == "yes" || "$value" == "on" ]]
}

offline_mode=false
if is_true "${BOARDROOM_OFFLINE_MODE:-}"; then
  offline_mode=true
fi
# Backward-compatible alias.
if is_true "${BOARDROOM_SIMULATION_MODE:-}"; then
  offline_mode=true
fi
if is_true "${npm_config_offline:-}"; then
  offline_mode=true
fi
# Backward-compatible alias.
if is_true "${npm_config_simulation:-}"; then
  offline_mode=true
fi

next_args=()
for arg in "$@"; do
  if [[ "$arg" == "--offline" ]]; then
    offline_mode=true
    continue
  fi
  # Backward-compatible alias.
  if [[ "$arg" == "--simulation" ]]; then
    offline_mode=true
    continue
  fi
  next_args+=("$arg")
done

if [[ "$offline_mode" == true ]]; then
  export BOARDROOM_OFFLINE_MODE=true
  echo "[boardroom] Offline mode enabled. External provider calls are mocked."
fi

if [[ ${#next_args[@]} -gt 0 ]]; then
  exec next dev "${next_args[@]}"
fi

exec next dev
