#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail

cd "$(dirname "$0")/.."
BOOT_DIR="$HOME/.termux/boot"
BOOT_FILE="$BOOT_DIR/agent-control.sh"
TOKEN_FILE="$HOME/.config/agent-control/android-node-token"

if ! command -v sshd >/dev/null 2>&1; then
  echo "Installing openssh in Termux..."
  pkg install -y openssh
fi

mkdir -p "$BOOT_DIR" "$HOME/.config/agent-control"
cp android/termux-boot-agent-control.sh "$BOOT_FILE"
chmod 700 "$BOOT_FILE"

if [ -n "${AGENT_CONTROL_NODE_TOKEN:-}" ]; then
  umask 077
  printf '%s\n' "$AGENT_CONTROL_NODE_TOKEN" > "$TOKEN_FILE"
  chmod 600 "$TOKEN_FILE"
  echo "Stored existing Agent Control node token for boot recovery."
elif [ -r "$TOKEN_FILE" ]; then
  echo "Existing Android node token retained."
else
  echo "No Android-local node token configured; sshd will still persist at boot."
  echo "A configured Agent Control controller can recover the node after SSH becomes available."
fi

if pgrep -f "$PREFIX/bin/sshd" >/dev/null 2>&1; then
  echo "sshd already running"
else
  sshd
  echo "sshd started"
fi

echo
printf 'Installed Termux boot hook: %s\n' "$BOOT_FILE"
echo "IMPORTANT: Termux:Boot must be installed and opened once on Android for boot hooks to run."
echo "After that, reboot testing should begin from the configured controller with: npm run up"
