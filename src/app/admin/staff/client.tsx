'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus, ShieldOff, Activity } from 'lucide-react';
import { Button, Modal, Field, Input, Checkbox, Tabs, Badge } from '@/components/ui';
import { StatusPill } from '@/components/admin/kit';
import {
  inviteStaffMember, updateStaffRoles, setStaffStatus, resetStaffTwoFactor, createRole, toggleRolePermission,
} from './actions';

export type StaffRow = {
  id: string; firstName: string | null; lastName: string | null; email: string | null; phone: string | null;
  status: string; twoFactorEnabled: boolean; lastLoginAt: Date | null; roleIds: string[];
};
export type RoleRow = { id: string; nameFa: string; isSystem: boolean; permissionKeys: string[] };
export type PermGroup = { group: string; items: { key: string; nameFa: string }[] };

function staffName(s: { firstName: string | null; lastName: string | null; email: string | null }) {
  return [s.firstName, s.lastName].filter(Boolean).join(' ') || s.email || 'کارمند';
}

export function StaffClient({ staff, roles, permGroups }: { staff: StaffRow[]; roles: RoleRow[]; permGroups: PermGroup[] }) {
  const [tab, setTab] = React.useState('staff');
  return (
    <div>
      <Tabs className="mb-4" active={tab} onChange={setTab} tabs={[{ key: 'staff', label: 'کارکنان' }, { key: 'roles', label: 'نقش‌ها و ماتریس دسترسی' }]} />
      {tab === 'staff' ? <StaffTable staff={staff} roles={roles} /> : <RolesMatrix roles={roles} permGroups={permGroups} />}
    </div>
  );
}

function StaffTable({ staff, roles }: { staff: StaffRow[]; roles: RoleRow[] }) {
  const router = useRouter();
  const [inviteOpen, setInviteOpen] = React.useState(false);
  const [rolesOpen, setRolesOpen] = React.useState<StaffRow | null>(null);
  const [form, setForm] = React.useState({ email: '', phone: '', firstName: '', lastName: '', roleIds: [] as string[] });
  const [tempPassword, setTempPassword] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [selectedRoleIds, setSelectedRoleIds] = React.useState<string[]>([]);

  function openInvite() {
    setForm({ email: '', phone: '', firstName: '', lastName: '', roleIds: [] });
    setTempPassword(null);
    setError(null);
    setInviteOpen(true);
  }

  async function submitInvite() {
    setBusy(true);
    setError(null);
    const res = await inviteStaffMember(form);
    setBusy(false);
    if (!res.ok) setError(res.error);
    else {
      setTempPassword(res.data!.tempPassword);
      router.refresh();
    }
  }

  function openRoles(s: StaffRow) {
    setRolesOpen(s);
    setSelectedRoleIds(s.roleIds);
    setError(null);
  }

  async function submitRoles() {
    if (!rolesOpen) return;
    setBusy(true);
    setError(null);
    const res = await updateStaffRoles({ userId: rolesOpen.id, roleIds: selectedRoleIds });
    setBusy(false);
    if (!res.ok) setError(res.error);
    else {
      setRolesOpen(null);
      router.refresh();
    }
  }

  async function toggleSuspend(s: StaffRow) {
    if (!window.confirm(s.status === 'SUSPENDED' ? 'فعال‌سازی این کارمند؟' : 'مسدودسازی این کارمند؟')) return;
    await setStaffStatus({ userId: s.id, status: s.status === 'SUSPENDED' ? 'ACTIVE' : 'SUSPENDED' });
    router.refresh();
  }

  async function reset2fa(s: StaffRow) {
    if (!window.confirm('احراز هویت دومرحله‌ای این کارمند بازنشانی شود؟')) return;
    await resetStaffTwoFactor({ userId: s.id });
    router.refresh();
  }

  return (
    <div>
      <div className="mb-3 flex justify-end">
        <Button size="sm" onClick={openInvite}>
          <Plus className="size-4" aria-hidden />
          دعوت کارمند
        </Button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border-base bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border-base bg-surface-muted text-xs text-fg-muted">
              <th className="p-3 text-start font-medium">نام</th>
              <th className="p-3 text-start font-medium">ایمیل</th>
              <th className="p-3 text-start font-medium">نقش‌ها</th>
              <th className="p-3 text-center font-medium">۲مرحله‌ای</th>
              <th className="p-3 text-center font-medium">وضعیت</th>
              <th className="p-3 text-end font-medium">عملیات</th>
            </tr>
          </thead>
          <tbody>
            {staff.map((s) => (
              <tr key={s.id} className="border-b border-border-base last:border-0">
                <td className="p-3 font-medium text-fg">{staffName(s)}</td>
                <td className="p-3 text-xs text-fg-muted" dir="ltr">{s.email ?? '—'}</td>
                <td className="p-3">
                  <div className="flex flex-wrap gap-1">
                    {roles.filter((r) => s.roleIds.includes(r.id)).map((r) => <Badge key={r.id} size="sm" tone="primary">{r.nameFa}</Badge>)}
                    {s.roleIds.length === 0 && <span className="text-xs text-fg-faint">بدون نقش</span>}
                  </div>
                </td>
                <td className="p-3 text-center text-xs">{s.twoFactorEnabled ? 'فعال' : 'غیرفعال'}</td>
                <td className="p-3 text-center"><StatusPill status={s.status} /></td>
                <td className="p-3">
                  <div className="flex flex-wrap justify-end gap-1.5">
                    <Link href={`/admin/staff/${s.id}`} className="inline-flex h-7 items-center gap-1 rounded-lg px-2 text-xs text-fg-muted hover:bg-surface-muted">
                      <Activity className="size-3.5" aria-hidden />
                      فعالیت
                    </Link>
                    <Button size="xs" variant="ghost" onClick={() => openRoles(s)}>نقش‌ها</Button>
                    {s.twoFactorEnabled && (
                      <Button size="xs" variant="ghost" onClick={() => reset2fa(s)}>بازنشانی ۲FA</Button>
                    )}
                    <Button size="xs" variant="ghost" onClick={() => toggleSuspend(s)}>
                      <ShieldOff className="size-3.5" aria-hidden />
                      {s.status === 'SUSPENDED' ? 'فعال‌سازی' : 'مسدودسازی'}
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {staff.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-sm text-fg-muted">کارمندی ثبت نشده است.</td></tr>}
          </tbody>
        </table>
      </div>

      <Modal open={inviteOpen} onClose={() => setInviteOpen(false)} title="دعوت کارمند جدید">
        {tempPassword ? (
          <div className="space-y-3">
            <p className="text-sm text-fg">حساب کارمند ایجاد شد. رمز عبور موقت زیر را به‌صورت امن در اختیار او قرار دهید (فقط یک‌بار نمایش داده می‌شود):</p>
            <p className="rounded-lg bg-surface-muted p-3 text-center font-mono text-lg tnum" dir="ltr">{tempPassword}</p>
            <div className="flex justify-end">
              <Button size="sm" onClick={() => setInviteOpen(false)}>بستن</Button>
            </div>
          </div>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="نام" required>
                <Input value={form.firstName} onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))} />
              </Field>
              <Field label="نام خانوادگی" required>
                <Input value={form.lastName} onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))} />
              </Field>
              <Field label="ایمیل" required className="sm:col-span-2">
                <Input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} dir="ltr" />
              </Field>
              <Field label="موبایل (اختیاری)" className="sm:col-span-2">
                <Input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} dir="ltr" />
              </Field>
            </div>
            <p className="mb-1.5 mt-3 text-sm font-medium text-fg">نقش‌ها</p>
            <div className="flex flex-wrap gap-3">
              {roles.map((r) => (
                <Checkbox
                  key={r.id}
                  checked={form.roleIds.includes(r.id)}
                  onChange={(e) => setForm((f) => ({ ...f, roleIds: e.target.checked ? [...f.roleIds, r.id] : f.roleIds.filter((id) => id !== r.id) }))}
                  label={r.nameFa}
                />
              ))}
            </div>
            {error && <p className="mt-2 text-xs text-danger">{error}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setInviteOpen(false)}>انصراف</Button>
              <Button size="sm" loading={busy} disabled={!form.email || !form.firstName || !form.lastName || form.roleIds.length === 0} onClick={submitInvite}>
                ایجاد و دعوت
              </Button>
            </div>
          </>
        )}
      </Modal>

      <Modal open={!!rolesOpen} onClose={() => setRolesOpen(null)} title={rolesOpen ? `نقش‌های ${staffName(rolesOpen)}` : ''}>
        <div className="flex flex-wrap gap-3">
          {roles.map((r) => (
            <Checkbox
              key={r.id}
              checked={selectedRoleIds.includes(r.id)}
              onChange={(e) => setSelectedRoleIds((prev) => (e.target.checked ? [...prev, r.id] : prev.filter((id) => id !== r.id)))}
              label={r.nameFa}
            />
          ))}
        </div>
        {error && <p className="mt-2 text-xs text-danger">{error}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => setRolesOpen(null)}>انصراف</Button>
          <Button size="sm" loading={busy} onClick={submitRoles}>ذخیره نقش‌ها</Button>
        </div>
      </Modal>
    </div>
  );
}

function RolesMatrix({ roles, permGroups }: { roles: RoleRow[]; permGroups: PermGroup[] }) {
  const router = useRouter();
  const [busyCell, setBusyCell] = React.useState<string | null>(null);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [name, setName] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function toggle(role: RoleRow, key: string, enabled: boolean) {
    if (role.isSystem) return;
    const cellKey = `${role.id}:${key}`;
    setBusyCell(cellKey);
    await toggleRolePermission({ roleId: role.id, permission: key, enabled });
    setBusyCell(null);
    router.refresh();
  }

  async function submitCreate() {
    setBusy(true);
    setError(null);
    const res = await createRole({ nameFa: name });
    setBusy(false);
    if (!res.ok) setError(res.error);
    else {
      setCreateOpen(false);
      setName('');
      router.refresh();
    }
  }

  return (
    <div>
      <div className="mb-3 flex justify-end">
        <Button size="sm" variant="secondary" onClick={() => setCreateOpen(true)}>
          <Plus className="size-4" aria-hidden />
          نقش جدید
        </Button>
      </div>
      <div className="overflow-x-auto rounded-xl border border-border-base bg-surface">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border-base bg-surface-muted">
              <th className="sticky start-0 z-10 bg-surface-muted p-3 text-start font-medium">دسترسی</th>
              {roles.map((r) => (
                <th key={r.id} className="min-w-[7rem] p-3 text-center font-medium">
                  {r.nameFa}
                  {r.isSystem && <span className="mt-0.5 block text-[10px] font-normal text-fg-faint">سیستمی</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {permGroups.map((g) => (
              <React.Fragment key={g.group}>
                <tr className="bg-surface-muted/60">
                  <td colSpan={roles.length + 1} className="px-3 py-1.5 font-semibold text-fg-muted">{g.group}</td>
                </tr>
                {g.items.map((item) => (
                  <tr key={item.key} className="border-b border-border-base last:border-0">
                    <td className="sticky start-0 z-10 bg-surface p-3">{item.nameFa}</td>
                    {roles.map((r) => {
                      const enabled = r.permissionKeys.includes(item.key);
                      const cellKey = `${r.id}:${item.key}`;
                      return (
                        <td key={r.id} className="p-3 text-center">
                          <Checkbox
                            checked={enabled}
                            disabled={r.isSystem || busyCell === cellKey}
                            onChange={(e) => toggle(r, item.key, e.target.checked)}
                            aria-label={`${item.nameFa} — ${r.nameFa}`}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="نقش جدید">
        <Field label="نام نقش" required>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        {error && <p className="mt-2 text-xs text-danger">{error}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => setCreateOpen(false)}>انصراف</Button>
          <Button size="sm" loading={busy} disabled={name.trim().length < 2} onClick={submitCreate}>ایجاد نقش</Button>
        </div>
      </Modal>
    </div>
  );
}

