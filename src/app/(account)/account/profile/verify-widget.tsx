'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import type { VerificationChannel, VerificationPurpose } from '@prisma/client';
import { CheckCircle2, ShieldAlert } from 'lucide-react';
import { Button, Alert } from '@/components/ui';
import { OtpInput } from '@/components/auth/otp-input';
import { sendContactVerificationAction, confirmContactVerificationAction } from './actions';

export function VerifyContactWidget({
  identifier,
  channel,
  purpose,
  verified,
}: {
  identifier: string;
  channel: VerificationChannel;
  purpose: VerificationPurpose;
  verified: boolean;
}) {
  const router = useRouter();
  const [stage, setStage] = React.useState<'idle' | 'sent' | 'done'>(verified ? 'done' : 'idle');
  const [code, setCode] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  if (stage === 'done' || verified) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-accent">
        <CheckCircle2 className="size-3.5" aria-hidden />
        تأیید‌شده
      </span>
    );
  }

  const send = async () => {
    setLoading(true);
    setError(null);
    const res = await sendContactVerificationAction(identifier, channel, purpose);
    setLoading(false);
    if (res.ok) setStage('sent');
    else setError(res.error);
  };

  const confirm = async (value: string) => {
    setLoading(true);
    setError(null);
    const res = await confirmContactVerificationAction(identifier, value, purpose);
    setLoading(false);
    if (res.ok) {
      setStage('done');
      router.refresh();
    } else {
      setError(res.error);
    }
  };

  if (stage === 'idle') {
    return (
      <span className="inline-flex items-center gap-2">
        <span className="inline-flex items-center gap-1 text-xs font-medium text-warn">
          <ShieldAlert className="size-3.5" aria-hidden />
          تأییدنشده
        </span>
        <Button type="button" variant="link" size="xs" onClick={send} loading={loading}>
          تأیید کنید
        </Button>
      </span>
    );
  }

  return (
    <div className="mt-2 space-y-2 rounded-xl border border-border-base bg-surface-muted p-3">
      {error && <Alert tone="danger">{error}</Alert>}
      <p className="text-xs text-fg-muted">کد ۶ رقمی ارسال‌شده را وارد کنید.</p>
      <OtpInput
        value={code}
        onChange={setCode}
        onComplete={confirm}
        disabled={loading}
        label="کد تأیید"
        autoFocus={false}
      />
      <Button type="button" variant="link" size="xs" onClick={send} loading={loading}>
        ارسال مجدد کد
      </Button>
    </div>
  );
}
