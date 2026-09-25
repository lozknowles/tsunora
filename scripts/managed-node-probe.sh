#!/bin/sh
set -u

# A fixed, read-only inventory protocol for agentless Linux nodes. Values are
# base64 encoded so host-provided text cannot alter the record framing.
emit() {
  key=$1
  value=${2-}
  encoded=$(printf '%s' "$value" | base64 | tr -d '\n')
  printf '%s\t%s\n' "$key" "$encoded"
}
tab=$(printf '\t')

emit_value() {
  [ -n "${2-}" ] || return 0
  emit "$1" "$2"
}

first_value() {
  sed -n "s/^$1=//p" /etc/os-release 2>/dev/null | head -n 1 | sed 's/^"//;s/"$//'
}

emit protocol agent-control.managed-node-probe/v1
emit hostname "$(hostname 2>/dev/null || uname -n)"
emit os_id "$(first_value ID)"
emit os_name "$(first_value PRETTY_NAME)"
emit os_version "$(first_value VERSION_ID)"
emit kernel "$(uname -r 2>/dev/null || true)"
emit architecture "$(uname -m 2>/dev/null || true)"
emit cpu_model "$(sed -n 's/^model name[[:space:]]*:[[:space:]]*//p' /proc/cpuinfo 2>/dev/null | head -n 1)"

cpu_logical=$(getconf _NPROCESSORS_ONLN 2>/dev/null || true)
cpu_logical_source=''
if [ -n "$cpu_logical" ]; then
  cpu_logical_source='getconf:_NPROCESSORS_ONLN'
else
  cpu_logical=0
  for cpu_path in /sys/devices/system/cpu/cpu[0-9]*; do
    [ -d "$cpu_path" ] || continue
    online=1
    if [ -r "$cpu_path/online" ]; then online=$(cat "$cpu_path/online" 2>/dev/null || printf 0); fi
    [ "$online" = 1 ] && cpu_logical=$((cpu_logical + 1))
  done
  if [ "$cpu_logical" -gt 0 ]; then cpu_logical_source='/sys/devices/system/cpu/cpu*/online'; else cpu_logical=''; fi
fi
emit_value cpu_logical "$cpu_logical"
emit_value cpu_logical_source "$cpu_logical_source"

memory_total=$(awk '/^MemTotal:/ {print $2 * 1024; exit}' /proc/meminfo 2>/dev/null)
memory_available=$(awk '/^MemAvailable:/ {print $2 * 1024; exit}' /proc/meminfo 2>/dev/null)
memory_source=''
if [ -n "$memory_total" ] || [ -n "$memory_available" ]; then
  memory_source='/proc/meminfo'
elif command -v node >/dev/null 2>&1; then
  memory_total=$(node -e 'process.stdout.write(String(require("node:os").totalmem()))' 2>/dev/null || true)
  memory_available=$(node -e 'process.stdout.write(String(require("node:os").freemem()))' 2>/dev/null || true)
  if [ -n "$memory_total" ] || [ -n "$memory_available" ]; then memory_source='node:os'; fi
fi
emit_value memory_total_bytes "$memory_total"
emit_value memory_available_bytes "$memory_available"
emit_value memory_total_bytes_source "$memory_source"
emit_value memory_available_bytes_source "$memory_source"

uptime=$(cut -d. -f1 /proc/uptime 2>/dev/null || true)
uptime_source=''
if [ -n "$uptime" ]; then
  uptime_source='/proc/uptime'
elif command -v node >/dev/null 2>&1; then
  uptime=$(node -e 'process.stdout.write(String(Math.floor(require("node:os").uptime())))' 2>/dev/null || true)
  if [ -n "$uptime" ]; then uptime_source='node:os.uptime'; fi
fi
emit_value uptime_seconds "$uptime"
emit_value uptime_seconds_source "$uptime_source"

load_values=$(cat /proc/loadavg 2>/dev/null || true)
load_source=''
if [ -n "$load_values" ]; then
  load_source='/proc/loadavg'
elif command -v node >/dev/null 2>&1; then
  load_values=$(node -e 'process.stdout.write(require("node:os").loadavg().join(" "))' 2>/dev/null || true)
  if [ -n "$load_values" ]; then load_source='node:os.loadavg'; fi
fi
if [ -n "$load_values" ]; then
  set -- $load_values
  emit_value load_1 "${1-}"
  emit_value load_5 "${2-}"
  emit_value load_15 "${3-}"
  emit load_source "$load_source"
fi

# Prefer the aggregate kernel counters. If procfs is hidden (notably on some
# Android/Termux configurations), expose per-CPU idle time as a derived-only
# fallback. Agent Control needs two samples before it can calculate busy time.
proc_cpu=$(awk '$1 == "cpu" {idle=$5+$6; total=0; for (i=2; i<=NF; i++) total+=$i; print idle "\t" total; exit}' /proc/stat 2>/dev/null)
if [ -n "$proc_cpu" ]; then
  old_ifs=$IFS; IFS=$tab; set -- $proc_cpu; IFS=$old_ifs
  emit cpu_counter_kind procfs-times
  emit cpu_counter "aggregate${tab}true${tab}${1}${tab}${2}"
  emit_value cpu_counter_logical_online "$cpu_logical"
else
  cpu_counter_count=0
  counter_online=0
  for cpu_path in /sys/devices/system/cpu/cpu[0-9]*; do
    [ -d "$cpu_path" ] || continue
    cpu_name=${cpu_path##*/}
    online=true
    if [ -r "$cpu_path/online" ] && [ "$(cat "$cpu_path/online" 2>/dev/null || printf 0)" != 1 ]; then online=false; fi
    idle_total=0
    idle_visible=false
    for state_time in "$cpu_path"/cpuidle/state*/time; do
      [ -r "$state_time" ] || continue
      idle_value=$(cat "$state_time" 2>/dev/null || true)
      case "$idle_value" in ''|*[!0-9]*) continue;; esac
      idle_total=$((idle_total + idle_value))
      idle_visible=true
    done
    [ "$idle_visible" = true ] || continue
    emit cpu_counter "${cpu_name}${tab}${online}${tab}${idle_total}"
    cpu_counter_count=$((cpu_counter_count + 1))
    [ "$online" = true ] && counter_online=$((counter_online + 1))
  done
  if [ "$cpu_counter_count" -gt 0 ]; then
    emit cpu_counter_kind sysfs-idle
    emit cpu_counter_logical_online "$counter_online"
  fi
fi

if command -v df >/dev/null 2>&1; then
  df -P -B1 -x tmpfs -x devtmpfs 2>/dev/null | awk 'NR > 1 {mount=$6; for (i=7; i<=NF; i++) mount=mount " " $i; print $1 "\t" $2 "\t" $4 "\t" $5 "\t" mount}' |
  while IFS= read -r row; do emit storage "$row"; done
fi

optical_names=''
if command -v lsblk >/dev/null 2>&1; then
  optical_names=$(lsblk -dn -o KNAME,TYPE 2>/dev/null | awk '$2 == "rom" {print $1}')
  for name in $optical_names; do
    device="/dev/$name"
    model=$(lsblk -dn -o MODEL "$device" 2>/dev/null | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
    transport=$(lsblk -dn -o TRAN "$device" 2>/dev/null | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
    emit optical "${name}${tab}${model}${tab}${transport}"
    holders=''
    if command -v lsof >/dev/null 2>&1; then holders=$(lsof -t "$device" 2>/dev/null | sort -u); fi
    if [ -z "$holders" ] && command -v fuser >/dev/null 2>&1; then holders=$(fuser "$device" 2>/dev/null | tr ' ' '\n' | sed '/^$/d' | sort -u); fi
    for pid in $holders; do emit optical_holder "${name}${tab}${pid}"; done
  done
fi

if command -v ip >/dev/null 2>&1; then
  ip -brief address show 2>/dev/null | while IFS= read -r row; do emit network "$row"; done
fi

for zone in /sys/class/thermal/thermal_zone*; do
  [ -r "$zone/temp" ] || continue
  kind=$(cat "$zone/type" 2>/dev/null || basename "$zone")
  value=$(cat "$zone/temp" 2>/dev/null || true)
  emit temperature "${kind}${tab}${value}"
done

if command -v systemctl >/dev/null 2>&1; then
  emit service_manager systemd
  systemctl list-units --type=service --state=running --no-legend --no-pager 2>/dev/null | awk '{print $1}' |
  while IFS= read -r unit; do [ -n "$unit" ] && emit service "$unit"; done
fi

for tool in sh bash podman docker lxc-start apt-get dpkg dnf yum rpm pacman zypper apk snap flatpak systemctl service journalctl git curl rsync makemkvcon HandBrakeCLI dvdbackup vobcopy cdparanoia abcde ffmpeg; do
  if command -v "$tool" >/dev/null 2>&1; then emit tool "$tool"; fi
done

for proc in /proc/[0-9]*; do
  [ -r "$proc/comm" ] || continue
  pid=${proc##*/}
  comm=$(cat "$proc/comm" 2>/dev/null || true)
  arg0=$(tr '\000' '\n' < "$proc/cmdline" 2>/dev/null | sed -n '1p')
  arg1=$(tr '\000' '\n' < "$proc/cmdline" 2>/dev/null | sed -n '2p')
  arg0=${arg0##*/}
  arg1=${arg1##*/}
  unit=$(awk -F: '{print $3}' "$proc/cgroup" 2>/dev/null | tr '/' '\n' | sed -n '/\.service$/p' | head -n 1)
  emit process "${pid}${tab}${comm}${tab}${arg0}${tab}${arg1}${tab}${unit}"
done

emit probe_complete true
