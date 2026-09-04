'use client';

import * as React from 'react';
import { useActionState } from 'react';
import type { VerificationChannel, VerificationPurpose } from '@prisma/client';
import { Alert, Button } from '@/components/ui';
import { AuthSubmitButton } from '@/components/auth/submit-button';
import { OtpInput } from '@/components/auth/otp-input';
import { toPersianDigits } from '@/lib/persian';
import { verifyAction, resendCodeAction, type VerifyFormState } from './actions';

const RESEND_COOLDOWN_SEC = 90;

export function VerifyForm({
  next,
  identifier,
  channel,
  purpose,
  maskedIdentifier,
}: {
  next: string;
  identifier: string;
  channel: VerificationChannel;
  purpose: VerificationPurpose;
  maskedIdentifier: string;
}) {
  const [state, formAction] = useActionState<VerifyFormState, FormData>(verifyAction, { ok: false });
  const [code, setCode] = React.useState('');
  const [cooldown, setCooldown] = React.useState(RESEND_COOLDOWN_SEC);
  const [resending, setResending] = React.useState(false);
  const [resendMsg, setResendMsg] = React.useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  const formRef = React.useRef<HTMLFormElement>(null);

  React.useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  const handleResend = async () => {
    setResending(true);
    setResendMsg(null);
    try {
      const res = await resendCodeAction(identifier, channel, purpose);
      if (res.ok) {
        setResendMsg({ tone: 'success', text: 'کد تأیید جدید ارسال شد.' });
        setCooldown(RESEND_COOLDOWN_SEC);
      } else {
        setResendMsg({ tone: 'danger', text: res.error });
      }
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="space-y-5">
      {!state.ok && state.error && <Alert tone="danger">{state.error}</Alert>}
      {resendMsg && (
        <Alert tone={resendMsg.tone}>{resendMsg.text}</Alert>
      )}

      <p className="text-center text-sm text-fg-muted">
        کد ۶ رقمی ارسال‌شده به {channel === 'EMAIL' ? 'ایمیل' : 'شماره موبایل'}{' '}
        <bdi className="font-medium text-fg">{maskedIdentifier}</bdi> را وارد کنید.
      </p>

      <form ref={formRef} action={formAction} className="space-y-5">
        <input type="hidden" name="next" value={next} />
        <input type="hidden" name="identifier" value={identifier} />
        <input type="hidden" name="purpose" value={purpose} />
        <input type="hidden" name="code" value={code} />

        <OtpInput
          value={code}
          onChange={setCode}
          onComplete={() => formRef.current?.requestSubmit()}
          label="کد تأیید ۶ رقمی"
        />

        <AuthSubmitButton disabled={code.length !== 6}>تأیید کد</AuthSubmitButton>
      </form>

      <div className="text-center text-sm text-fg-muted">
        {cooldown > 0 ? (
          <span>
            ارسال مجدد کد تا{' '}
            <span className="font-medium text-fg tnum">{toPersianDigits(cooldown)}</span> ثانیه دیگر
          </span>
        ) : (
          <Button type="button" variant="link" size="sm" onClick={handleResend} loading={resending}>
            ارسال مجدد کد
          </Button>
        )}
      </div>
    </div>
  );
}
