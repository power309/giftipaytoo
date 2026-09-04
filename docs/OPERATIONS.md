# عملیات و زیرساخت (Operations)

این سند نحوهٔ اجرا و نگهداری زیرساخت پس‌زمینهٔ گیفتی‌پی را توضیح می‌دهد: صف کارها،
اطلاع‌رسانی، تنظیمات، سلامت سرویس و پشتیبان‌گیری. مخاطب این سند مهندسان و اپراتورهایی
هستند که سرویس را در محیط واقعی اجرا و مانیتور می‌کنند.

## فهرست
1. [طراحی صف کار و معناشناسی at-least-once](#1-طراحی-صف-کار-و-معناشناسی-at-least-once)
2. [افزودن یک نوع کار جدید](#2-افزودن-یک-نوع-کار-جدید)
3. [اجرای Worker (systemd / pm2)](#3-اجرای-worker-systemd--pm2)
4. [جایگزین Cron](#4-جایگزین-cron)
5. [پشتیبان‌گیری و بازگردانی](#5-پشتیبانگیری-و-بازگردانی)
6. [فرمت لاگ](#6-فرمت-لاگ)
7. [Health Endpoints برای مانیتورینگ uptime](#7-health-endpoints-برای-مانیتورینگ-uptime)
8. [وقتی صف کار انباشته می‌شود](#8-وقتی-صف-کار-انباشته-میشود)
9. [تنظیمات سیستم (Settings)](#9-تنظیمات-سیستم-settings)
10. [اطلاع‌رسانی (Notifications)](#10-اطلاعرسانی-notifications)

---

## 1) طراحی صف کار و معناشناسی at-least-once

صف کار روی جدول `JobQueue` (پریزمای `prisma/schema.prisma`) پیاده شده است:
`src/server/jobs/queue.ts`.

```
QUEUED --(claimNext)--> RUNNING --(complete)--> SUCCEEDED
                          |
                          +--(fail, attempts < maxAttempts)--> QUEUED (با تأخیر نمایی)
                          |
                          +--(fail, attempts >= maxAttempts)--> DEAD
```

- **at-least-once، نه exactly-once**: یک کار ممکن است بیش از یک‌بار اجرا شود — مثلاً
  اگر پردازش یک کار موفق شود ولی قبل از فراخوانی `complete()` پردازه (worker) از بین
  برود، کار در وضعیت `RUNNING` باقی می‌ماند تا `reclaimStuck()` آن را دوباره `QUEUED`
  کند و یک worker دیگر (یا همان worker پس از راه‌اندازی مجدد) آن را دوباره اجرا کند.
  **بنابراین هر handler باید idempotent باشد** — اجرای دوباره‌اش نباید اثر جانبی
  تکراری/نادرست ایجاد کند. برای عملیات‌هایی که به‌طور طبیعی idempotent نیستند (مثل
  اعلان یا پرداخت)، از `idempotencyKey` در زمان `enqueue` استفاده کنید تا خود صف از
  ایجاد کار تکراری جلوگیری کند، و منطق داخلی handler هم قبل از انجام اثر جانبی وضعیت
  فعلی را چک کند (مثلاً «آیا این سفارش از قبل fulfill شده؟»).
- **claim اتمیک**: `claimNext(workerId)` با یک عبارت واحد
  `UPDATE ... WHERE id = (SELECT ... FOR UPDATE SKIP LOCKED) RETURNING *` کار را
  می‌گیرد. این یعنی چند worker هم‌زمان هرگز یک ردیف را دو بار claim نمی‌کنند — یک
  `findFirst` ساده به‌همراه `update` جداگانه رها می‌شد چون بین خواندن و نوشتن یک بازهٔ
  رقابتی (race window) وجود دارد که دو worker می‌توانند همزمان همان ردیف را بخوانند.
- **backoff نمایی**: هر شکست، `runAt` را به `now + min(2^attempts, 3600)` ثانیه
  می‌برد (حداکثر یک ساعت)، تا وقتی `attempts >= maxAttempts` که کار به `DEAD` می‌رود.
  کارهای `DEAD` دیگر هرگز claim نمی‌شوند — باید دستی بررسی و در صورت نیاز دوباره
  `enqueue` شوند.
- **`reclaimStuck()`**: کارهای `RUNNING` که `lockedAt` آن‌ها بیش از ۱۰ دقیقه قدیمی
  است (یعنی احتمالاً worker حامل آن کرش کرده) به `QUEUED` برمی‌گردند. در ابتدای اجرای
  worker و هر ۵ دقیقه یک‌بار به‌طور خودکار فراخوانی می‌شود.
- **`queueStats()`**: تعداد کارها به تفکیک وضعیت، برای داشبورد ادمین.

## 2) افزودن یک نوع کار جدید

1. یک تابع async با امضای `(payload: any) => Promise<void>` بنویسید — یا در
   `src/server/jobs/handlers.ts` (اگر منطق آن متعلق به این agent است) یا در ماژول
   دامنهٔ مربوطه (مثلاً `src/server/inventory/handlers.ts`).
2. آن را در `src/server/jobs/registry.ts` با یک نام رشته‌ای ثابت (نام `type`) ثبت
   کنید. اگر handler در ماژولی خارج از مالکیت شما تعریف می‌شود، حتماً از
   `import()` پویا داخل try/catch استفاده کنید (نمونه‌اش `wireInventoryHandlers` در
   همان فایل) تا نبود موقت آن ماژول کل worker را از کار نیندازد — فقط یک warning لاگ
   می‌شود و آن نوع کار تا زمانی که ماژول موجود شود «بدون handler» باقی می‌ماند (کارهای
   آن نوع شکست می‌خورند و در نهایت DEAD می‌شوند، که در `queueStats()` قابل مشاهده است).
3. برای فراخوانی: `enqueue('my-job-type', { ...payload }, { idempotencyKey, runAt, maxAttempts })`.
4. اگر کار باید به‌صورت دوره‌ای هم اجرا شود، آن را به `SCHEDULE` در
   `src/server/jobs/scheduler.ts` اضافه کنید و نام آن را به `CRON_TASKS` بیفزایید تا
   هم از طریق worker و هم از طریق endpoint کرون در دسترس باشد (بخش ۴).
5. handler باید idempotent باشد (بخش ۱) و هرگز نباید کد گیفت‌کارت را لاگ یا در
   payload نگه دارد.

## 3) اجرای Worker (systemd / pm2)

اجرای مستقیم:
```bash
npm run worker
# با هم‌روندی دلخواه:
WORKER_CONCURRENCY=5 npm run worker
```

Worker یک بار در شروع `reclaimStuck()` را اجرا می‌کند، سپس با هم‌روندی
`WORKER_CONCURRENCY` (پیش‌فرض ۳) کارها را claim و اجرا می‌کند، و یک زمان‌بند داخلی
دارد که کارهای دوره‌ای بخش ۱ را طبق `SCHEDULE` در `scheduler.ts` صف می‌کند. با
دریافت `SIGTERM`/`SIGINT`، claim کردن کار جدید را متوقف می‌کند، کارهای در حال اجرا را
تمام می‌کند، سپس با کد ۰ خارج می‌شود — یعنی هنگام deploy یا restart، کارهای در حال
پردازش نیمه‌کاره رها نمی‌شوند.

### نمونهٔ systemd unit

```ini
# /etc/systemd/system/giftipay-worker.service
[Unit]
Description=GiftiPay background job worker
After=network.target postgresql.service
Wants=postgresql.service

[Service]
Type=simple
WorkingDirectory=/opt/giftipay
EnvironmentFile=/opt/giftipay/.env
Environment=WORKER_CONCURRENCY=3
ExecStart=/usr/bin/npm run worker
Restart=on-failure
RestartSec=5
# systemd به این pgid سیگنال TERM را برای shutdown مهلت‌دار می‌فرستد؛
# با توجه به graceful shutdown خود worker، این زمان معمولاً کافی است.
TimeoutStopSec=30
User=giftipay
Group=giftipay

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now giftipay-worker
sudo systemctl status giftipay-worker
sudo journalctl -u giftipay-worker -f      # لاگ‌های JSON ساختاریافته
```

### نمونهٔ pm2

```bash
pm2 start npm --name giftipay-worker -- run worker
pm2 save
pm2 logs giftipay-worker
```
`pm2` به‌طور پیش‌فرض هنگام `pm2 stop`/`pm2 restart` سیگنال `SIGINT` می‌فرستد که همان
مسیر graceful shutdown را فعال می‌کند.

> **نکتهٔ فنی دربارهٔ اجرای مستقل**: تمام ماژول‌های زیر `src/server/**` با
> `import 'server-only'` شروع می‌شوند که فقط زیر شرط export به‌نام `react-server`
> (که باندلر Next.js آن را خودکار تنظیم می‌کند) بی‌اثر می‌شود. چون
> `scripts/worker.ts` مستقیماً با `tsx` (بدون باندلر Next.js) اجرا می‌شود، خود این
> اسکریپت یک‌بار خودش را با `NODE_OPTIONS=--conditions=react-server` دوباره اجرا
> (`re-exec`) می‌کند — این کار شفاف و خودکار است و نیازی به تغییر در `npm run worker`
> ندارد.

## 4) جایگزین Cron

اگر نمی‌خواهید یک پردازهٔ همیشه-روشن (worker) نگه دارید، از endpoint زیر استفاده
کنید تا یک زمان‌بند پلتفرمی (کرون سیستم، یا سرویس‌های مدیریت‌شدهٔ cron) همان
کارهای دوره‌ای را با یک درخواست HTTP فعال کند:

```
POST /api/cron/{task}
Authorization: Bearer $HEALTHCHECK_TOKEN
```

`task` باید یکی از مقادیر مجاز در `CRON_TASKS` باشد (`src/server/jobs/scheduler.ts`):
`release-reservations` ، `expire-payments` ، `prune` ، `low-stock-scan` ،
`reconcile-stock`. توکن با همان `HEALTHCHECK_TOKEN` استفاده‌شده در `/api/health/ready`
با مقایسهٔ زمان-ثابت (`timingSafeEqualStr`) بررسی می‌شود؛ اگر این متغیر محیطی تنظیم
نشده باشد، endpoint به‌طور کامل درخواست‌ها را رد می‌کند (برخلاف health/ready که در
این حالت باز می‌ماند) چون این endpoint می‌نویسد، نه فقط می‌خواند.

نمونهٔ crontab سیستمی (بدون نیاز به worker همیشه-روشن):
```cron
# هر دقیقه: آزادسازی رزروهای منقضی‌شده
* * * * *      curl -fsS -X POST -H "Authorization: Bearer $HEALTHCHECK_TOKEN" https://shop.example/api/cron/release-reservations
# هر ۵ دقیقه: انقضای پرداخت‌های معلق
*/5 * * * *    curl -fsS -X POST -H "Authorization: Bearer $HEALTHCHECK_TOKEN" https://shop.example/api/cron/expire-payments
# هر ساعت: پاک‌سازی rate-limit/session/cart/verification منقضی
0 * * * *      curl -fsS -X POST -H "Authorization: Bearer $HEALTHCHECK_TOKEN" https://shop.example/api/cron/prune
# هر ۳۰ دقیقه: اسکن موجودی کم
*/30 * * * *   curl -fsS -X POST -H "Authorization: Bearer $HEALTHCHECK_TOKEN" https://shop.example/api/cron/low-stock-scan
# روزانه ساعت ۳ بامداد: تطبیق موجودی
0 3 * * *      curl -fsS -X POST -H "Authorization: Bearer $HEALTHCHECK_TOKEN" https://shop.example/api/cron/reconcile-stock
```

توجه: این endpoint اغلب فقط یک کار را **صف** می‌کند (`enqueue`) نه اینکه خودش اجرا
کند — یعنی حتی در حالت «بدون worker»، برای پردازش واقعی کارهای صف‌شده باز هم به یک
worker (حتی یک اجرای کوتاه‌مدت دوره‌ای مثل یک cron جداگانه که `npm run worker` را با
timeout کوتاه اجرا می‌کند) نیاز دارید، مگر آنکه از یک worker بلندمدت (بخش ۳) استفاده
کنید. ساده‌ترین راهکار قابل‌اتکا همان worker بلندمدت زیر systemd/pm2 است؛ کرون HTTP
بیشتر برای پلتفرم‌هایی مناسب است که پردازهٔ background بلندمدت را پشتیبانی نمی‌کنند و
شما یک صف‌کشِ دوره‌ای جدا (مثل «هر دقیقه یک بار `npm run worker -- --once`» — با
افزودن چنین پرچمی در آینده در صورت نیاز) در نظر می‌گیرید.

## 5) پشتیبان‌گیری و بازگردانی

### پشتیبان‌گیری

```bash
npm run backup                              # = bash scripts/backup.sh
scripts/backup.sh --dry-run                 # فقط نمایش، بدون نوشتن/حذف
scripts/backup.sh --retention-days 30       # سیاست نگهداری سفارشی
scripts/backup.sh --out-dir /var/backups/giftipay
```

`scripts/backup.sh`:
- `$DATABASE_URL` را می‌خواند (بدون هرگز echo کردن — فقط شکل ماسک‌شده در لاگ می‌آید).
- کل پایگاه‌داده را (نه فقط schema هدف Prisma) با `pg_dump --format=custom` دامپ
  می‌کند — عمداً schema را فیلتر نمی‌کند چون `pg_dump` با فیلتر schema، extensionها
  (مثل `pg_trgm` که ایندکس‌های جست‌وجوی متنی به آن وابسته‌اند) را از دامپ حذف می‌کند.
- خروجی را gzip و با نام timestamp-دار (`giftipay-<UTC-timestamp>.dump.gz`) ذخیره
  می‌کند.
- سیاست نگهداری را اعمال می‌کند: فایل‌های قدیمی‌تر از N روز حذف می‌شوند
  (`--retention-days`، پیش‌فرض ۱۴، یا `$BACKUP_RETENTION_DAYS`).

نمونهٔ کرون روزانهٔ پشتیبان‌گیری (ساعت ۲ بامداد):
```cron
0 2 * * * cd /opt/giftipay && BACKUP_DIR=/var/backups/giftipay ./scripts/backup.sh >> /var/log/giftipay-backup.log 2>&1
```

### بازگردانی — ⚠️ مخرب و غیرقابل‌بازگشت

```bash
scripts/restore.sh --file backups/giftipay-20260101T020000Z.dump.gz
scripts/restore.sh --latest                 # آخرین دامپ در $BACKUP_DIR
scripts/restore.sh --latest --dry-run       # فقط نمایش دستور، بدون اجرا
scripts/restore.sh --latest --yes           # بدون تأیید تعاملی — فقط برای اسکریپت‌های خودکار/تست
```

بازگردانی پایگاه‌دادهٔ مقصد (`$DATABASE_URL`) را **کاملاً بازنویسی** می‌کند
(`pg_restore --clean --if-exists`). بدون `--yes`، اسکریپت یک هشدار واضح چاپ کرده و
از شما می‌خواهد دقیقاً عبارت `RESTORE` را تایپ کنید — هر ورودی دیگری عملیات را لغو
می‌کند. رمز عبور پایگاه‌داده هرگز echo نمی‌شود.

### رویهٔ دریل بازگردانی (Restore Drill) — باید دوره‌ای تست شود

این رویه به‌صورت واقعی روی این محیط تست و تأیید شده است:

```bash
# ۱. یک دامپ واقعی از پایگاه‌دادهٔ فعلی بگیرید
scripts/backup.sh --out-dir /tmp/restore-drill

# ۲. یک پایگاه‌دادهٔ آزمایشیِ جداگانه بسازید — هرگز مستقیم روی دیتابیس اصلی تمرین نکنید
psql "$DATABASE_URL" -c "SELECT 1" # فقط برای اطمینان از دسترسی
psql "postgresql://<user>:<pass>@<host>:5432/postgres" -c "CREATE DATABASE giftipay_restore_drill;"

# ۳. به همان پایگاه‌دادهٔ آزمایشی بازگردانی کنید (DATABASE_URL موقتاً override می‌شود)
DATABASE_URL="postgresql://<user>:<pass>@<host>:5432/giftipay_restore_drill" \
  scripts/restore.sh --file /tmp/restore-drill/giftipay-*.dump.gz --yes

# ۴. صحت را بررسی کنید — تعداد جدول‌ها، چند شمارش ردیف کلیدی، و extensionها
psql "postgresql://<user>:<pass>@<host>:5432/giftipay_restore_drill" -c "\dt" | wc -l
psql "postgresql://<user>:<pass>@<host>:5432/giftipay_restore_drill" -c "\dx"

# ۵. پایگاه‌دادهٔ آزمایشی را دور بریزید
psql "postgresql://<user>:<pass>@<host>:5432/postgres" -c "DROP DATABASE giftipay_restore_drill;"
```

این دریل باید حداقل ماهانه (و بعد از هر تغییر بزرگ schema) تکرار شود — پشتیبانی که
هرگز بازگردانی نشده، آزمایش‌نشده محسوب می‌شود.

## 6) فرمت لاگ

تمام لاگ‌ها JSON تک‌خطی از طریق `src/lib/logger.ts` هستند:
```json
{"ts":"2026-09-04T11:53:51.217Z","level":"warn","msg":"jobs: attempt failed, will retry with backoff","jobId":"...","type":"...","attempts":1,"maxAttempts":3,"backoffSec":2,"error":"boom"}
```
فیلدهای حساس (`password`, `token`, `secret`, `code`, `giftCode`, ...) به‌طور خودکار
`[redacted]` می‌شوند — نگاه کنید به لیست `REDACT` در `src/lib/logger.ts`. سطح لاگ با
`LOG_LEVEL` (`debug`/`info`/`warn`/`error`) کنترل می‌شود.

## 7) Health Endpoints برای مانیتورینگ uptime

| Endpoint | هدف | نیاز به توکن |
|---|---|---|
| `GET /api/health` | Liveness — «پردازه بالاست؟» — سریع، بدون DB | خیر |
| `GET /api/health/ready` | Readiness — round-trip واقعی به DB + عمق صف کار؛ در صورت ناسالم بودن `503` برمی‌گرداند | بله، اگر `HEALTHCHECK_TOKEN` تنظیم شده باشد |
| `POST/GET /api/cron/{task}` | راه‌انداز کرون برای کارهای دوره‌ای (بخش ۴) | بله (الزامی) |

مانیتور uptime شما را به `/api/health` برای زنده‌بودن ساده و به `/api/health/ready`
برای «واقعاً آمادهٔ سرویس‌دهی» متصل کنید. هر دو یک JSON با `status` برمی‌گردانند و
`ready` علاوه‌بر آن `checks` (وضعیت هر بررسی) و `queue` (خروجی `queueStats()`) را هم
شامل می‌شود. هیچ‌کدام هرگز رمز یا اطلاعات حساس برنمی‌گردانند.

توکن را این‌طور ارسال کنید:
```bash
curl -H "Authorization: Bearer $HEALTHCHECK_TOKEN" https://shop.example/api/health/ready
```

## 8) وقتی صف کار انباشته می‌شود

نشانه‌ها: `queueStats().queued` پیوسته در حال رشد است، یا `/api/health/ready` با
`503` و `checks.queue.ok = false` پاسخ می‌دهد (آستانهٔ فعلی: ۵۰۰۰ کار در وضعیت
`QUEUED`، در `src/app/api/health/ready/route.ts`).

۱. **بررسی کنید worker واقعاً در حال اجراست**: `systemctl status giftipay-worker` یا
   `pm2 status`. اگر پردازه بالا نیست، این محتمل‌ترین علت است.
2. **لاگ‌ها را برای شکست‌های تکراری بررسی کنید**: اگر یک نوع کار پیوسته fail می‌شود
   (مثلاً به علت نبود handler یا خطای بیرونی مثل SMTP/Kavenegar از کار افتاده)،
   backoff نمایی باعث می‌شود کارهای همان نوع مدتی طولانی در صف بمانند. با
   `queueStats()` یا کوئری مستقیم `SELECT type, count(*) FROM job_queue WHERE status='QUEUED' GROUP BY type ORDER BY 2 DESC;`
   نوع پرتکرار را پیدا کنید.
3. **هم‌روندی را موقتاً افزایش دهید**: `WORKER_CONCURRENCY=8 npm run worker` (یا چند
   نمونه از worker را اجرا کنید — طراحی `claimNext` دقیقاً برای همین چند-worکری
   امن است).
4. **کارهای `DEAD` را جداگانه بررسی کنید** — این‌ها دیگر خودکار retry نمی‌شوند:
   `SELECT id, type, lastError FROM job_queue WHERE status='DEAD' ORDER BY "updatedAt" DESC LIMIT 50;`
   پس از رفع علت ریشه‌ای، برای اجرای دوباره یک کار مشخص، یا آن ردیف را دستی به
   `QUEUED` برگردانید یا با `enqueue` و یک `idempotencyKey` جدید دوباره صف کنید.
5. اگر مشکل از یک وابستگی بیرونی کند (SMTP/SMS/دروازهٔ پرداخت) است، به‌جای افزایش
   بی‌رویهٔ هم‌روندی، ابتدا آن وابستگی را رفع کنید — هم‌روندی بیشتر روی یک وابستگی
   کند فقط فشار بیشتری به آن وارد می‌کند.

## 9) تنظیمات سیستم (Settings)

`src/server/settings.ts` دسترسی تایپ‌شده و کش‌شده (TTL کوتاه، ۱۵ ثانیه) روی جدول
`Setting` فراهم می‌کند. کلیدهای شناخته‌شده و گروه/نوع/مقدار پیش‌فرض/برچسب فارسی هرکدام
در `SETTINGS_SCHEMA` تعریف شده‌اند — پنل تنظیمات ادمین باید فرم خود را کاملاً از این
schema بسازد، نه با کدنویسی دستی هر فیلد.

- خواندن: `getSetting(key, fallback)`، `getSettings(group)`، `getPublicSettings()`
  (فیلترشده از کلیدهای secret).
- نوشتن: `setSetting(key, value)` — نیازمند مجوز `setting.manage`، و در `AuditLog`
  ثبت می‌شود.
- کش با `invalidateSettings(key?)` باطل می‌شود؛ `setSetting` این کار را خودش انجام
  می‌دهد.

## 10) اطلاع‌رسانی (Notifications)

`src/server/notifications/**` — کانال‌ها: `EMAIL` (SMTP از طریق nodemailer)، `SMS`
(کرون‌ها `log` برای توسعه، یا `kavenegar` برای تولید — با `SMS_PROVIDER`)، `IN_APP`
(نوشتن مستقیم در جدول `Notification`).

**هیچ آداپتوری هرگز موفقیت جعلی گزارش نمی‌کند.** اگر SMTP یا Kavenegar پیکربندی
نشده باشد، آداپتور مربوطه پیام را با سطح `info` (و با حذف هر محتوای شبیه‌به-کد) لاگ
می‌کند و `{ ok:false, error:'... not configured' }` برمی‌گرداند؛ ردیف `Notification`
مربوطه با وضعیت `SUPPRESSED` (نه `SENT`) ثبت می‌شود.

**محافظ نشتِ کد**: بدنهٔ رندرشدهٔ هر اعلان قبل از ارسال با یک الگوی «شبیه به کد
گیفت‌کارت» بررسی می‌شود (`src/server/notifications/guard.ts`). اگر تطبیقی پیدا شود،
ارسال با یک خطای لاگ‌شده (سطح `error`) کاملاً مسدود می‌شود و ردیف `Notification` با
وضعیت `FAILED` ثبت می‌شود — این یعنی هیچ template نادرست‌پیکربندی‌شده‌ای نمی‌تواند کد
گیفت‌کارت را از این لایه عبور دهد.

برای افزودن یک template جدید: یک کلید در `DEFAULT_TEMPLATES` (در `render.ts`)
به‌عنوان fallback داخلی اضافه کنید و لیست توکن‌های آن را در همان کامنت مستند کنید؛
ادمین می‌تواند بعداً یک ردیف در جدول `NotificationTemplate` با همان `key`/`channel`
بسازد تا آن را override کند — رندر همیشه ابتدا ردیف فعال دیتابیس را ترجیح می‌دهد.
