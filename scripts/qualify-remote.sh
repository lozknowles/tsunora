#!/usr/bin/env bash
set -euo pipefail
ROOT="${AGENT_CONTROL_ROOT:-$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)}"
cd "$ROOT"

# Deliberately no secrets are accepted as command-line arguments. Optional
# environment is loaded from a local protected file on the core host.
ENV_FILE="${AGENT_CONTROL_QUALIFY_ENV_FILE:-$HOME/.config/agent-control/qualify.env}"
if [[ -f "$ENV_FILE" ]]; then
  mode="$(stat -c '%a' "$ENV_FILE")"
  if [[ "$mode" != "600" && "$mode" != "400" ]]; then
    echo "REFUSE qualification env permissions=$mode expected=600-or-400" >&2
    exit 77
  fi
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

exec npm run qualify:all
