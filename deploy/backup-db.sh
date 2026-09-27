#!/usr/bin/env bash
# Daily Postgres backup for the Sterun VPS, kept on the box AND off it.
#
#   bash deploy/backup-db.sh            # one backup now
#   15 3 * * * /opt/sterun/deploy/backup-db.sh   (what the crontab runs)
#
# Until the move to the VPS (2026-09-17) every backup was taken by hand before a
# deploy, and the only off-box copy was the homelab LXC that has now been shut
# down. This database holds the encrypted identity documents: the index can be
# rebuilt from the chain, the vault cannot be rebuilt from anything.
#
# Two copies, because they fail differently:
#
#   * on the box — fast to restore from, useless if the VPS is lost;
#   * in R2 (`sterun-backups`, private) — survives the box, and is the copy that
#     matters after a `DROP TABLE` or a provider incident.
#
# The dump is `pg_dump` plain SQL, gzipped: the same shape as every manual
# backup in backups/, so the restore procedure in be/OPERATIONS.md is unchanged.
#
# What this does NOT do: encrypt the dump beyond what is already encrypted
# inside it. PII columns are AES-GCM ciphertext whose keys live only in
# be/.env.production, so a leaked dump is not a leak of names — but it IS a leak
# of hashes, blind indexes and every bib. Keep the bucket private, and keep
# PII_KEYS out of any bucket.
set -euo pipefail
umask 077

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

KEEP_LOCAL="${BACKUP_KEEP_LOCAL:-14}"
KEEP_REMOTE_DAYS="${BACKUP_KEEP_REMOTE_DAYS:-60}"
DIR="$ROOT/backups/daily"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
FILE="$DIR/sterun-$STAMP.sql.gz"
LOG="$ROOT/backups/backup.log"
COMPOSE="docker compose -f compose.prod.yml"

log() { printf '%s %s\n' "$(date -u +%FT%TZ)" "$*" | tee -a "$LOG" >&2; }

mkdir -p "$DIR"
trap 'log "FAILED at line $LINENO"' ERR

# -- 1. dump ------------------------------------------------------------------
# `pg_dump` writes to stdout inside the container; the pipe never touches a
# temporary file that could outlive a crash with mode 644.
$COMPOSE exec -T postgres pg_dump -U "${POSTGRES_USER:-sterun}" -d "${POSTGRES_DB:-sterun}" </dev/null \
  | gzip > "$FILE"
SIZE="$(stat -c %s "$FILE")"
# A dump that is suspiciously small is a failure that exited 0 — an empty
# database, or a pg_dump that wrote its error to stdout.
if [ "$SIZE" -lt 10000 ]; then
  log "REFUSING a $SIZE-byte dump: that is not a full database"
  exit 1
fi
gzip -t "$FILE"
log "dumped $FILE ($SIZE bytes)"

# -- 2. off the box -----------------------------------------------------------
# Credentials come from the file the API already uses, so there is one place
# where they live. They are never printed.
set -a
# shellcheck disable=SC1091
. "$ROOT/be/.env.production"
set +a

if [ -n "${STERUN_R2_ACCOUNT_ID:-}" ] && [ -n "${STERUN_R2_ACCESS_KEY_ID:-}" ]; then
  ENDPOINT="https://${STERUN_R2_ACCOUNT_ID}.r2.cloudflarestorage.com"
  BUCKET="${BACKUP_R2_BUCKET:-sterun-backups}"
  aws() {
    docker run --rm -i \
      -e AWS_ACCESS_KEY_ID="$STERUN_R2_ACCESS_KEY_ID" \
      -e AWS_SECRET_ACCESS_KEY="$STERUN_R2_SECRET_ACCESS_KEY" \
      -e AWS_DEFAULT_REGION=auto \
      -v "$DIR:/backups:ro" \
      amazon/aws-cli:latest --endpoint-url "$ENDPOINT" "$@"
  }
  aws s3 cp "/backups/$(basename "$FILE")" "s3://$BUCKET/db/$(basename "$FILE")" >/dev/null
  log "uploaded s3://$BUCKET/db/$(basename "$FILE")"

  # Remote retention. Listing and deleting by name, not by a lifecycle rule:
  # the rule would live in a dashboard, and this file is the one place the
  # policy is written down.
  CUTOFF="$(date -u -d "-${KEEP_REMOTE_DAYS} days" +%Y%m%d)"
  aws s3 ls "s3://$BUCKET/db/" | awk '{print $4}' | while read -r key; do
    [ -n "$key" ] || continue
    day="$(printf '%s' "$key" | sed -n 's/^sterun-\([0-9]\{8\}\)T.*/\1/p')"
    [ -n "$day" ] || continue
    if [ "$day" -lt "$CUTOFF" ]; then
      aws s3 rm "s3://$BUCKET/db/$key" >/dev/null
      log "pruned remote $key (older than $KEEP_REMOTE_DAYS days)"
    fi
  done
else
  log "WARNING: no R2 credentials in be/.env.production — this backup exists only on this box"
fi

# -- 3. local retention -------------------------------------------------------
ls -1t "$DIR"/sterun-*.sql.gz 2>/dev/null | tail -n +"$((KEEP_LOCAL + 1))" | while read -r old; do
  rm -f "$old"
  log "pruned local $(basename "$old")"
done

log "ok: $(ls -1 "$DIR"/sterun-*.sql.gz | wc -l) local copies, newest $(basename "$FILE")"
