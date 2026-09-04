# Deployment guide

From a bare Ubuntu server to a running, backed-up GiftiPay installation.

> Nothing in this guide is specific to a hosting provider. It assumes a Linux VPS you
> control, which is the common case for an Iranian merchant.

---

## 1. Requirements

| Component | Minimum | Recommended |
|---|---|---|
| CPU / RAM | 2 vCPU / 2 GB | 4 vCPU / 8 GB |
| Disk | 20 GB SSD | 60 GB SSD |
| Node.js | 20.11 | 22 LTS |
| PostgreSQL | 15 | 16 |
| Reverse proxy | nginx or Caddy with TLS | — |

Two processes must run: the **web server** and the **job worker**. The worker performs
fulfilment, notifications and cleanup — without it, paid orders will not deliver codes.

---

## 2. Provision

```bash
sudo apt update && sudo apt install -y postgresql-16 nginx git curl ufw
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt install -y nodejs

sudo ufw allow OpenSSH && sudo ufw allow 'Nginx Full' && sudo ufw enable

sudo -u postgres psql <<'SQL'
CREATE USER giftipay WITH PASSWORD 'CHANGE_ME_STRONG';
CREATE DATABASE giftipay OWNER giftipay;
\c giftipay
CREATE EXTENSION IF NOT EXISTS pg_trgm;
SQL
```

PostgreSQL should listen on localhost only. Confirm `listen_addresses = 'localhost'` in
`postgresql.conf` and that `pg_hba.conf` has no `trust` entries.

---

## 3. Deploy the application

```bash
sudo adduser --system --group --home /srv/giftipay giftipay
sudo -u giftipay git clone <your-repo> /srv/giftipay/app
cd /srv/giftipay/app

sudo -u giftipay cp .env.example .env
```

Fill in `.env`. Generate the secrets **on the server** and never commit them:

```bash
openssl rand -base64 48   # AUTH_SECRET
openssl rand -base64 32   # ENCRYPTION_KEY        ← back this up separately
openssl rand -base64 32   # CODE_FINGERPRINT_KEY
openssl rand -hex 16      # HEALTHCHECK_TOKEN
```

Set `APP_ENV=production`, `NODE_ENV=production`, `APP_URL=https://your-domain`,
`ZARINPAL_MODE=production` and the real `DATABASE_URL`.

> **`ENCRYPTION_KEY` is the single most important secret here.** It decrypts every stored
> gift-card code. If the database is restored on a machine without this exact key, the
> inventory is unrecoverable. Store a copy in a password manager or a sealed envelope,
> not only on the server.

```bash
sudo -u giftipay npm ci --omit=dev --no-audit
sudo -u giftipay npx prisma generate
sudo -u giftipay npm run db:deploy
sudo -u giftipay npm run db:seed        # first install only — seeds roles, permissions, settings
sudo -u giftipay npm run posters:generate
sudo -u giftipay npm run build
```

For a production install where you do **not** want demo content, set
`SEED_DEMO_DATA=false` before seeding. System data (permissions, roles, currencies,
regions, settings, notification templates) is always seeded; only sample customers,
orders, reviews and inventory are gated by that flag.

---

## 4. Run under systemd

`/etc/systemd/system/giftipay-web.service`:

```ini
[Unit]
Description=GiftiPay web
After=network.target postgresql.service

[Service]
Type=simple
User=giftipay
WorkingDirectory=/srv/giftipay/app
EnvironmentFile=/srv/giftipay/app/.env
ExecStart=/usr/bin/npm run start
Restart=always
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ReadWritePaths=/srv/giftipay/app/.next /srv/giftipay/app/public/media /srv/giftipay/app/public/uploads

[Install]
WantedBy=multi-user.target
```

`/etc/systemd/system/giftipay-worker.service`:

```ini
[Unit]
Description=GiftiPay job worker
After=network.target postgresql.service

[Service]
Type=simple
User=giftipay
WorkingDirectory=/srv/giftipay/app
EnvironmentFile=/srv/giftipay/app/.env
ExecStart=/usr/bin/npx tsx scripts/worker.ts
Restart=always
RestartSec=10
NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now giftipay-web giftipay-worker
sudo systemctl status giftipay-web giftipay-worker
```

---

## 5. nginx + TLS

```nginx
server {
  listen 443 ssl http2;
  server_name your-domain;

  ssl_certificate     /etc/letsencrypt/live/your-domain/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/your-domain/privkey.pem;

  client_max_body_size 8m;          # matches the upload limit

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host              $host;
    proxy_set_header X-Real-IP         $remote_addr;
    proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Upgrade           $http_upgrade;
    proxy_set_header Connection        "upgrade";
  }

  location /_next/static/ {
    proxy_pass http://127.0.0.1:3000;
    add_header Cache-Control "public, max-age=31536000, immutable";
  }
}

server {
  listen 80;
  server_name your-domain;
  return 301 https://$host$request_uri;
}
```

`X-Forwarded-For` matters: rate limiting, audit logs and risk scoring all read the client
IP through it.

```bash
sudo certbot --nginx -d your-domain -d www.your-domain
```

---

## 6. Payment gateway

1. Obtain a merchant ID from ZarinPal for your verified business.
2. Register the callback URL `https://your-domain/api/payments/zarinpal/callback`
   in the ZarinPal dashboard.
3. Set `ZARINPAL_MERCHANT_ID` and `ZARINPAL_MODE=production` in `.env`, restart the web
   service, and enable the gateway in **پنل مدیریت → تنظیمات → پرداخت**.
4. Place one real low-value order end to end before announcing the site. Verify in
   **پنل مدیریت → سفارش‌ها** that the payment shows a `refId` and the order fulfilled.

Full details, including the Rial/Toman conversion and the idempotency design, are in
[`PAYMENTS.md`](PAYMENTS.md).

---

## 7. Backups

```bash
# /etc/cron.d/giftipay-backup
0 2 * * * giftipay cd /srv/giftipay/app && BACKUP_RETENTION_DAYS=14 ./scripts/backup.sh >> /var/log/giftipay-backup.log 2>&1
```

Copy dumps off the server — a backup on the same disk is not a backup. Restore procedure
and the drill you should run quarterly are in [`OPERATIONS.md`](OPERATIONS.md).

**Back up `ENCRYPTION_KEY` separately from the database dumps.** Keeping them together
means one stolen archive yields plaintext gift-card codes.

---

## 8. Monitoring

| Endpoint | Purpose |
|---|---|
| `GET /api/health` | Liveness — no auth, safe for a public uptime monitor |
| `GET /api/health/ready` | Readiness — checks the database and queue depth; requires `Authorization: Bearer $HEALTHCHECK_TOKEN` |

Point an uptime monitor at `/api/health` and alert on the readiness endpoint from inside
your network. Set `SENTRY_DSN` to forward exceptions.

Watch these in the admin dashboard: dead jobs, orders in **بررسی دستی**, failed
deliveries, low stock, and stale exchange rates.

---

## 9. Updating

```bash
cd /srv/giftipay/app
sudo -u giftipay git pull
sudo -u giftipay npm ci --omit=dev
sudo -u giftipay npx prisma generate
sudo -u giftipay npm run db:deploy      # migrations are additive and safe to run live
sudo -u giftipay npm run build
sudo systemctl restart giftipay-web giftipay-worker
```

Take a backup before every deploy that includes a migration.

---

## 10. Pre-launch checklist

- [ ] `APP_ENV=production`, `NODE_ENV=production`
- [ ] All three secrets generated on the server, backed up off-server
- [ ] `ENCRYPTION_KEY` stored separately from database backups
- [ ] TLS certificate valid, HTTP redirects to HTTPS
- [ ] `SEED_DEMO_DATA=false`, or demo rows removed via the admin panel
- [ ] Real exchange rates entered in **نرخ ارز**
- [ ] Real inventory codes imported; demo codes removed
- [ ] Payment gateway tested with a real transaction
- [ ] SMTP and SMS credentials configured and test-sent from **تنظیمات**
- [ ] Admin password changed from the seeded one; 2FA enabled on every staff account
- [ ] Backup cron running and a restore drill completed
- [ ] Uptime monitoring live
- [ ] `npm run verify` and `npm run test:e2e` green against the built app
- [ ] Legal pages reviewed by someone qualified for your jurisdiction

Security hardening is covered separately and thoroughly in [`SECURITY.md`](SECURITY.md).
