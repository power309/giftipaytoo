'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Lock, Send } from 'lucide-react';
import { Button, Field, Input, Textarea, Select, Checkbox, Tabs } from '@/components/ui';
import { Panel } from '@/components/admin/kit';
import { saveSetting, sendTestEmail, sendTestSms } from './actions';

export type FieldDef = {
  key: string;
  group: string;
  tabKey: string;
  type: 'string' | 'number' | 'boolean' | 'json' | 'stringArray';
  labelFa: string;
  descriptionFa?: string;
  options?: string[];
  secret?: boolean;
  secretConfigured?: boolean;
  value: unknown;
};

function SecretField({ field }: { field: FieldDef }) {
  const router = useRouter();
  const [editing, setEditing] = React.useState(false);
  const [value, setValue] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    const res = await saveSetting({ key: field.key, value });
    setBusy(false);
    if (!res.ok) setError(res.error);
    else {
      setEditing(false);
      setValue('');
      router.refresh();
    }
  }

  return (
    <Field label={field.labelFa} hint={field.descriptionFa}>
      {!editing ? (
        <div className="flex items-center gap-2">
          <span className="flex h-11 flex-1 items-center gap-1.5 rounded-xl border border-border-base bg-surface-muted px-3.5 text-sm text-fg-muted">
            <Lock className="size-3.5" aria-hidden />
            {field.secretConfigured ? '•••• تنظیم شده' : 'تنظیم نشده'}
          </span>
          <Button type="button" size="sm" variant="secondary" onClick={() => setEditing(true)}>
            تغییر
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          <Input type="password" value={value} onChange={(e) => setValue(e.target.value)} dir="ltr" placeholder="مقدار جدید…" />
          {error && <p className="text-xs text-danger">{error}</p>}
          <div className="flex gap-2">
            <Button type="button" size="sm" loading={busy} disabled={!value} onClick={submit}>
              ذخیره
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => { setEditing(false); setValue(''); setError(null); }}>
              انصراف
            </Button>
          </div>
        </div>
      )}
    </Field>
  );
}

function SettingField({ field }: { field: FieldDef }) {
  const router = useRouter();
  const [value, setValue] = React.useState(field.value);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState(false);

  if (field.secret) return <SecretField field={field} />;

  async function submit(v: unknown) {
    setBusy(true);
    setError(null);
    setSaved(false);
    const res = await saveSetting({ key: field.key, value: v });
    setBusy(false);
    if (!res.ok) setError(res.error);
    else {
      setSaved(true);
      router.refresh();
    }
  }

  if (field.type === 'boolean') {
    return (
      <div className="flex items-center justify-between gap-3 rounded-xl border border-border-base p-3">
        <div>
          <p className="text-sm font-medium text-fg">{field.labelFa}</p>
          {field.descriptionFa && <p className="text-xs text-fg-muted">{field.descriptionFa}</p>}
          {error && <p className="text-xs text-danger">{error}</p>}
        </div>
        <Checkbox
          checked={!!value}
          onChange={(e) => {
            setValue(e.target.checked);
            submit(e.target.checked);
          }}
          label=""
        />
      </div>
    );
  }

  if (field.type === 'number') {
    return (
      <Field label={field.labelFa} hint={field.descriptionFa}>
        <div className="flex gap-2">
          <Input type="number" value={value as number} onChange={(e) => setValue(Number(e.target.value))} className="flex-1" />
          <Button type="button" size="sm" variant="secondary" loading={busy} onClick={() => submit(value)}>
            ذخیره
          </Button>
        </div>
        {error && <p className="mt-1 text-xs text-danger">{error}</p>}
        {saved && !error && <p className="mt-1 text-xs text-accent">ذخیره شد.</p>}
      </Field>
    );
  }

  if (field.type === 'stringArray' && field.options) {
    const arr = Array.isArray(value) ? (value as string[]) : [];
    return (
      <Field label={field.labelFa} hint={field.descriptionFa}>
        <div className="flex flex-wrap gap-3">
          {field.options.map((opt) => (
            <Checkbox
              key={opt}
              checked={arr.includes(opt)}
              onChange={(e) => {
                const next = e.target.checked ? [...arr, opt] : arr.filter((o) => o !== opt);
                setValue(next);
                submit(next);
              }}
              label={opt}
            />
          ))}
        </div>
        {error && <p className="mt-1 text-xs text-danger">{error}</p>}
      </Field>
    );
  }

  if (field.type === 'string' && field.options) {
    return (
      <Field label={field.labelFa} hint={field.descriptionFa}>
        <Select value={value as string} onChange={(e) => { setValue(e.target.value); submit(e.target.value); }}>
          {field.options.map((o) => <option key={o} value={o}>{o}</option>)}
        </Select>
        {error && <p className="mt-1 text-xs text-danger">{error}</p>}
      </Field>
    );
  }

  const isLong = typeof value === 'string' && value.length > 80;
  return (
    <Field label={field.labelFa} hint={field.descriptionFa}>
      <div className="flex gap-2">
        {isLong ? (
          <Textarea value={(value as string) ?? ''} onChange={(e) => setValue(e.target.value)} rows={3} className="flex-1" />
        ) : (
          <Input value={(value as string) ?? ''} onChange={(e) => setValue(e.target.value)} className="flex-1" />
        )}
        <Button type="button" size="sm" variant="secondary" loading={busy} onClick={() => submit(value)}>
          ذخیره
        </Button>
      </div>
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
      {saved && !error && <p className="mt-1 text-xs text-accent">ذخیره شد.</p>}
    </Field>
  );
}

function TestSendPanel() {
  const [email, setEmail] = React.useState('');
  const [phone, setPhone] = React.useState('');
  const [emailBusy, setEmailBusy] = React.useState(false);
  const [smsBusy, setSmsBusy] = React.useState(false);
  const [emailMsg, setEmailMsg] = React.useState<{ ok: boolean; text: string } | null>(null);
  const [smsMsg, setSmsMsg] = React.useState<{ ok: boolean; text: string } | null>(null);

  async function testEmail() {
    setEmailBusy(true);
    setEmailMsg(null);
    const res = await sendTestEmail({ to: email });
    setEmailBusy(false);
    setEmailMsg({ ok: res.ok, text: res.ok ? (res.message ?? 'ارسال شد.') : res.error });
  }
  async function testSms() {
    setSmsBusy(true);
    setSmsMsg(null);
    const res = await sendTestSms({ to: phone });
    setSmsBusy(false);
    setSmsMsg({ ok: res.ok, text: res.ok ? (res.message ?? 'ارسال شد.') : res.error });
  }

  return (
    <Panel title="آزمایش ارسال">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Field label="ایمیل مقصد برای تست">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} dir="ltr" />
          </Field>
          <Button size="sm" variant="secondary" loading={emailBusy} disabled={!email} onClick={testEmail}>
            <Send className="size-4" aria-hidden />
            تست ایمیل
          </Button>
          {emailMsg && <p className={`text-xs ${emailMsg.ok ? 'text-accent' : 'text-danger'}`}>{emailMsg.text}</p>}
        </div>
        <div className="space-y-2">
          <Field label="موبایل مقصد برای تست">
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} dir="ltr" placeholder="09xxxxxxxxx" />
          </Field>
          <Button size="sm" variant="secondary" loading={smsBusy} disabled={!phone} onClick={testSms}>
            <Send className="size-4" aria-hidden />
            تست پیامک
          </Button>
          {smsMsg && <p className={`text-xs ${smsMsg.ok ? 'text-accent' : 'text-danger'}`}>{smsMsg.text}</p>}
        </div>
      </div>
    </Panel>
  );
}

export function SettingsClient({ fields, tabOrder, tabLabels }: { fields: FieldDef[]; tabOrder: string[]; tabLabels: Record<string, string> }) {
  const presentTabs = tabOrder.filter((t) => fields.some((f) => f.tabKey === t));
  const [active, setActive] = React.useState(presentTabs[0] ?? tabOrder[0]);

  const groupsInTab = (tabKey: string) => {
    const groups = Array.from(new Set(fields.filter((f) => f.tabKey === tabKey).map((f) => f.group)));
    return groups;
  };

  return (
    <div>
      <Tabs className="mb-4" active={active} onChange={setActive} tabs={presentTabs.map((t) => ({ key: t, label: tabLabels[t] ?? t }))} />
      <div className="space-y-4">
        {groupsInTab(active).map((g) => (
          <Panel key={g} title={fields.find((f) => f.group === g)?.group === g ? undefined : undefined}>
            <div className="space-y-4">
              {fields.filter((f) => f.tabKey === active && f.group === g).map((f) => (
                <SettingField key={f.key} field={f} />
              ))}
            </div>
          </Panel>
        ))}
        {active === 'notifications' && <TestSendPanel />}
        {groupsInTab(active).length === 0 && (
          <p className="rounded-xl border border-border-base bg-surface p-6 text-center text-sm text-fg-muted">تنظیمی در این بخش تعریف نشده است.</p>
        )}
      </div>
    </div>
  );
}
