import type { Metadata } from 'next';
import { requireUser } from '@/server/auth/guard';
import { Card, SectionHeading } from '@/components/ui';
import { PageHeading } from '@/components/account/page-heading';
import { ChangePasswordForm } from './change-password-form';
import { TwoFactorPanel } from './twofactor-panel';
import { SessionsPanel } from './sessions-panel';
import { listMySessions } from './actions';

export const metadata: Metadata = { title: 'امنیت حساب' };
export const dynamic = 'force-dynamic';

export default async function SecurityPage() {
  const user = await requireUser('/account/security');
  const sessions = await listMySessions();

  return (
    <div className="space-y-6">
      <PageHeading title="امنیت حساب" />

      <Card>
        <SectionHeading title="تغییر گذرواژه" className="mb-4" />
        <ChangePasswordForm />
      </Card>

      <Card>
        <SectionHeading title="تأیید دومرحله‌ای" className="mb-4" />
        <TwoFactorPanel enabled={user.twoFactorEnabled} />
      </Card>

      <Card>
        <SectionHeading title="نشست‌ها و دستگاه‌های فعال" className="mb-4" />
        <SessionsPanel sessions={sessions} />
      </Card>
    </div>
  );
}
