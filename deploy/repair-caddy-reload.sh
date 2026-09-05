#!/usr/bin/env bash
#
# GiftiPay — resume the bootstrap from the step that failed.
#
# WHY THIS EXISTS
# ---------------
# bootstrap-giftipay.sh validated the Caddy config as root before reloading.
# `caddy validate` does not merely parse: it provisions the config, and
# provisioning a `log { output file … }` directive OPENS the file — creating
# /var/log/caddy/giftipay-access.log as root:root mode 0600.
#
# The reload then runs `caddy reload` as the unprivileged `caddy` user (that is
# what caddy.service's ExecReload does), which cannot open a root-owned 0600
# file. It exited 1, and because the bootstrap runs under `set -e` it stopped
# there — before enabling the giftipay units.
#
# Caddy itself never reloaded, so CineFlow kept serving its old, working config
# throughout. Confirmed on the server: caddy Result=success, NRestarts=0, same
# MainPID, and movie.historyfaster52.sbs answering 200.
#
# WHAT THIS DOES — and nothing else
#   1. gives /var/log/caddy/giftipay-access.log to caddy:caddy (the one fix)
#   2. teaches the caddy-guard helper the same rule, so a later re-add is safe
#   3. validates, reloads Caddy, and checks the gift host actually went live
#   4. enables the four giftipay units the bootstrap never reached
#
# It does not touch CineFlow's service, config, database, files or log, does
# not restart Caddy (reload only), and does not start giftipay-web — that is
# the deploy's job, once a release exists.
#
# Idempotent: safe to run repeatedly. Aborts without reloading if anything is
# not as expected.
set -euo pipefail

CADDYFILE=/etc/caddy/Caddyfile
CADDY_LOG_DIR=/var/log/caddy
GIFT_LOG="$CADDY_LOG_DIR/giftipay-access.log"
CINEFLOW_LOG="$CADDY_LOG_DIR/cineflow-access.log"
GUARD=/usr/local/sbin/giftipay-caddy-guard.sh
CONFIG_BACKUP_DIR=/var/backups/giftipay/config
UNITS_ENABLE="giftipay-web.service giftipay-worker.service"
UNITS_ENABLE_NOW="giftipay-backup.timer giftipay-caddy-guard.path"

log()  { printf '\033[1;36m==>\033[0m %s\n' "$*"; }
ok()   { printf '    \033[1;32mok\033[0m %s\n' "$*"; }
warn() { printf '    \033[1;33m!!\033[0m %s\n' "$*"; }
die()  { printf '\033[1;31mERROR:\033[0m %s\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "must run as root (use: sudo bash $0)"

# ── 0. pre-flight ────────────────────────────────────────────────────────────
log "Pre-flight"
[ -f "$CADDYFILE" ] || die "$CADDYFILE not found"
[ -f /etc/caddy/sites.d/giftipay.caddy ] || die "the GiftiPay vhost is missing — run bootstrap-giftipay.sh first"
id caddy >/dev/null 2>&1 || die "no 'caddy' user on this host"
command -v caddy >/dev/null || die "caddy binary not on PATH"
systemctl is-active --quiet caddy || die "caddy.service is not running; refusing to act"
install -d -o root -g root -m 0755 "$CONFIG_BACKUP_DIR"

# Record CineFlow's identity so we can prove we did not disturb it.
CINEFLOW_PID_BEFORE="$(systemctl show cineflow -p MainPID --value 2>/dev/null || echo n/a)"
CADDY_PID_BEFORE="$(systemctl show caddy -p MainPID --value)"
ok "cineflow MainPID before: $CINEFLOW_PID_BEFORE"
ok "caddy    MainPID before: $CADDY_PID_BEFORE"

# ── 1. the actual fix ────────────────────────────────────────────────────────
log "Access log ownership"
install -d -o caddy -g caddy -m 0755 "$CADDY_LOG_DIR"
if [ -e "$GIFT_LOG" ]; then
  before="$(stat -c '%U:%G %a' "$GIFT_LOG")"
  chown caddy:caddy "$GIFT_LOG"
  chmod 0600 "$GIFT_LOG"
  ok "$GIFT_LOG: $before -> $(stat -c '%U:%G %a' "$GIFT_LOG")"
else
  install -o caddy -g caddy -m 0600 /dev/null "$GIFT_LOG"
  ok "created $GIFT_LOG as caddy:caddy 0600"
fi

# CineFlow's log is read here only to compare ownership — never modified.
if [ -e "$CINEFLOW_LOG" ]; then
  ok "cineflow-access.log is $(stat -c '%U:%G %a' "$CINEFLOW_LOG") (left exactly as it is)"
fi

# ── 2. keep the guard from re-creating the same trap ─────────────────────────
log "Caddy guard helper"
if [ -f "$GUARD" ]; then
  if grep -q 'giftipay-access.log' "$GUARD"; then
    ok "guard already ensures the log file's ownership"
  else
    cp -a "$GUARD" "$CONFIG_BACKUP_DIR/$(basename "$GUARD").$(date -u +%Y%m%dT%H%M%SZ).bak"
    # Insert the ownership guarantee immediately before the validate/reload line.
    tmp="$(mktemp)"
    awk '
      /^caddy validate/ && !done {
        print "# The log writer is opened during validate (which runs as root) and again"
        print "# during reload (which runs as the caddy user). Make sure the file is the"
        print "# caddy user'"'"'s before either happens, or the reload fails with EACCES."
        print "[ -e /var/log/caddy/giftipay-access.log ] || install -o caddy -g caddy -m 0600 /dev/null /var/log/caddy/giftipay-access.log"
        print "chown caddy:caddy /var/log/caddy/giftipay-access.log"
        done = 1
      }
      { print }
    ' "$GUARD" > "$tmp"
    grep -q 'giftipay-access.log' "$tmp" || { rm -f "$tmp"; die "could not patch $GUARD — left untouched"; }
    install -m 0755 -o root -g root "$tmp" "$GUARD"
    rm -f "$tmp"
    bash -n "$GUARD" || die "$GUARD no longer parses — restore it from $CONFIG_BACKUP_DIR"
    ok "patched $GUARD (backup kept in $CONFIG_BACKUP_DIR)"
  fi
else
  warn "$GUARD not present — skipping (the bootstrap normally installs it)"
fi

# ── 3. validate, then reload ─────────────────────────────────────────────────
log "Validating the combined config"
if ! caddy validate --config "$CADDYFILE" --adapter caddyfile >/tmp/giftipay-validate.log 2>&1; then
  tail -20 /tmp/giftipay-validate.log >&2
  die "config does not validate — NOT reloading; CineFlow keeps its current config"
fi
ok "validates"

# Validate ran as root and may have (re)created the log file; put it back.
chown caddy:caddy "$GIFT_LOG"; chmod 0600 "$GIFT_LOG"
ok "re-asserted $GIFT_LOG ownership after validate"

log "Reloading Caddy (reload, not restart — CineFlow's connections survive)"
if ! systemctl reload caddy; then
  warn "reload still failed; Caddy is running its previous config and CineFlow is unaffected"
  systemctl show caddy -p ExecReload --no-pager >&2 || true
  journalctl -u caddy -n 30 --no-pager >&2 || true
  die "reload failed — see the journal lines above"
fi
ok "caddy reloaded"

# ── 4. prove the reload actually took ────────────────────────────────────────
log "Confirming the new config is live"
live="$(curl -s -m 5 http://127.0.0.1:2019/config/apps/http/servers || true)"
case "$live" in
  *gift.historyfaster52.sbs*) ok "gift.historyfaster52.sbs is in the live config" ;;
  *) die "reload reported success but the gift host is not in the live config" ;;
esac
case "$live" in
  *movie.historyfaster52.sbs*) ok "movie.historyfaster52.sbs is still in the live config" ;;
  *) die "CineFlow's host vanished from the live config — investigate immediately" ;;
esac

# ── 5. finish what the bootstrap did not reach ───────────────────────────────
log "Enabling the giftipay units (bootstrap step 9)"
systemctl daemon-reload
# shellcheck disable=SC2086
systemctl enable $UNITS_ENABLE >/dev/null
ok "enabled: $UNITS_ENABLE (started by the first deploy, not here)"
# shellcheck disable=SC2086
systemctl enable --now $UNITS_ENABLE_NOW >/dev/null
ok "enabled and started: $UNITS_ENABLE_NOW"

# ── 6. report ────────────────────────────────────────────────────────────────
echo
log "State after repair"
for u in giftipay-web.service giftipay-worker.service giftipay-backup.timer giftipay-caddy-guard.path; do
  printf '    %-32s enabled=%-9s active=%s\n' "$u" \
    "$(systemctl is-enabled "$u" 2>/dev/null || echo '?')" \
    "$(systemctl is-active  "$u" 2>/dev/null || echo '?')"
done
echo
CINEFLOW_PID_AFTER="$(systemctl show cineflow -p MainPID --value 2>/dev/null || echo n/a)"
CADDY_PID_AFTER="$(systemctl show caddy -p MainPID --value)"
printf '    cineflow MainPID  %s -> %s  %s\n' "$CINEFLOW_PID_BEFORE" "$CINEFLOW_PID_AFTER" \
  "$([ "$CINEFLOW_PID_BEFORE" = "$CINEFLOW_PID_AFTER" ] && echo '(unchanged)' || echo '(CHANGED — investigate)')"
printf '    caddy    MainPID  %s -> %s  %s\n' "$CADDY_PID_BEFORE" "$CADDY_PID_AFTER" \
  "$([ "$CADDY_PID_BEFORE" = "$CADDY_PID_AFTER" ] && echo '(unchanged — reloaded, not restarted)' || echo '(CHANGED — it restarted)')"
echo
printf '    movie.historyfaster52.sbs -> %s\n' "$(curl -s -o /dev/null -w '%{http_code}' -m 10 https://movie.historyfaster52.sbs/ || echo 'no answer')"
printf '    gift.historyfaster52.sbs  -> %s  (502/503 is expected: nothing is deployed yet)\n' \
  "$(curl -sk -o /dev/null -w '%{http_code}' -m 20 https://gift.historyfaster52.sbs/ || echo 'no answer')"
echo
ok "Repair complete. Next step is the deploy workflow — no further root action needed."
