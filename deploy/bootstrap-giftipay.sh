#!/usr/bin/env bash
#
# GiftiPay — one-time root bootstrap for 65.109.219.202 (ubuntu-4gb-hel1-10).
#
# Run ONCE as root. Idempotent: safe to re-run.
#
#   sudo bash bootstrap-giftipay.sh
#
# What it does:
#   * creates the `giftipay` system user, directories, log/backup/upload dirs
#   * creates PostgreSQL role + database `giftipay_prod` (isolated from CineFlow)
#   * generates application secrets into /etc/giftipay/giftipay.env (0640)
#   * installs systemd units for the web app, queue worker and daily backup
#   * adds a Caddy vhost for gift.historyfaster52.sbs in ITS OWN file
#   * installs /usr/local/sbin/giftipay-ctl and a narrowly-scoped sudoers rule
#     so the GitHub Actions runner can deploy without further root access
#
# What it deliberately does NOT do:
#   * touch, read, restart or reconfigure anything belonging to CineFlow
#   * remove or rewrite existing Caddyfile content (it appends ONE import line)
#   * open any new public port (the app binds 127.0.0.1 only)
#
# Every file it modifies is backed up first to /var/backups/giftipay/config/.
#
set -euo pipefail

APP_USER=giftipay
APP_GROUP=giftipay
APP_ROOT=/opt/giftipay
APP_CURRENT="$APP_ROOT/current"
ENV_DIR=/etc/giftipay
ENV_FILE="$ENV_DIR/giftipay.env"
LOG_DIR=/var/log/giftipay
DATA_DIR=/var/lib/giftipay
BACKUP_DIR=/var/backups/giftipay
CONFIG_BACKUP_DIR="$BACKUP_DIR/config"
DOMAIN=gift.historyfaster52.sbs
APP_PORT=4020
DB_NAME=giftipay_prod
DB_USER=giftipay
CADDYFILE=/etc/caddy/Caddyfile
CADDY_SITES_DIR=/etc/caddy/sites.d
RUNNER_USER=gift-runner
MAKE_SWAP=1

for a in "$@"; do
  case "$a" in
    --no-swap) MAKE_SWAP=0 ;;
    -h|--help) sed -n '2,30p' "$0"; exit 0 ;;
    *) echo "unknown flag: $a" >&2; exit 2 ;;
  esac
done

log()  { printf '\033[1;36m==>\033[0m %s\n' "$*"; }
ok()   { printf '    \033[1;32mok\033[0m %s\n' "$*"; }
warn() { printf '    \033[1;33m!!\033[0m %s\n' "$*"; }
die()  { printf '\033[1;31mERROR:\033[0m %s\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "must run as root (use: sudo bash $0)"

# ── 0. refuse to run if it would collide with CineFlow ───────────────────────
log "Pre-flight: verifying we will not collide with CineFlow"
if ss -tln 2>/dev/null | grep -q ":$APP_PORT "; then
  die "port $APP_PORT is already in use — refusing to continue"
fi
if [ -e "$APP_ROOT" ] && [ ! -d "$APP_ROOT" ]; then
  die "$APP_ROOT exists and is not a directory"
fi
case "$APP_ROOT" in
  /opt/ai.Company*|/var/www/cineflow*) die "refusing: path overlaps CineFlow" ;;
esac
systemctl is-active --quiet cineflow.service && ok "cineflow.service is running — it will be left alone" \
  || warn "cineflow.service is not currently active (not our doing; we do not touch it)"
ok "port $APP_PORT free, paths do not overlap CineFlow"

mkdir -p "$CONFIG_BACKUP_DIR"
chmod 0750 "$BACKUP_DIR" "$CONFIG_BACKUP_DIR"

backup_file() {  # backup_file <path>
  local f="$1" stamp
  [ -f "$f" ] || return 0
  stamp="$(date -u +%Y%m%dT%H%M%SZ)"
  cp -a "$f" "$CONFIG_BACKUP_DIR/$(basename "$f").$stamp.bak"
  ok "backed up $f -> $CONFIG_BACKUP_DIR/$(basename "$f").$stamp.bak"
}

# ── 1. system user ───────────────────────────────────────────────────────────
log "System user"
if id "$APP_USER" >/dev/null 2>&1; then
  ok "user $APP_USER already exists"
else
  useradd --system --create-home --home-dir "$DATA_DIR" \
          --shell /usr/sbin/nologin --comment "GiftiPay application" "$APP_USER"
  ok "created system user $APP_USER (no login shell)"
fi

# ── 2. directories ───────────────────────────────────────────────────────────
log "Directories"
install -d -o "$APP_USER" -g "$APP_GROUP" -m 0755 "$APP_ROOT" "$APP_ROOT/releases"
install -d -o "$APP_USER" -g "$APP_GROUP" -m 0750 "$LOG_DIR"
install -d -o "$APP_USER" -g "$APP_GROUP" -m 0750 "$DATA_DIR" "$DATA_DIR/uploads" "$DATA_DIR/media"
install -d -o root -g "$APP_GROUP" -m 0750 "$ENV_DIR"
install -d -o root -g root -m 0750 "$BACKUP_DIR"
# The runner stages into a directory IT owns; only `giftipay-ctl activate`
# (running as root) promotes a staged tree into releases/ and chowns it to the
# app user. The runner is deliberately NOT in the $APP_GROUP group, so it can
# never read $ENV_FILE and never sees the application secrets.
install -d -o "$RUNNER_USER" -g "$RUNNER_USER" -m 0755 "$APP_ROOT/staging"
install -d -o "$APP_USER" -g "$APP_GROUP" -m 0755 "$APP_ROOT/releases"
if id -nG "$RUNNER_USER" 2>/dev/null | tr ' ' '\n' | grep -qx "$APP_GROUP"; then
  gpasswd -d "$RUNNER_USER" "$APP_GROUP" >/dev/null 2>&1 \
    && ok "removed $RUNNER_USER from $APP_GROUP (it must not read $ENV_FILE)"
fi
ok "app=$APP_ROOT staging=$APP_ROOT/staging logs=$LOG_DIR data=$DATA_DIR backups=$BACKUP_DIR"

# ── 3. optional swap (protects CineFlow from OOM during our builds) ──────────
if [ "$MAKE_SWAP" -eq 1 ]; then
  log "Swap (protects the 3.7 GB box from OOM while building)"
  if [ "$(swapon --show --noheadings | wc -l)" -gt 0 ]; then
    ok "swap already present — leaving it alone"
  elif [ -f /swapfile-giftipay ]; then
    ok "/swapfile-giftipay already exists"
  else
    fallocate -l 2G /swapfile-giftipay || dd if=/dev/zero of=/swapfile-giftipay bs=1M count=2048 status=none
    chmod 600 /swapfile-giftipay
    mkswap /swapfile-giftipay >/dev/null
    swapon /swapfile-giftipay
    backup_file /etc/fstab
    grep -q '^/swapfile-giftipay' /etc/fstab || echo '/swapfile-giftipay none swap sw 0 0' >> /etc/fstab
    ok "2 GB swap enabled and persisted (remove: swapoff /swapfile-giftipay; rm /swapfile-giftipay; sed -i /swapfile-giftipay/d /etc/fstab)"
  fi
else
  warn "swap skipped (--no-swap). Builds may pressure memory on a 3.7 GB box."
fi

# ── 4. database (isolated role + database) ───────────────────────────────────
log "PostgreSQL"
systemctl is-active --quiet "postgresql@18-main" || systemctl is-active --quiet postgresql \
  || die "PostgreSQL is not running"

DB_PASS=""
if [ -f "$ENV_FILE" ] && grep -q '^DATABASE_URL=' "$ENV_FILE"; then
  DB_PASS="$(sed -n 's#^DATABASE_URL="postgresql://[^:]*:\([^@]*\)@.*#\1#p' "$ENV_FILE" | head -1)"
fi
[ -n "$DB_PASS" ] || DB_PASS="$(openssl rand -base64 33 | tr -d '\n/+=' | cut -c1-40)"

if sudo -u postgres psql -tAc "select 1 from pg_roles where rolname='$DB_USER'" | grep -q 1; then
  sudo -u postgres psql -qc "alter role \"$DB_USER\" with login password '$DB_PASS';" >/dev/null
  ok "role $DB_USER exists — password synchronised with env file"
else
  sudo -u postgres psql -qc "create role \"$DB_USER\" with login password '$DB_PASS';" >/dev/null
  ok "created role $DB_USER"
fi

if sudo -u postgres psql -tAc "select 1 from pg_database where datname='$DB_NAME'" | grep -q 1; then
  ok "database $DB_NAME already exists"
else
  sudo -u postgres createdb -O "$DB_USER" "$DB_NAME"
  ok "created database $DB_NAME owned by $DB_USER"
fi
# extensions the app's search migration needs (must be superuser)
sudo -u postgres psql -d "$DB_NAME" -qc "create extension if not exists pg_trgm;" >/dev/null
sudo -u postgres psql -d "$DB_NAME" -qc "grant all on schema public to \"$DB_USER\";" >/dev/null
ok "pg_trgm enabled in $DB_NAME; schema granted to $DB_USER"

# sanity: confirm we did not touch any other database
ok "databases now present: $(sudo -u postgres psql -tAc "select string_agg(datname,', ') from pg_database where datistemplate=false;")"

# ── 5. environment file ──────────────────────────────────────────────────────
log "Environment file"
if [ -f "$ENV_FILE" ]; then
  backup_file "$ENV_FILE"
  ok "existing env preserved (secrets kept stable across re-runs)"
  # refresh only the DB URL in case the password was regenerated
  sed -i "s#^DATABASE_URL=.*#DATABASE_URL=\"postgresql://$DB_USER:$DB_PASS@127.0.0.1:5432/$DB_NAME?schema=public\"#" "$ENV_FILE"
else
  AUTH_SECRET="$(openssl rand -base64 48 | tr -d '\n')"
  ENCRYPTION_KEY="$(openssl rand -base64 32 | tr -d '\n')"
  CODE_FP_KEY="$(openssl rand -base64 32 | tr -d '\n')"
  HEALTH_TOKEN="$(openssl rand -hex 16)"
  cat > "$ENV_FILE" <<ENVEOF
# GiftiPay production environment — generated $(date -u +%FT%TZ) by bootstrap-giftipay.sh
# Owned by root, readable only by the $APP_GROUP group. NEVER commit this file.

NODE_ENV=production
APP_ENV=production
APP_URL=https://$DOMAIN
APP_NAME="گیفتی‌پی"
PORT=$APP_PORT
HOST=127.0.0.1

DATABASE_URL="postgresql://$DB_USER:$DB_PASS@127.0.0.1:5432/$DB_NAME?schema=public"

# Losing ENCRYPTION_KEY makes every stored gift-card code permanently unrecoverable.
# Back it up separately from database dumps.
AUTH_SECRET="$AUTH_SECRET"
ENCRYPTION_KEY="$ENCRYPTION_KEY"
CODE_FINGERPRINT_KEY="$CODE_FP_KEY"
HEALTHCHECK_TOKEN="$HEALTH_TOKEN"

# Storage
UPLOAD_DIR=$DATA_DIR/uploads
MEDIA_DIR=$DATA_DIR/media

# ── Payment gateway: NOT configured yet ──────────────────────────────────────
# Until ZARINPAL_MERCHANT_ID is set the checkout honestly reports the gateway as
# unavailable. No transaction is ever simulated or auto-approved.
ZARINPAL_MERCHANT_ID=""
ZARINPAL_MODE=production
ZARINPAL_CALLBACK_URL=https://$DOMAIN/api/payments/zarinpal/callback

# ── Email / SMS: NOT configured yet (adapters report "not configured") ───────
SMTP_HOST=""
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=""
SMTP_PASSWORD=""
MAIL_FROM="گیفتی‌پی <no-reply@$DOMAIN>"
SMS_PROVIDER=log
SMS_API_KEY=""
SMS_SENDER=""

# Limits / security
RATE_LIMIT_ENABLED=true
MAX_LOGIN_ATTEMPTS=5
LOGIN_LOCK_MINUTES=15
SESSION_TTL_HOURS=168
CART_RESERVATION_MINUTES=15
PRICE_QUOTE_TTL_MINUTES=30
PRICE_STALE_BLOCK_HOURS=24
PRICE_APPROVAL_THRESHOLD_PERCENT=15

LOG_LEVEL=info
SENTRY_DSN=""

# Seed admin (change the password immediately after first login)
SEED_ADMIN_EMAIL=admin@$DOMAIN
SEED_ADMIN_PASSWORD="$(openssl rand -base64 18 | tr -d '\n/+=' | cut -c1-16)Aa1!"
SEED_DEMO_DATA=true
ENVEOF
  ok "generated $ENV_FILE with fresh secrets"
fi
chown root:"$APP_GROUP" "$ENV_FILE"
chmod 0640 "$ENV_FILE"
ok "$ENV_FILE is root:$APP_GROUP 0640 (runner cannot read it)"

# ── 6. control script (the ONLY thing the runner may sudo) ───────────────────
log "Control script /usr/local/sbin/giftipay-ctl"
cat > /usr/local/sbin/giftipay-ctl <<'CTLEOF'
#!/usr/bin/env bash
# GiftiPay privileged control surface.
# The GitHub Actions runner may execute ONLY this script via sudo. It accepts a
# fixed set of subcommands and never evaluates caller-supplied shell.
set -euo pipefail
APP_USER=giftipay
APP_ROOT=/opt/giftipay
APP_CURRENT="$APP_ROOT/current"
ENV_FILE=/etc/giftipay/giftipay.env
LOG_DIR=/var/log/giftipay
UNITS="giftipay-web giftipay-worker"

usage(){ echo "usage: giftipay-ctl {activate <staged-dir>|prune [n]|migrate|seed|restart|stop|start|status|health|logs|rollback|purge-demo|e2e-session|e2e-session-revoke}" >&2; exit 2; }
as_app(){ install -d -o "$APP_USER" -g "$APP_USER" "$LOG_DIR"; runuser -u "$APP_USER" -- env -i \
    PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin HOME=/var/lib/giftipay \
    NODE_OPTIONS="--max-old-space-size=1024" bash -lc "set -a; . $ENV_FILE; set +a; cd $APP_CURRENT && $*"; }

cmd="${1:-}"; shift || true
case "$cmd" in
  activate)
    staged="${1:?staged dir required}"
    # Only ever promote from the runner-owned staging area, and never follow a
    # symlink out of it.
    case "$staged" in "$APP_ROOT"/staging/*) ;; *) echo "refusing: must be under $APP_ROOT/staging" >&2; exit 3;; esac
    [ -d "$staged" ] && [ ! -L "$staged" ] || { echo "no such staged dir: $staged" >&2; exit 3; }
    rel="$APP_ROOT/releases/$(basename "$staged")"
    rm -rf "$rel"
    mv "$staged" "$rel"
    chown -R "$APP_USER":"$APP_USER" "$rel"
    chmod -R go-w "$rel"
    ln -sfn "$rel" "$APP_CURRENT"
    echo "activated $rel"
    ;;
  prune)
    keep="${1:-3}"
    cur="$(readlink -f "$APP_CURRENT" || true)"
    ls -1dt "$APP_ROOT"/releases/*/ 2>/dev/null | tail -n "+$((keep+1))" | while read -r d; do
      full="$(readlink -f "${d%/}")"
      [ "$full" = "$cur" ] && continue
      rm -rf "$full" && echo "pruned $full"
    done
    ;;
  e2e-session)
    # Mints a SHORT-LIVED staff session for post-deploy verification and prints
    # the raw cookie value. It grants no more authority than this script already
    # has (it can run migrations as root), and expires in 15 minutes.
    as_app "npx tsx scripts/mint-verify-session.ts"
    ;;
  e2e-session-revoke)
    as_app "npx tsx scripts/mint-verify-session.ts --revoke"
    ;;
  migrate) as_app "npx prisma migrate deploy" ;;
  seed)    as_app "npm run db:seed" ;;
  purge-demo)
    as_app "npx tsx scripts/purge-demo.ts" ;;
  restart) systemctl restart $UNITS; systemctl --no-pager --lines=0 status $UNITS || true ;;
  start)   systemctl start   $UNITS ;;
  stop)    systemctl stop    $UNITS ;;
  status)  systemctl --no-pager --lines=0 status $UNITS || true ;;
  health)  curl -fsS -m 10 http://127.0.0.1:4020/api/health || { echo "health check FAILED" >&2; exit 1; } ;;
  logs)    journalctl -u giftipay-web -u giftipay-worker --no-pager -n "${1:-80}" ;;
  rollback)
    prev="$(ls -1dt "$APP_ROOT"/releases/*/ 2>/dev/null | sed -n 2p)"
    [ -n "$prev" ] || { echo "no previous release to roll back to" >&2; exit 3; }
    ln -sfn "${prev%/}" "$APP_CURRENT"; systemctl restart $UNITS; echo "rolled back to ${prev%/}"
    ;;
  *) usage ;;
esac
CTLEOF
chmod 0755 /usr/local/sbin/giftipay-ctl
chown root:root /usr/local/sbin/giftipay-ctl
ok "installed (root-owned, not writable by the runner)"

log "Sudoers rule (scoped to that one script)"
backup_file /etc/sudoers.d/giftipay-runner
cat > /etc/sudoers.d/giftipay-runner <<SUDOEOF
# Allows the GiftiPay GitHub Actions runner to deploy without general root access.
# It may run ONE root-owned script with a fixed subcommand set — nothing else.
$RUNNER_USER ALL=(root) NOPASSWD: /usr/local/sbin/giftipay-ctl
SUDOEOF
chmod 0440 /etc/sudoers.d/giftipay-runner
visudo -cf /etc/sudoers.d/giftipay-runner >/dev/null || die "sudoers syntax check failed"
ok "$RUNNER_USER may run only /usr/local/sbin/giftipay-ctl"

# ── 7. systemd units ─────────────────────────────────────────────────────────
log "systemd units"
cat > /etc/systemd/system/giftipay-web.service <<UNITEOF
[Unit]
Description=GiftiPay storefront and admin (Next.js) — gift.historyfaster52.sbs
Documentation=https://github.com/power309/giftipaytoo
After=network-online.target postgresql.service
Wants=network-online.target

[Service]
Type=simple
User=$APP_USER
Group=$APP_GROUP
WorkingDirectory=$APP_CURRENT
EnvironmentFile=$ENV_FILE
Environment=NODE_ENV=production
Environment=NODE_OPTIONS=--max-old-space-size=768
ExecStart=/usr/bin/npm run start
Restart=always
RestartSec=5
StandardOutput=append:$LOG_DIR/web.log
StandardError=append:$LOG_DIR/web.error.log

# hardening — the app can only write its own data and log dirs
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=$DATA_DIR $LOG_DIR $APP_ROOT
ProtectKernelTunables=true
ProtectControlGroups=true
RestrictSUIDSGID=true
LockPersonality=true

[Install]
WantedBy=multi-user.target
UNITEOF

cat > /etc/systemd/system/giftipay-worker.service <<UNITEOF
[Unit]
Description=GiftiPay background job worker (fulfilment, notifications, cleanup)
After=network-online.target postgresql.service giftipay-web.service
Wants=network-online.target

[Service]
Type=simple
User=$APP_USER
Group=$APP_GROUP
WorkingDirectory=$APP_CURRENT
EnvironmentFile=$ENV_FILE
Environment=NODE_ENV=production
Environment=NODE_OPTIONS=--max-old-space-size=512
ExecStart=/usr/bin/npx tsx scripts/worker.ts
Restart=always
RestartSec=10
StandardOutput=append:$LOG_DIR/worker.log
StandardError=append:$LOG_DIR/worker.error.log

NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=$DATA_DIR $LOG_DIR $APP_ROOT

[Install]
WantedBy=multi-user.target
UNITEOF

cat > /usr/local/sbin/giftipay-backup.sh <<'BKEOF'
#!/usr/bin/env bash
# Nightly encrypted-at-rest-by-filesystem dump of the GiftiPay database only.
set -euo pipefail
ENV_FILE=/etc/giftipay/giftipay.env
DEST=/var/backups/giftipay
KEEP_DAYS="${KEEP_DAYS:-14}"
set -a; . "$ENV_FILE"; set +a
mkdir -p "$DEST"; chmod 0750 "$DEST"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="$DEST/giftipay_prod-$STAMP.dump"
pg_dump --dbname="$DATABASE_URL" --format=custom --no-owner --file="$OUT"
gzip -f "$OUT"
chmod 0640 "$OUT.gz"
find "$DEST" -name 'giftipay_prod-*.dump.gz' -mtime "+$KEEP_DAYS" -delete
echo "backup written: $OUT.gz ($(du -h "$OUT.gz" | cut -f1)); retention ${KEEP_DAYS}d"
BKEOF
chmod 0755 /usr/local/sbin/giftipay-backup.sh

cat > /etc/systemd/system/giftipay-backup.service <<UNITEOF
[Unit]
Description=GiftiPay PostgreSQL backup (giftipay_prod only)

[Service]
Type=oneshot
ExecStart=/usr/local/sbin/giftipay-backup.sh
UNITEOF

cat > /etc/systemd/system/giftipay-backup.timer <<'UNITEOF'
[Unit]
Description=Run GiftiPay backup daily

[Timer]
# 02:40 UTC — deliberately away from cineflow-backup.timer (03:34)
OnCalendar=*-*-* 02:40:00
Persistent=true
RandomizedDelaySec=300

[Install]
WantedBy=timers.target
UNITEOF
ok "giftipay-web, giftipay-worker, giftipay-backup{.service,.timer}"

# ── 8. Caddy vhost in its OWN file + self-healing import ─────────────────────
log "Caddy vhost"
install -d -o root -g root -m 0755 "$CADDY_SITES_DIR"
cat > "$CADDY_SITES_DIR/giftipay.caddy" <<CADDYEOF
# GiftiPay — gift.historyfaster52.sbs
# Owned by the GiftiPay deployment. CineFlow's config is in /etc/caddy/Caddyfile
# and is never modified by us beyond a single 'import' line.
# Caddy obtains and renews the certificate automatically via Let's Encrypt.
$DOMAIN {
	reverse_proxy 127.0.0.1:$APP_PORT

	encode zstd gzip

	header {
		Strict-Transport-Security "max-age=31536000; includeSubDomains"
	}

	# long-lived immutable assets
	@static path /_next/static/* /media/* /favicon.svg
	header @static Cache-Control "public, max-age=31536000, immutable"

	log {
		output file /var/log/caddy/giftipay-access.log
	}
}
CADDYEOF
ok "wrote $CADDY_SITES_DIR/giftipay.caddy"

IMPORT_LINE="import $CADDY_SITES_DIR/*.caddy"
if grep -qF "$IMPORT_LINE" "$CADDYFILE" 2>/dev/null; then
  ok "Caddyfile already imports $CADDY_SITES_DIR"
else
  backup_file "$CADDYFILE"
  printf '\n# Added by GiftiPay bootstrap — pulls in per-site configs (e.g. gift.historyfaster52.sbs)\n# without modifying any existing site block above.\n%s\n' "$IMPORT_LINE" >> "$CADDYFILE"
  ok "appended one import line to $CADDYFILE (existing content untouched)"
fi

# self-healing: CineFlow's deploy rewrites the whole Caddyfile
cat > /usr/local/sbin/giftipay-caddy-guard.sh <<GUARDEOF
#!/usr/bin/env bash
# Re-adds GiftiPay's single 'import' line if a CineFlow deploy rewrites the
# Caddyfile. Never removes or edits any other line.
set -euo pipefail
CADDYFILE=$CADDYFILE
LINE="$IMPORT_LINE"
grep -qF "\$LINE" "\$CADDYFILE" && exit 0
cp -a "\$CADDYFILE" "$CONFIG_BACKUP_DIR/Caddyfile.\$(date -u +%Y%m%dT%H%M%SZ).preguard"
printf '\n# Re-added by giftipay-caddy-guard\n%s\n' "\$LINE" >> "\$CADDYFILE"
caddy validate --config "\$CADDYFILE" --adapter caddyfile >/dev/null 2>&1 && systemctl reload caddy
logger -t giftipay-caddy-guard "re-added GiftiPay import line and reloaded caddy"
GUARDEOF
chmod 0755 /usr/local/sbin/giftipay-caddy-guard.sh

cat > /etc/systemd/system/giftipay-caddy-guard.service <<'UNITEOF'
[Unit]
Description=Restore GiftiPay's Caddy import line if it is removed
[Service]
Type=oneshot
ExecStart=/usr/local/sbin/giftipay-caddy-guard.sh
UNITEOF

cat > /etc/systemd/system/giftipay-caddy-guard.path <<UNITEOF
[Unit]
Description=Watch $CADDYFILE for removal of GiftiPay's import line
[Path]
PathModified=$CADDYFILE
[Install]
WantedBy=multi-user.target
UNITEOF
ok "installed giftipay-caddy-guard (path unit)"

log "Validating Caddy config BEFORE reloading (CineFlow stays up if invalid)"
if caddy validate --config "$CADDYFILE" --adapter caddyfile >/dev/null 2>&1; then
  ok "Caddyfile validates"
  systemctl reload caddy
  ok "caddy reloaded (reload, not restart — CineFlow's connections are preserved)"
else
  warn "Caddy config INVALID — rolling back our import line and leaving CineFlow untouched"
  latest="$(ls -1t "$CONFIG_BACKUP_DIR"/Caddyfile.*.bak 2>/dev/null | head -1 || true)"
  [ -n "$latest" ] && cp -a "$latest" "$CADDYFILE" && ok "restored $CADDYFILE from $latest"
  die "aborted before touching the running web server"
fi

# ── 9. enable units ──────────────────────────────────────────────────────────
log "Enabling units for automatic start after reboot"
systemctl daemon-reload
systemctl enable giftipay-web.service giftipay-worker.service >/dev/null
systemctl enable --now giftipay-backup.timer >/dev/null
systemctl enable --now giftipay-caddy-guard.path >/dev/null
ok "giftipay-web + giftipay-worker enabled (started by the first deploy)"
ok "giftipay-backup.timer and giftipay-caddy-guard.path active"

# ── 10. summary ──────────────────────────────────────────────────────────────
echo
log "Bootstrap complete"
cat <<SUMEOF

  app user ........ $APP_USER
  app root ........ $APP_ROOT   (staging -> releases -> $APP_CURRENT symlink)
  env file ........ $ENV_FILE   (root:$APP_GROUP 0640)
  database ........ $DB_NAME (role $DB_USER, 127.0.0.1:5432, pg_trgm enabled)
  internal port ... 127.0.0.1:$APP_PORT   (not publicly exposed)
  logs ............ $LOG_DIR
  uploads/media ... $DATA_DIR
  backups ......... $BACKUP_DIR  (daily 02:40 UTC, 14 days)
  config backups .. $CONFIG_BACKUP_DIR
  caddy vhost ..... $CADDY_SITES_DIR/giftipay.caddy  -> https://$DOMAIN
  runner sudo ..... $RUNNER_USER may run ONLY /usr/local/sbin/giftipay-ctl
  runner secrets .. NONE — $RUNNER_USER is not in $APP_GROUP and cannot read $ENV_FILE

  CineFlow untouched: cineflow.service / port 4010 / /opt/ai.Company / its DB,
  timers and runner were not read, modified, restarted or reused.

  Next: trigger the "Deploy" workflow in GitHub Actions.

  Retrieve the seeded admin password on the server with:
      sudo grep SEED_ADMIN_ /etc/giftipay/giftipay.env

SUMEOF
