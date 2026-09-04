/**
 * Validated environment access.
 * Secrets are read lazily so that importing this module in the browser bundle
 * (which never happens for server-only keys) cannot leak values.
 */

function req(name: string): string {
  const v = process.env[name];
  if (!v || v.trim() === '') {
    throw new Error(
      `متغیر محیطی «${name}» تنظیم نشده است. فایل .env.example را ببینید.`,
    );
  }
  return v;
}

function opt(name: string, fallback = ''): string {
  return process.env[name]?.trim() || fallback;
}

function num(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function bool(name: string, fallback = false): boolean {
  const raw = process.env[name]?.toLowerCase();
  if (raw === undefined || raw === '') return fallback;
  return raw === 'true' || raw === '1' || raw === 'yes';
}

export const env = {
  get nodeEnv() {
    return opt('NODE_ENV', 'development');
  },
  get appEnv() {
    return opt('APP_ENV', 'development') as 'development' | 'staging' | 'production';
  },
  get isProduction() {
    return this.appEnv === 'production';
  },
  get appUrl() {
    return opt('APP_URL', 'http://localhost:3000').replace(/\/$/, '');
  },
  get appName() {
    return opt('APP_NAME', 'گیفتی‌پی');
  },
  get databaseUrl() {
    return req('DATABASE_URL');
  },
  get authSecret() {
    const s = req('AUTH_SECRET');
    if (s.length < 32) throw new Error('AUTH_SECRET باید حداقل ۳۲ کاراکتر باشد.');
    return s;
  },
  get encryptionKey() {
    const raw = req('ENCRYPTION_KEY');
    const buf = Buffer.from(raw, 'base64');
    if (buf.length !== 32) {
      throw new Error('ENCRYPTION_KEY باید ۳۲ بایت base64 باشد (openssl rand -base64 32).');
    }
    return buf;
  },
  get codeFingerprintKey() {
    return Buffer.from(req('CODE_FINGERPRINT_KEY'), 'base64');
  },
  zarinpal: {
    get merchantId() {
      return opt('ZARINPAL_MERCHANT_ID');
    },
    get mode() {
      return opt('ZARINPAL_MODE', 'sandbox') as 'sandbox' | 'production';
    },
    get callbackUrl() {
      return opt('ZARINPAL_CALLBACK_URL', `${env.appUrl}/api/payments/zarinpal/callback`);
    },
    get configured() {
      return opt('ZARINPAL_MERCHANT_ID').length > 0;
    },
  },
  smtp: {
    get host() {
      return opt('SMTP_HOST');
    },
    get port() {
      return num('SMTP_PORT', 587);
    },
    get secure() {
      return bool('SMTP_SECURE', false);
    },
    get user() {
      return opt('SMTP_USER');
    },
    get password() {
      return opt('SMTP_PASSWORD');
    },
    get from() {
      return opt('MAIL_FROM', 'GiftiPay <no-reply@localhost>');
    },
    get configured() {
      return opt('SMTP_HOST').length > 0;
    },
  },
  sms: {
    get provider() {
      return opt('SMS_PROVIDER', 'log');
    },
    get apiKey() {
      return opt('SMS_API_KEY');
    },
    get sender() {
      return opt('SMS_SENDER');
    },
    get configured() {
      return opt('SMS_PROVIDER', 'log') !== 'log' && opt('SMS_API_KEY').length > 0;
    },
  },
  limits: {
    get rateLimitEnabled() {
      return bool('RATE_LIMIT_ENABLED', true);
    },
    get maxLoginAttempts() {
      return num('MAX_LOGIN_ATTEMPTS', 5);
    },
    get loginLockMinutes() {
      return num('LOGIN_LOCK_MINUTES', 15);
    },
    get sessionTtlHours() {
      return num('SESSION_TTL_HOURS', 168);
    },
    get cartReservationMinutes() {
      return num('CART_RESERVATION_MINUTES', 15);
    },
    get priceQuoteTtlMinutes() {
      return num('PRICE_QUOTE_TTL_MINUTES', 30);
    },
    get priceStaleBlockHours() {
      return num('PRICE_STALE_BLOCK_HOURS', 24);
    },
    get priceApprovalThresholdPercent() {
      return num('PRICE_APPROVAL_THRESHOLD_PERCENT', 15);
    },
  },
  get logLevel() {
    return opt('LOG_LEVEL', 'info');
  },
  get healthcheckToken() {
    return opt('HEALTHCHECK_TOKEN');
  },
  seed: {
    get adminEmail() {
      return opt('SEED_ADMIN_EMAIL', 'admin@giftipay.local');
    },
    get adminPassword() {
      return opt('SEED_ADMIN_PASSWORD', 'Admin@12345');
    },
    get demoData() {
      return bool('SEED_DEMO_DATA', true);
    },
  },
};
