#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
# SPDX-License-Identifier: AGPL-3.0-or-later

# Alerts (Phase 29, D75), with the settings of /etc/tacto/notify.env:
#   tacto-monitor.sh failed UNIT   push "UNIT failed" to NOTIFY_URL (ntfy); run by tacto-notify@.service
#   tacto-monitor.sh disk          push a warning when a disk holding DISK_PATHS is DISK_ALERT_PERCENT full
#   tacto-monitor.sh heartbeat     ping HEARTBEAT_URL, the dead man's switch, after each nightly backup
# While the date in SILENCE_FILE is in the future, "failed" and "disk" only write to the journal
# (maintenance; README → Operations → Monitoring). Messages name units and disks only, never data.
set -euo pipefail

THRESHOLD=${DISK_ALERT_PERCENT:-80}
PATHS=${DISK_PATHS:-/var/lib/tacto /var/backups/tacto}
SILENCE_FILE=${SILENCE_FILE:-/run/tacto-silence-until}
HOST=$(uname -n)

# notify TITLE MESSAGE: one ntfy message, or only the journal while silenced.
notify() {
  if [ -f "$SILENCE_FILE" ]; then
    local until
    until=$(date -d "$(head -n 1 "$SILENCE_FILE")" +%s 2>/dev/null || echo 0)
    if [ "$until" -gt "$(date +%s)" ]; then
      echo "Silenced until $(head -n 1 "$SILENCE_FILE"): $1. $2"
      return 0
    fi
  fi
  : "${NOTIFY_URL:?is not set (see /etc/tacto/notify.env)}"
  local auth=()
  if [ -n "${NOTIFY_TOKEN:-}" ]; then auth=(-H "Authorization: Bearer $NOTIFY_TOKEN"); fi
  curl -fsS -m 15 --retry 3 -o /dev/null "${auth[@]}" \
    -H "Title: $1" -H "Priority: high" -H "Tags: warning" --data-binary "$2" "$NOTIFY_URL"
  echo "Notification sent: $1. $2"
}

case "${1:-}" in
  failed)
    unit=${2:?usage: tacto-monitor.sh failed UNIT}
    notify "Tacto: $unit failed on $HOST" "See: journalctl -u $unit -n 50"
    ;;
  disk)
    # shellcheck disable=SC2086 # PATHS is a space-separated list
    usage=$(df --output=pcent,target $PATHS) # fails, and so alerts, if a path is missing
    full=""
    # One line per file system, even when several paths are on the same one.
    while read -r pcent target; do
      used=${pcent%\%}
      if [ "$used" -ge "$THRESHOLD" ]; then full+="$target is $used % full. "; fi
    done < <(tail -n +2 <<<"$usage" | sort -u)
    if [ -n "$full" ]; then
      notify "Tacto: disk almost full on $HOST" "${full}Database and backups: $PATHS"
    else
      echo "Disks below $THRESHOLD %: $PATHS"
    fi
    ;;
  heartbeat)
    : "${HEARTBEAT_URL:?is not set (see /etc/tacto/notify.env)}"
    curl -fsS -m 15 --retry 3 -o /dev/null "$HEARTBEAT_URL"
    echo "Heartbeat sent."
    ;;
  *)
    echo "usage: tacto-monitor.sh failed UNIT | disk | heartbeat" >&2
    exit 2
    ;;
esac
