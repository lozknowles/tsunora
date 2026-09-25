#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
: "${AGENT_CONTROL_NODE_TOKEN:?Set AGENT_CONTROL_NODE_TOKEN to a long random secret}"
export AGENT_CONTROL_NODE_HOST="${AGENT_CONTROL_NODE_HOST:-127.0.0.1}"
export AGENT_CONTROL_NODE_PORT="${AGENT_CONTROL_NODE_PORT:-8788}"
exec node android/node-server.mjs
