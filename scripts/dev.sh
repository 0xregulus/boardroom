#!/usr/bin/env bash
set -euo pipefail

is_true() {
  local value="${1:-}"
  value="$(printf "%s" "$value" | tr '[:upper:]' '[:lower:]')"
  [[ "$value" == "1" || "$value" == "true" || "$value" == "yes" || "$value" == "on" ]]
}

simulation_mode=false
if is_true "${BOARDROOM_SIMULATION_MODE:-}"; then
  simulation_mode=true
fi
if is_true "${npm_config_simulation:-}"; then
  simulation_mode=true
fi

next_args=()
for arg in "$@"; do
  if [[ "$arg" == "--simulation" ]]; then
    simulation_mode=true
    continue
  fi
  next_args+=("$arg")
done

if [[ "$simulation_mode" == true ]]; then
  export BOARDROOM_SIMULATION_MODE=true
  echo "[boardroom] Simulation mode enabled. External provider calls are mocked."
fi

if [[ ${#next_args[@]} -gt 0 ]]; then
  exec next dev "${next_args[@]}"
fi

exec next dev
