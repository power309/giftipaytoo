import 'server-only';
import { db } from '@/server/db';

/**
 * Per-variant code format rules.
 *
 * There is no dedicated schema column for this (schema.prisma is owned by
 * another agent), so rules are stored in the generic `Setting` table under
 * key `inventory.format_rule.<variantId>`, e.g.:
 *   { "pattern": "^[A-Z0-9]{16}$", "minLen": 16, "maxLen": 16 }
 * When no row exists, a permissive default is used.
 */
export type CodeFormatRule = {
  /** Optional regex source the trimmed code must fully match. */
  pattern?: string;
  minLen: number;
  maxLen: number;
};

export const DEFAULT_FORMAT_RULE: CodeFormatRule = { minLen: 4, maxLen: 64 };

function settingKey(variantId: string): string {
  return `inventory.format_rule.${variantId}`;
}

export async function getFormatRule(variantId: string): Promise<CodeFormatRule> {
  try {
    const row = await db.setting.findUnique({ where: { key: settingKey(variantId) } });
    if (!row || typeof row.value !== 'object' || row.value === null) return DEFAULT_FORMAT_RULE;
    const v = row.value as Partial<CodeFormatRule>;
    return {
      minLen: typeof v.minLen === 'number' ? v.minLen : DEFAULT_FORMAT_RULE.minLen,
      maxLen: typeof v.maxLen === 'number' ? v.maxLen : DEFAULT_FORMAT_RULE.maxLen,
      pattern: typeof v.pattern === 'string' ? v.pattern : undefined,
    };
  } catch {
    return DEFAULT_FORMAT_RULE;
  }
}

export async function setFormatRule(variantId: string, rule: CodeFormatRule): Promise<void> {
  await db.setting.upsert({
    where: { key: settingKey(variantId) },
    create: {
      key: settingKey(variantId),
      value: rule,
      group: 'inventory',
      description: 'قالب مجاز کد برای این متغیر محصول',
    },
    update: { value: rule },
  });
}

export type FormatCheck = { ok: true } | { ok: false; message: string };

/** Pure validation — no I/O. Rejects obviously malformed input either way. */
export function validateCodeFormat(plaintext: string, rule: CodeFormatRule): FormatCheck {
  const s = plaintext.trim();
  if (s.length === 0) return { ok: false, message: 'کد خالی است.' };
  if (/[\r\n\t]/.test(s)) return { ok: false, message: 'کد نباید شامل خط جدید یا تب باشد.' };
  if (s.length < rule.minLen) {
    return { ok: false, message: `کد باید حداقل ${rule.minLen} کاراکتر باشد.` };
  }
  if (s.length > rule.maxLen) {
    return { ok: false, message: `کد نباید بیشتر از ${rule.maxLen} کاراکتر باشد.` };
  }
  if (rule.pattern) {
    let re: RegExp;
    try {
      re = new RegExp(rule.pattern);
    } catch {
      // A malformed stored pattern must never brick imports — ignore it.
      return { ok: true };
    }
    if (!re.test(s)) {
      return { ok: false, message: 'قالب کد با الگوی تعریف‌شده برای این کالا مطابقت ندارد.' };
    }
  }
  return { ok: true };
}
