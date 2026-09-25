#!/data/data/com.termux/files/usr/bin/bash
set -u

LOG="$HOME/.agent-control-boot.log"
REPO="${AGENT_CONTROL_ANDROID_REPOSITORY:-$HOME/agent-control}"
TOKEN_FILE="$HOME/.config/agent-control/android-node-token"
NODE_PORT="${AGENT_CONTROL_NODE_PORT:-8788}"

mkdir -p "$HOME/.config/agent-control"
exec >>"$LOG" 2>&1
printf '\n[%s] Agent Control Android boot hook\n' "$(date -Iseconds 2>/dev/null || date)"

if command -v termux-wake-lock >/dev/null 2>&1; then
  termux-wake-lock || true
fi

if command -v sshd >/dev/null 2>&1; then
  if pgrep -f "$PREFIX/bin/sshd" >/dev/null 2>&1; then
    echo "sshd already running"
  else
    sshd && echo "sshd started" || echo "sshd start failed"
  fi
else
  echo "sshd unavailable; install openssh"
fi

if [ -d "$REPO" ] && [ -r "$TOKEN_FILE" ]; then
  if curl -fsS --max-time 2 "http://127.0.0.1:${NODE_PORT}/health" >/dev/null 2>&1; then
    echo "Android node already healthy"
  else
    export AGENT_CONTROL_NODE_TOKEN="$(tr -d '\r\n' < "$TOKEN_FILE")"
    cd "$REPO" || exit 0
    setsid ./android/start-node.sh > "$HOME/.agent-control-android-node.log" 2>&1 < /dev/null &
    echo "Android node start sent"
  fi
else
  echo "Android node boot start skipped; repository/token not available"
fi
