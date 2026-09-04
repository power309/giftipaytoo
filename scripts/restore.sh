#!/usr/bin/env bash
# GiftiPay database restore — pg_restore wrapper.
#
# ⚠️  DESTRUCTIVE: restoring OVERWRITES every object in the target database
# ($DATABASE_URL). There is no undo. This script requires an explicit typed
# confirmation before touching anything, unless run with --yes for scripted
# use (e.g. a tested, unattended restore drill — see docs/OPERATIONS.md).
#
# Usage:
#   scripts/restore.sh --file backups/giftipay-20260101T000000Z.dump.gz
#   scripts/restore.sh --latest [--dry-run] [--yes]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BACKUP_DIR="${BACKUP_DIR:-$PROJECT_ROOT/backups}"

FILE=""
DRY_RUN=false
ASSUME_YES=false

usage() {
  cat <<'EOF'
Usage: scripts/restore.sh --file PATH [options]
       scripts/restore.sh --latest [options]

Options:
  --file PATH   Path to a .dump.gz produced by scripts/backup.sh.
  --latest      Restore the most recent dump in $BACKUP_DIR (default: ./backups).
  --dry-run     Show what would happen; do not touch the database.
  --yes         Skip the interactive confirmation prompt (scripted use only).
  -h, --help    Show this help.

⚠️  Restoring OVERWRITES the target database ($DATABASE_URL). No undo.
Reads the database connection from $DATABASE_URL — required, never printed.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --file) FILE="${2:?--file requires a path}"; shift 2 ;;
    --latest) FILE="__latest__"; shift ;;
    --dry-run) DRY_RUN=true; shift ;;
    --yes) ASSUME_YES=true; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "گزینه ناشناخته: $1" >&2; usage; exit 1 ;;
  esac
done

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "خطا: متغیر محیطی DATABASE_URL تنظیم نشده است." >&2
  exit 1
fi

if [[ -z "$FILE" ]]; then
  echo "خطا: یکی از --file PATH یا --latest را مشخص کنید." >&2
  usage
  exit 1
fi

if [[ "$FILE" == "__latest__" ]]; then
  FILE="$(find "$BACKUP_DIR" -maxdepth 1 -name 'giftipay-*.dump.gz' -type f 2>/dev/null | sort | tail -n1)"
  if [[ -z "$FILE" ]]; then
    echo "خطا: هیچ فایل پشتیبانی در ${BACKUP_DIR} یافت نشد." >&2
    exit 1
  fi
fi

if [[ ! -f "$FILE" ]]; then
  echo "خطا: فایل «${FILE}» یافت نشد." >&2
  exit 1
fi

if ! command -v pg_restore >/dev/null 2>&1; then
  echo "خطا: pg_restore یافت نشد. ابزارهای خط‌فرمان PostgreSQL را نصب کنید." >&2
  exit 1
fi
if ! command -v gunzip >/dev/null 2>&1; then
  echo "خطا: gunzip یافت نشد." >&2
  exit 1
fi

# Never echo the raw connection string (it may embed the DB password) —
# only this redacted form is used in log output.
REDACTED_URL="$(printf '%s' "$DATABASE_URL" | sed -E 's#(//[^:/@]+):[^@]*@#\1:***@#')"

# Strip a Prisma-style `?schema=...` query param — libpq's URI parser
# rejects it as an unknown connection option. The dump already carries its
# own schema (recorded by scripts/backup.sh at dump time via --schema).
CONN_URL="${DATABASE_URL%%\?*}"

echo "=============================================================="
echo "  هشدار جدی: این عملیات پایگاه‌داده مقصد را کامل بازنویسی می‌کند"
echo "  مقصد : ${REDACTED_URL}"
echo "  فایل  : ${FILE}"
echo "  این عملیات غیرقابل بازگشت است."
echo "=============================================================="

if $DRY_RUN; then
  echo "[dry-run] gunzip -c ${FILE} | pg_restore --dbname=<DATABASE_URL> --clean --if-exists --no-owner --no-privileges"
  exit 0
fi

if ! $ASSUME_YES; then
  read -r -p 'برای تأیید بازنویسی پایگاه‌داده مقصد عبارت "RESTORE" را دقیقاً وارد کنید: ' CONFIRM
  if [[ "$CONFIRM" != "RESTORE" ]]; then
    echo "لغو شد — هیچ تغییری اعمال نشد."
    exit 1
  fi
fi

echo "در حال بازگردانی..."
set +e
gunzip -c "$FILE" | pg_restore --dbname="$CONN_URL" --clean --if-exists --no-owner --no-privileges
STATUS=$?
set -e

if [[ $STATUS -ne 0 ]]; then
  echo "خطا: بازگردانی با خطا مواجه شد (کد خروج pg_restore: ${STATUS})." >&2
  echo "توجه: pg_restore ممکن است هشدارهایی درباره اشیای وابسته که با --if-exists از قبل حذف شده‌اند بدهد؛" >&2
  echo "در صورت شک، docs/OPERATIONS.md بخش «رویه بازگردانی» را ببینید." >&2
  exit 1
fi

echo "بازگردانی با موفقیت انجام شد."
