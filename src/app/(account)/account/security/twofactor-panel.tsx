'use client';

import * as React from 'react';
import { useActionState } from 'react';
import { ShieldCheck, ShieldOff, Download, TriangleAlert } from 'lucide-react';
import { Alert, Button, Field, Input, Card } from '@/components/ui';
import { OtpInput } from '@/components/auth/otp-input';
import { QrCode } from '@/components/auth/qr-code';
import { CopyButton } from '@/components/ui';
import {
  enrollTwoFactorAction, confirmTwoFactorAction, disableTwoFactorAction, type SecurityFormState,
} from './actions';

function downloadBackupCodes(codes: string[]) {
  const text = `کدهای پشتیبان تأیید دومرحله‌ای گیفتی‌پی\nهر کد فقط یک‌بار قابل استفاده است. این فایل را در جای امنی نگه دارید.\n\n${codes.join('\n')}\n`;
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'giftipay-backup-codes.txt';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function TwoFactorPanel({ enabled }: { enabled: boolean }) {
  const [stage, setStage] = React.useState<'idle' | 'enrolling' | 'backup' | 'disabling'>('idle');
  const [totpUri, setTotpUri] = React.useState('');
  const [secret, setSecret] = React.useState('');
  const [code, setCode] = React.useState('');
  const [backupCodes, setBackupCodes] = React.useState<string[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const startEnroll = async () => {
    setLoading(true);
    setError(null);
    const res = await enrollTwoFactorAction();
    setLoading(false);
    if (res.ok) {
      setTotpUri(res.totpUri);
      setSecret(res.secret);
      setStage('enrolling');
    } else {
      setError(res.error);
    }
  };

  const confirm = async (value: string) => {
    setLoading(true);
    setError(null);
    const res = await confirmTwoFactorAction(value);
    setLoading(false);
    if (res.ok) {
      setBackupCodes(res.backupCodes);
      setStage('backup');
    } else {
      setError(res.error);
      setCode('');
    }
  };

  const [disableState, disableFormAction] = useActionState<SecurityFormState, FormData>(disableTwoFactorAction, {
    ok: false,
  });

  React.useEffect(() => {
    if (disableState.ok) setStage('idle');
  }, [disableState.ok]);

  if (stage === 'backup') {
    return (
      <div className="space-y-4">
        <Alert tone="success" title="تأیید دومرحله‌ای فعال شد">
          این کدهای پشتیبان را ذخیره کنید — هرکدام فقط یک‌بار قابل استفاده است و در صورت دسترسی نداشتن به برنامه
          احراز هویت، برای ورود به حساب استفاده می‌شوند. این کدها دیگر نمایش داده نخواهند شد.
        </Alert>
        <div className="grid grid-cols-2 gap-2 rounded-xl border border-border-base bg-surface-muted p-4 font-mono text-sm tnum" dir="ltr">
          {backupCodes.map((c) => (
            <span key={c}>{c}</span>
          ))}
        </div>
        <Button type="button" variant="secondary" onClick={() => downloadBackupCodes(backupCodes)}>
          <Download className="size-4" aria-hidden />
          دانلود کدهای پشتیبان
        </Button>
        <div>
          <Button type="button" onClick={() => setStage('idle')}>
            متوجه شدم
          </Button>
        </div>
      </div>
    );
  }

  if (stage === 'enrolling') {
    return (
      <div className="space-y-4">
        {error && <Alert tone="danger">{error}</Alert>}
        <p className="text-sm text-fg-muted">
          کد QR زیر را با برنامه احراز هویت (Google Authenticator، Authy و مشابه آن) اسکن کنید، سپس کد ۶ رقمی نمایش‌داده‌شده
          را وارد کنید.
        </p>
        <div className="flex justify-center">
          <QrCode value={totpUri} />
        </div>
        <div>
          <p className="mb-1.5 text-xs font-medium text-fg-muted">امکان اسکن ندارید؟ این کلید را به‌صورت دستی وارد کنید:</p>
          <div className="flex items-center gap-2">
            <code dir="ltr" className="flex-1 truncate rounded-lg border border-border-base bg-surface-muted px-3 py-2 font-mono text-xs">
              {secret}
            </code>
            <CopyButton text={secret} />
          </div>
        </div>
        <OtpInput value={code} onChange={setCode} onComplete={confirm} disabled={loading} label="کد تأیید فعال‌سازی" />
        <Button type="button" variant="ghost" size="sm" onClick={() => setStage('idle')}>
          انصراف
        </Button>
      </div>
    );
  }

  if (stage === 'disabling') {
    return (
      <form action={disableFormAction} className="space-y-4">
        {!disableState.ok && disableState.error && <Alert tone="danger">{disableState.error}</Alert>}
        <Alert tone="warn" title="غیرفعال‌سازی تأیید دومرحله‌ای">
          با غیرفعال‌سازی، امنیت حساب شما کاهش می‌یابد و تمام دستگاه‌های دیگر از حساب خارج خواهند شد.
        </Alert>
        <Field label="گذرواژه" htmlFor="disable-password" required>
          <Input id="disable-password" name="password" type="password" required />
        </Field>
        <Field label="کد تأیید یا کد پشتیبان" htmlFor="disable-code" required>
          <Input id="disable-code" name="code" required dir="ltr" />
        </Field>
        <div className="flex gap-2">
          <Button type="submit" variant="danger">
            <ShieldOff className="size-4" aria-hidden />
            غیرفعال‌سازی
          </Button>
          <Button type="button" variant="ghost" onClick={() => setStage('idle')}>
            انصراف
          </Button>
        </div>
      </form>
    );
  }

  return (
    <Card className="bg-transparent border-0 shadow-none p-0">
      {enabled ? (
        <div className="space-y-3">
          <p className="flex items-center gap-1.5 text-sm font-medium text-accent">
            <ShieldCheck className="size-4" aria-hidden />
            تأیید دومرحله‌ای برای حساب شما فعال است.
          </p>
          <Button type="button" variant="secondary" size="sm" onClick={() => setStage('disabling')}>
            غیرفعال‌سازی
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {error && <Alert tone="danger">{error}</Alert>}
          <p className="flex items-center gap-1.5 text-sm text-fg-muted">
            <TriangleAlert className="size-4 text-warn" aria-hidden />
            تأیید دومرحله‌ای برای این حساب فعال نیست.
          </p>
          <Button type="button" onClick={startEnroll} loading={loading}>
            فعال‌سازی تأیید دومرحله‌ای
          </Button>
        </div>
      )}
    </Card>
  );
}
