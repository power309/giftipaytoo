'use client';

import * as React from 'react';
import { Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { isCommonPassword } from '@/lib/schemas';

export type PasswordStrength = { score: 0 | 1 | 2 | 3 | 4; label: string; ok: boolean };

const RULES = [
  { key: 'len', test: (v: string) => v.length >= 8, label: 'حداقل ۸ کاراکتر' },
  {
    key: 'classes',
    test: (v: string) =>
      [/[a-z]/, /[A-Z]/, /[0-9]/, /[^a-zA-Z0-9]/].filter((re) => re.test(v)).length >= 3,
    label: 'ترکیبی از حروف بزرگ، کوچک، عدد یا نماد',
  },
  { key: 'common', test: (v: string) => v.length > 0 && !isCommonPassword(v), label: 'گذرواژه رایج نباشد' },
];

export function evaluatePassword(password: string): PasswordStrength {
  if (!password) return { score: 0, label: '', ok: false };
  const passed = RULES.filter((r) => r.test(password)).length;
  const lengthBonus = password.length >= 12 ? 1 : 0;
  const score = Math.min(4, passed + lengthBonus) as PasswordStrength['score'];
  const ok = RULES.every((r) => r.test(password));
  const labels = ['بسیار ضعیف', 'ضعیف', 'متوسط', 'قوی', 'بسیار قوی'];
  return { score, label: labels[score], ok };
}

const BAR_TONES = ['bg-danger', 'bg-danger', 'bg-warn', 'bg-accent', 'bg-accent'];

/** Live strength meter + rule checklist, shown up front per the spec. */
export function PasswordStrengthMeter({ password }: { password: string }) {
  const strength = React.useMemo(() => evaluatePassword(password), [password]);
  return (
    <div className="space-y-2.5" aria-live="polite">
      <div className="flex gap-1.5">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className={cn(
              'h-1.5 flex-1 rounded-full transition-colors',
              password && i < strength.score ? BAR_TONES[strength.score] : 'bg-surface-muted',
            )}
          />
        ))}
      </div>
      {password && (
        <p className="text-xs font-medium text-fg-muted">
          استحکام گذرواژه: <span className="text-fg">{strength.label}</span>
        </p>
      )}
      <ul className="space-y-1">
        {RULES.map((r) => {
          const pass = password ? r.test(password) : false;
          return (
            <li key={r.key} className="flex items-center gap-1.5 text-xs">
              {pass ? (
                <Check className="size-3.5 shrink-0 text-accent" aria-hidden />
              ) : (
                <X className="size-3.5 shrink-0 text-fg-faint" aria-hidden />
              )}
              <span className={pass ? 'text-fg-muted' : 'text-fg-faint'}>{r.label}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
