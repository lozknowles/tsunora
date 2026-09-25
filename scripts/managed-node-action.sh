#!/bin/sh
set -eu

operation=${1-}
target=${2-}
value=${3-}

safe_package() {
  [ -n "$1" ] && case "$1" in *[!A-Za-z0-9+._-]*) return 1;; *) return 0;; esac
}

safe_unit() {
  [ -n "$1" ] || return 1
  case "$1" in
    *[!A-Za-z0-9@_.:-]*) return 1;;
    *.service|*.timer|*.socket) return 0;;
    *) return 1;;
  esac
}

package_manager() {
  for manager in apt-get dnf yum zypper pacman apk; do
    if command -v "$manager" >/dev/null 2>&1; then printf '%s\n' "$manager"; return 0; fi
  done
  return 1
}

case "$operation" in
  system.identity)
    hostnamectl 2>/dev/null || { hostname; uname -a; }
    ;;
  process.list)
    ps -eo pid=,ppid=,user=,etimes=,pcpu=,pmem=,stat=,comm=
    ;;
  logs.read)
    safe_unit "$target" || { echo invalid_service_unit >&2; exit 64; }
    case "$value" in ''|*[!0-9]*) echo invalid_line_count >&2; exit 64;; esac
    [ "$value" -ge 1 ] && [ "$value" -le 500 ] || { echo invalid_line_count >&2; exit 64; }
    journalctl -u "$target" --no-pager -n "$value" --output=short-iso
    ;;
  package.query)
    safe_package "$target" || { echo invalid_package_name >&2; exit 64; }
    if command -v dpkg-query >/dev/null 2>&1; then
      dpkg-query -W -f='${Package}\t${Version}\t${Status}\n' "$target"
    elif command -v rpm >/dev/null 2>&1; then rpm -q "$target"
    elif command -v apk >/dev/null 2>&1; then apk info -v "$target"
    else echo package_query_unavailable >&2; exit 69
    fi
    ;;
  service.status)
    safe_unit "$target" || { echo invalid_service_unit >&2; exit 64; }
    systemctl show "$target" -p Id -p LoadState -p ActiveState -p SubState -p UnitFileState -p MainPID --no-pager
    ;;
  housekeeping.preview)
    df -P -B1 -x tmpfs -x devtmpfs
    command -v journalctl >/dev/null 2>&1 && journalctl --disk-usage || true
    ;;
  package.install|package.remove)
    safe_package "$target" || { echo invalid_package_name >&2; exit 64; }
    manager=$(package_manager) || { echo package_manager_unavailable >&2; exit 69; }
    verb=${operation#package.}
    case "$manager:$verb" in
      apt-get:install) sudo -n apt-get -y install -- "$target";;
      apt-get:remove) sudo -n apt-get -y remove -- "$target";;
      dnf:*|yum:*) sudo -n "$manager" -y "$verb" "$target";;
      zypper:*) sudo -n zypper --non-interactive "$verb" "$target";;
      pacman:install) sudo -n pacman --noconfirm -S "$target";;
      pacman:remove) sudo -n pacman --noconfirm -R "$target";;
      apk:install) sudo -n apk add "$target";;
      apk:remove) sudo -n apk del "$target";;
      *) echo package_operation_unavailable >&2; exit 69;;
    esac
    ;;
  package.update)
    manager=$(package_manager) || { echo package_manager_unavailable >&2; exit 69; }
    case "$manager" in
      apt-get) sudo -n apt-get update && sudo -n apt-get -y upgrade;;
      dnf|yum) sudo -n "$manager" -y upgrade;;
      zypper) sudo -n zypper --non-interactive update;;
      pacman) sudo -n pacman --noconfirm -Syu;;
      apk) sudo -n apk update && sudo -n apk upgrade;;
    esac
    ;;
  service.start|service.stop|service.restart)
    safe_unit "$target" || { echo invalid_service_unit >&2; exit 64; }
    verb=${operation#service.}
    sudo -n systemctl "$verb" "$target"
    ;;
  housekeeping.journal-vacuum)
    case "$value" in ''|*[!0-9]*) echo invalid_vacuum_size >&2; exit 64;; esac
    [ "$value" -ge 16 ] && [ "$value" -le 4096 ] || { echo invalid_vacuum_size >&2; exit 64; }
    sudo -n journalctl "--vacuum-size=${value}M"
    ;;
  runtime.update)
    case "$target" in /*) ;; *) echo invalid_runtime_directory >&2; exit 64;; esac
    [ "$target" != / ] || { echo invalid_runtime_directory >&2; exit 64; }
    case "$value" in ''|*[!A-Za-z0-9._/-]*) echo invalid_runtime_branch >&2; exit 64;; esac
    git -C "$target" fetch --prune origin "$value"
    git -C "$target" merge --ff-only "origin/$value"
    ;;
  system.reboot)
    sudo -n systemctl reboot
    ;;
  system.shutdown)
    sudo -n systemctl poweroff
    ;;
  *)
    echo unsupported_managed_node_operation >&2
    exit 64
    ;;
esac
