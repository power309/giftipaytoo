#!/usr/bin/env bash
# GiftiPay database backup — pg_dump wrapper.
#
# Reads the connection string from $DATABASE_URL, dumps it in PostgreSQL's
# custom format (needed by pg_restore / scripts/restore.sh), gzips it, and
# writes a timestamped file. Applies a retention policy afterwards.
#
# Usage:
#   scripts/backup.sh [--dry-run] [--retention-days N] [--out-dir DIR]
#   npm run backup                # same as: scripts/backup.sh
#
# The connection string (and therefore the DB password it may contain) is
# passed to pg_dump as an argument only — it is never echoed, logged, or
# written to a file by this script. Log lines show a redacted form instead.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

BACKUP_DIR="${BACKUP_DIR:-$PROJECT_ROOT/backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
DRY_RUN=false

usage() {
  cat <<'EOF'
Usage: scripts/backup.sh [options]

Options:
  --dry-run               Show what would happen; write and delete nothing.
  --retention-days N       Delete dumps older than N days (default: 14, or $BACKUP_RETENTION_DAYS).
  --out-dir DIR            Directory to write dumps into (default: ./backups, or $BACKUP_DIR).
  -h, --help               Show this help.

Reads the database connection from $DATABASE_URL — required, never printed.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY_RUN=true; shift ;;
    --retention-days) RETENTION_DAYS="${2:?--retention-days requires a value}"; shift 2 ;;
    --out-dir) BACKUP_DIR="${2:?--out-dir requires a value}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "گزینه ناشناخته: $1" >&2; usage; exit 1 ;;
  esac
done

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "خطا: متغیر محیطی DATABASE_URL تنظیم نشده است." >&2
  exit 1
fi

if [[ ! "$RETENTION_DAYS" =~ ^[0-9]+$ ]]; then
  echo "خطا: --retention-days باید یک عدد صحیح باشد (مقدار دریافتی: ${RETENTION_DAYS})." >&2
  exit 1
fi

if ! command -v pg_dump >/dev/null 2>&1; then
  echo "خطا: pg_dump یافت نشد. ابزارهای خط‌فرمان PostgreSQL را نصب کنید." >&2
  exit 1
fi
if ! command -v gzip >/dev/null 2>&1; then
  echo "خطا: gzip یافت نشد." >&2
  exit 1
fi

# Never echo the raw connection string (it may embed the DB password) —
# only this redacted form is used in log output.
REDACTED_URL="$(printf '%s' "$DATABASE_URL" | sed -E 's#(//[^:/@]+):[^@]*@#\1:***@#')"

# Prisma's DATABASE_URL commonly carries a `?schema=...` query parameter that
# libpq's own URI parser does not recognize as a connection option (pg_dump
# would fail with "invalid URI query parameter"). Pull it out as an explicit
# --schema flag instead, and strip the query string from the URL we hand to
# pg_dump.
PG_SCHEMA="$(printf '%s' "$DATABASE_URL" | grep -oE '[?&]schema=[^&]*' | head -n1 | sed -E 's/^[?&]schema=//')"
PG_SCHEMA="${PG_SCHEMA:-public}"
CONN_URL="${DATABASE_URL%%\?*}"

mkdir -p "$BACKUP_DIR"

TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
FILENAME="giftipay-${TIMESTAMP}.dump.gz"
OUTPATH="${BACKUP_DIR}/${FILENAME}"

echo "شروع پشتیبان‌گیری از پایگاه‌داده: ${REDACTED_URL}"
echo "فایل خروجی: ${OUTPATH}"

if $DRY_RUN; then
  echo "[dry-run] pg_dump --dbname=<DATABASE_URL> --schema=${PG_SCHEMA} --format=custom --no-owner --no-privileges | gzip > ${OUTPATH}"
else
  set +e
  pg_dump --dbname="$CONN_URL" --schema="$PG_SCHEMA" --format=custom --no-owner --no-privileges | gzip > "$OUTPATH"
  STATUS=$?
  set -e
  if [[ $STATUS -ne 0 ]]; then
    echo "خطا: پشتیبان‌گیری با شکست مواجه شد (کد خروج: ${STATUS})." >&2
    rm -f "$OUTPATH"
    exit 1
  fi
  if [[ ! -s "$OUTPATH" ]]; then
    echo "خطا: فایل پشتیبان خالی است — چیزی نوشته نشد." >&2
    rm -f "$OUTPATH"
    exit 1
  fi
  SIZE="$(du -h "$OUTPATH" | cut -f1)"
  echo "پشتیبان‌گیری با موفقیت انجام شد (حجم: ${SIZE})."
fi

echo "اعمال سیاست نگهداری: حذف نسخه‌های قدیمی‌تر از ${RETENTION_DAYS} روز از ${BACKUP_DIR}"
if $DRY_RUN; then
  find "$BACKUP_DIR" -maxdepth 1 -name 'giftipay-*.dump.gz' -mtime "+${RETENTION_DAYS}" -print 2>/dev/null \
    | while IFS= read -r f; do echo "[dry-run] would delete: $f"; done
else
  find "$BACKUP_DIR" -maxdepth 1 -name 'giftipay-*.dump.gz' -mtime "+${RETENTION_DAYS}" -print -delete
fi

echo "پایان."
