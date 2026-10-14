#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
# SPDX-License-Identifier: AGPL-3.0-or-later

# Off-server copy of the newest nightly backup (D72), with restic: encrypted on this server,
# then sent to the repository of /etc/tacto/offsite.env (S3-compatible storage, Backblaze B2,
# or another server over SFTP). Run by tacto-offsite-backup.service once tacto-backup.service
# has succeeded; by hand: sudo systemctl start tacto-offsite-backup
#
# Each run: upload the newest backup, read it back and compare it with the local file (so every
# night proves the copy can be restored), keep 14 daily, 8 weekly and 12 monthly copies, and
# check the repository. Any failure stops the script with a non-zero status (journalctl).
set -euo pipefail

BACKUP_DIR=${BACKUP_DIR:-/var/backups/tacto}
KEEP_DAILY=${OFFSITE_KEEP_DAILY:-14}
KEEP_WEEKLY=${OFFSITE_KEEP_WEEKLY:-8}
KEEP_MONTHLY=${OFFSITE_KEEP_MONTHLY:-12}
NAME=cmms.sqlite

: "${RESTIC_REPOSITORY:?is not set (see /etc/tacto/offsite.env)}"
: "${RESTIC_PASSWORD:?is not set (see /etc/tacto/offsite.env)}"

# Backup names hold their UTC time (cmms-2026-10-04T02-30-00Z.sqlite), so the last one is the newest.
latest=$(find "$BACKUP_DIR" -maxdepth 1 -name 'cmms-*.sqlite' -type f | sort | tail -n 1)
if [ -z "$latest" ]; then
  echo "No backup in $BACKUP_DIR: run tacto-backup first." >&2
  exit 1
fi

# Every snapshot holds one file with the same name, so a restore is: restic dump latest cmms.sqlite
restic backup --quiet --tag tacto --stdin --stdin-filename "$NAME" < "$latest"

local_sum=$(sha256sum < "$latest" | cut -d' ' -f1)
remote_sum=$(restic dump --tag tacto latest "$NAME" | sha256sum | cut -d' ' -f1)
if [ "$local_sum" != "$remote_sum" ]; then
  echo "The copy read back from $RESTIC_REPOSITORY differs from $latest." >&2
  exit 1
fi

restic forget --quiet --tag tacto --keep-daily "$KEEP_DAILY" --keep-weekly "$KEEP_WEEKLY" \
  --keep-monthly "$KEEP_MONTHLY" --prune
restic check --quiet

echo "Off-server copy of $(basename "$latest") stored and verified in $RESTIC_REPOSITORY."
