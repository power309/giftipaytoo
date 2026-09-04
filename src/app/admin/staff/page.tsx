import { db } from '@/server/db';
import { requirePermission } from '@/server/auth/guard';
import { PageHeader } from '@/components/admin/kit';
import { PERMISSIONS, ALL_PERMISSIONS } from '@/lib/permissions';
import { StaffClient, type StaffRow, type RoleRow, type PermGroup } from './client';

export const metadata = { title: 'کارکنان و نقش‌ها' };

export default async function StaffPage() {
  await requirePermission('staff.manage');

  const [staffUsers, roles] = await Promise.all([
    db.user.findMany({
      where: { isStaff: true },
      orderBy: { createdAt: 'asc' },
      select: { id: true, firstName: true, lastName: true, email: true, phone: true, status: true, twoFactorEnabled: true, lastLoginAt: true, roles: { select: { roleId: true } } },
    }),
    db.role.findMany({ orderBy: { isSystem: 'desc' }, include: { permissions: { include: { permission: { select: { key: true } } } } } }),
  ]);

  const staffRows: StaffRow[] = staffUsers.map((u) => ({
    id: u.id, firstName: u.firstName, lastName: u.lastName, email: u.email, phone: u.phone,
    status: u.status, twoFactorEnabled: u.twoFactorEnabled, lastLoginAt: u.lastLoginAt, roleIds: u.roles.map((r) => r.roleId),
  }));

  const roleRows: RoleRow[] = roles.map((r) => ({
    id: r.id, nameFa: r.nameFa, isSystem: r.isSystem, permissionKeys: r.permissions.map((p) => p.permission.key),
  }));

  const groupOrder = Array.from(new Set(ALL_PERMISSIONS.map((k) => PERMISSIONS[k].group)));
  const permGroups: PermGroup[] = groupOrder.map((group) => ({
    group,
    items: ALL_PERMISSIONS.filter((k) => PERMISSIONS[k].group === group).map((k) => ({ key: k, nameFa: PERMISSIONS[k].nameFa })),
  }));

  return (
    <div>
      <PageHeader title="کارکنان و نقش‌ها" description="مدیریت دسترسی کارکنان پنل مدیریت" />
      <StaffClient staff={staffRows} roles={roleRows} permGroups={permGroups} />
    </div>
  );
}
