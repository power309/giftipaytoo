# Server inspection findings (read-only, 2026-09-05)

Host `ubuntu-4gb-hel1-10` / `65.109.219.202` — Ubuntu 26.04 LTS, 2 vCPU, 3.7 GB RAM,
**0 swap**, 19 GB disk free. DNS for `gift.historyfaster52.sbs` already points here
and matches the server's own public IP.

## What is already on the box (CineFlow — must not be touched)

| Resource | Value |
|---|---|
| App service | `cineflow.service` — Node/Express, **runs as root** |
| App path | `/opt/ai.Company/businesses/cineflow/server` (repo `power309/ai.Company`) |
| Internal port | **127.0.0.1:4010** |
| Domain | `movie.historyfaster52.sbs` |
| Timers | `cineflow-backup.timer` (daily), `cineflow-log-retention.timer` (hourly) |
| Maintenance page | `/var/www/cineflow-maint` |
| Runner | `cineflow-prod-hetzner` at `/opt/actions-runner`, user `github-runner` |

## Shared infrastructure

| Component | Detail |
|---|---|
| Web server | **Caddy** (not nginx/apache). Ports 80 + 443. Admin API on 127.0.0.1:2019 |
| TLS | Caddy's automatic ACME — **no certbot installed and none needed** |
| PostgreSQL | 18.6, cluster `18`, listening **127.0.0.1:5432 only** |
| Redis | 8.0.5 on 127.0.0.1:6379 — GiftiPay will **not** use it (queue is in Postgres) |
| Node | v22.23.2, npm 10.9.8 |
| Docker | not installed |

## Our runner

`ubuntu-4gb-hel1-10` (agent 21), bound to `github.com/power309/giftipaytoo`,
home `/home/gift-runner/actions-runner`, runs as user **`gift-runner`** —
entirely separate from CineFlow's runner and user.

## Two constraints that shape the design

### 1. `gift-runner` has NO sudo
Verified: `sudo -n` fails, and it cannot authenticate to PostgreSQL. It therefore
cannot create a system user, a database, systemd units, or edit Caddy config.

→ A **one-time root bootstrap** is required. It installs everything and grants
`gift-runner` a single narrowly-scoped sudo entry (`/usr/local/sbin/giftipay-ctl`)
so every later deploy is fully automated with no further root access.

### 2. CineFlow's deploy script overwrites `/etc/caddy/Caddyfile` wholesale
The file's own header states: *"cineflow-deploy.sh installs this file as
/etc/caddy/Caddyfile"*. There is no `conf.d`/`sites` directory. A gift-card vhost
written into that file would be silently deleted on CineFlow's next deploy.

→ GiftiPay's vhost lives in its **own file**, `/etc/caddy/sites.d/giftipay.caddy`,
pulled in by a single `import` line appended to the Caddyfile. A
`giftipay-caddy-guard.path` unit watches the Caddyfile and re-appends that one line
(then reloads Caddy) if a CineFlow deploy removes it. CineFlow's own content is never
modified or removed.

The permanent fix is one line in CineFlow's Caddyfile template — see
`deploy/README.md`. That is the user's change to make, in their repo.

## Chosen isolation boundaries

| Resource | CineFlow | GiftiPay |
|---|---|---|
| Internal port | 4010 | **4020** (verified free) |
| Unix user | root | **`giftipay`** (new, no login shell) |
| App directory | `/opt/ai.Company` | **`/opt/giftipay`** |
| Env file | (its own) | **`/etc/giftipay/giftipay.env`** (0640 root:giftipay) |
| Database | (its own) | **`giftipay_prod`**, owner role `giftipay` |
| Logs | (its own) | **`/var/log/giftipay/`** |
| Uploads/media | (its own) | **`/var/lib/giftipay/`** |
| Backups | (its own) | **`/var/backups/giftipay/`** |
| Services | `cineflow*` | **`giftipay-*`** |
| Runner | `cineflow-prod-hetzner` | **`ubuntu-4gb-hel1-10`** |

Nothing in the right-hand column overlaps the left. No CineFlow service, file,
port, database, timer or credential is read, written, restarted or reused.

---

## Postmortem: why the first bootstrap stopped at `systemctl reload caddy`

**Date:** 2026-09-05 09:25 UTC. **Impact on CineFlow:** none — see below.

`caddy validate` does not merely parse a config; it *provisions* it. Provisioning
a `log { output file … }` directive opens the file. The bootstrap ran validate as
root, so Caddy created `/var/log/caddy/giftipay-access.log` owned **root:root,
mode 0600**.

`systemctl reload caddy` then ran `caddy reload` as the unprivileged **`caddy`**
user, per caddy.service's `ExecReload`. That process could not open a root-owned
0600 file, so the reload exited 1. The bootstrap runs under `set -euo pipefail`,
so it stopped on that line — before step 9, which enables the giftipay units.

Evidence from the read-only diagnostic (run 33958182712):

```
ExecReload={ … /usr/bin/caddy reload … ; code=exited ; status=1 }
caddy: ActiveState=active  Result=success  NRestarts=0  MainPID=258716
/var/log/caddy/cineflow-access.log   -rw------- caddy caddy   (16 MB, still growing)
/var/log/caddy/giftipay-access.log   -rw------- root  root    (0 bytes, created 09:25)
live config hosts: ["movie.historyfaster52.sbs"]     # ours never loaded
```

The same mechanism, seen from the other side: running `caddy validate` as
`gift-runner` fails with `open /var/log/caddy/cineflow-access.log: permission
denied` — validate really does open every log file in the config.

**CineFlow was never at risk.** The reload failed *before* Caddy adopted any new
config, so it kept serving the old one: same MainPID, zero restarts,
`Result=success`, and `https://movie.historyfaster52.sbs` answering 200
throughout. The failure mode was fail-closed, which is what the ordering was
designed for.

**Fix.** `deploy/repair-caddy-reload.sh` chowns the log file to `caddy:caddy`,
reloads, verifies both hosts are in the live config, and performs the step-9
unit enabling that never ran. `bootstrap-giftipay.sh` now creates that file as
caddy's *before* validating and re-asserts ownership *after* — as does the
caddy-guard helper, which validates and reloads the same way.

**Residual risk accepted.** The guard and the bootstrap both chown a file under
`/var/log/caddy`, a directory CineFlow also logs into. Only the single path
`giftipay-access.log` is ever named; CineFlow's log is read for comparison and
never modified.

---

## Deployment record — 2026-09-05

Live at **https://gift.historyfaster52.sbs**, deployed from
`1ababd5` by workflow run 33962604144, verified green by run 33963786918
(all 13 checks) on runner `ubuntu-4gb-hel1-10`.

### Two application defects the deployment surfaced

1. **The web unit would have bound the wrong port on a public interface.**
   `giftipay-web.service` runs `npm run start`, and that script was
   `next start -p 3000`. An explicit `-p` overrides `PORT`, so the service
   would have listened on 3000 while Caddy proxies 4020 — and `next start`
   with no `-H` binds `0.0.0.0`, putting an internal port on the public
   interface. The script now honours `HOST` and `PORT`, and the deploy asserts
   after every release that 4020 is bound on 127.0.0.1 and nowhere else.

2. **Admin image uploads would have been deleted by the next deploy.**
   The upload route writes to `public/media/uploads/YYYY/MM`, which lives
   inside the release directory. Staging now symlinks that path to
   `/var/lib/giftipay/uploads`, which survives releases and is already in the
   unit's `ReadWritePaths`.

### Verification defects worth remembering

Three verification steps failed while the site was healthy, all from the same
class of shell bug under `set -euo pipefail`:

- `read -r a b c < <(curl -w …)` — curl's `-w` output has no trailing
  newline, so `read` returns EOF (1) and kills the step *before* it prints
  anything. Use a here-string.
- `printf '%s' "$page" | grep …` on a 400 KB document exceeds `ARG_MAX`.
  Write the body to a file.
- A `grep` with no match, or a `head -N` that SIGPIPEs its producer, aborts
  the whole step silently. Guard with `|| true` and check the value instead.

A step that fails without printing its own diagnostics is almost always one
of these, not the thing it was testing.

### Gateway state in production (asserted, not assumed)

```
zarinpal   mode=production  configured=false  available=false
wallet     mode=production  configured=true   available=true
manual     mode=production  configured=false  available=false
```

The invariant the verification enforces: a gateway reporting
`configured:false` must never be `available:true`, and a `sandbox` gateway
must never be available in production.
