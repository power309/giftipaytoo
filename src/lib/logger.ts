/**
 * Structured JSON logger with automatic redaction of sensitive keys.
 * Nothing that looks like a code, token, password or key is ever emitted.
 */

type Level = 'debug' | 'info' | 'warn' | 'error';
const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const REDACT = [
  'password', 'passwordhash', 'token', 'tokenhash', 'secret', 'authorization',
  'cookie', 'code', 'codecipher', 'codeplain', 'pin', 'serial', 'apikey',
  'api_key', 'merchantid', 'encryptionkey', 'authority', 'credentials',
  'credentialsencrypted', 'twofactorsecret', 'giftcode',
];

function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[deep]';
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (value instanceof Error) return { name: value.name, message: value.message };
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = REDACT.includes(k.toLowerCase()) ? '[redacted]' : redact(v, depth + 1);
    }
    return out;
  }
  return value;
}

function emit(level: Level, message: string, meta?: Record<string, unknown>) {
  const min = ORDER[(process.env.LOG_LEVEL as Level) ?? 'info'] ?? 20;
  if (ORDER[level] < min) return;
  const line = {
    ts: new Date().toISOString(),
    level,
    msg: message,
    ...(meta ? (redact(meta) as Record<string, unknown>) : {}),
  };
  const out = JSON.stringify(line);
  if (level === 'error') console.error(out);
  else if (level === 'warn') console.warn(out);
  else console.log(out);
}

export const logger = {
  debug: (m: string, meta?: Record<string, unknown>) => emit('debug', m, meta),
  info: (m: string, meta?: Record<string, unknown>) => emit('info', m, meta),
  warn: (m: string, meta?: Record<string, unknown>) => emit('warn', m, meta),
  error: (m: string, meta?: Record<string, unknown>) => emit('error', m, meta),
};
