'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { db } from '@/server/db';
import { assertPermission } from '@/server/auth/guard';
import { audit } from '@/server/audit';
import { hashPassword, randomToken } from '@/lib/crypto';
import { emailSchema, optionalMobileSchema } from '@/lib/schemas';
import { ALL_PERMISSIONS, PERMISSIONS, type PermissionKey } from '@/lib/permissions';
import type { ActionResult } from '@/app/admin/orders/_lib';

function fail(error: string): ActionResult {
  return { ok: false, error };
}
function ok(message?: string): ActionResult {
  return { ok: true, message };
}

/** Ensures every key in the permission catalog has a matching `Permission` row — self-heals a seed that predates a newly added key. */
async function ensurePermissionCatalog(): Promise<void> {
  const existing = await db.permission.findMany({ select: { key: true } });
  const have = new Set(existing.map((p) => p.key));
  const missing = ALL_PERMISSIONS.filter((k) => !have.has(k));
  if (missing.length === 0) return;
  await db.permission.createMany({
    data: missing.map((key) => ({ key, group: PERMISSIONS[key].group, nameFa: PERMISSIONS[key].nameFa })),
    skipDuplicates: true,
  });
}

const inviteSchema = z.object({
  email: emailSchema,
  phone: optionalMobileSchema,
  firstName: z.string().min(1, 'نام الزامی است.').max(80),
  lastName: z.string().min(1, 'نام خانوادگی الزامی است.').max(80),
  roleIds: z.array(z.string()).min(1, 'حداقل یک نقش را انتخاب کنید.'),
});

export async function inviteStaffMember(input: z.infer<typeof inviteSchema>): Promise<ActionResult<{ tempPassword: string }>> {
  const parsed = inviteSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'ورودی نامعتبر است.');
  const staff = await assertPermission('staff.manage');
  const d = parsed.data;

  const existing = await db.user.findUnique({ where: { email: d.email } });
  if (existing) return fail('کاربری با این ایمیل قبلاً ثبت شده است.');

  const tempPassword = randomToken(9).replace(/[^A-Za-z0-9]/g, '').slice(0, 12) || randomToken(9);
  const passwordHash = await hashPassword(tempPassword);

  const created = await db.user.create({
    data: {
      email: d.email, phone: d.phone || null, firstName: d.firstName, lastName: d.lastName,
      isStaff: true, status: 'ACTIVE', passwordHash, emailVerifiedAt: new Date(),
      roles: { create: d.roleIds.map((roleId) => ({ roleId })) },
    },
  });

  await audit({ action: 'staff.invite', entity: 'User', entityId: created.id, actorId: staff.id, actorType: 'STAFF', summary: `دعوت کارمند جدید: ${d.email}` });
  revalidatePath('/admin/staff');
  return { ok: true, data: { tempPassword }, message: 'کارمند جدید ایجاد شد.' };
}

const rolesSchema = z.object({ userId: z.string().min(1), roleIds: z.array(z.string()) });

export async function updateStaffRoles(input: z.infer<typeof rolesSchema>): Promise<ActionResult> {
  const parsed = rolesSchema.safeParse(input);
  if (!parsed.success) return fail('ورودی نامعتبر است.');
  const staff = await assertPermission('staff.manage');

  await db.$transaction([
    db.userRole.deleteMany({ where: { userId: parsed.data.userId } }),
    db.userRole.createMany({ data: parsed.data.roleIds.map((roleId) => ({ userId: parsed.data.userId, roleId })), skipDuplicates: true }),
  ]);
  await audit({ action: 'staff.roles.update', entity: 'User', entityId: parsed.data.userId, actorId: staff.id, actorType: 'STAFF', after: { roleIds: parsed.data.roleIds } });
  revalidatePath('/admin/staff');
  return ok('نقش‌های کارمند به‌روزرسانی شد.');
}

const statusSchema = z.object({ userId: z.string().min(1), status: z.enum(['ACTIVE', 'SUSPENDED']) });

export async function setStaffStatus(input: z.infer<typeof statusSchema>): Promise<ActionResult> {
  const parsed = statusSchema.safeParse(input);
  if (!parsed.success) return fail('ورودی نامعتبر است.');
  const staff = await assertPermission('staff.manage');
  if (parsed.data.userId === staff.id && parsed.data.status === 'SUSPENDED') return fail('نمی‌توانید حساب خودتان را مسدود کنید.');

  await db.user.update({ where: { id: parsed.data.userId }, data: { status: parsed.data.status } });
  if (parsed.data.status === 'SUSPENDED') {
    await db.session.updateMany({ where: { userId: parsed.data.userId, revokedAt: null }, data: { revokedAt: new Date() } });
  }
  await audit({ action: parsed.data.status === 'SUSPENDED' ? 'staff.suspend' : 'staff.activate', entity: 'User', entityId: parsed.data.userId, actorId: staff.id, actorType: 'STAFF' });
  revalidatePath('/admin/staff');
  return ok(parsed.data.status === 'SUSPENDED' ? 'حساب کارمند مسدود شد.' : 'حساب کارمند فعال شد.');
}

const idSchema = z.object({ userId: z.string().min(1) });

export async function resetStaffTwoFactor(input: z.infer<typeof idSchema>): Promise<ActionResult> {
  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return fail('ورودی نامعتبر است.');
  const staff = await assertPermission('staff.manage');

  await db.user.update({ where: { id: parsed.data.userId }, data: { twoFactorEnabled: false, twoFactorSecret: null, twoFactorBackup: null } });
  await db.session.updateMany({ where: { userId: parsed.data.userId, revokedAt: null }, data: { twoFactorOk: false } });
  await audit({ action: 'staff.2fa.reset', entity: 'User', entityId: parsed.data.userId, actorId: staff.id, actorType: 'STAFF', summary: 'بازنشانی احراز هویت دومرحله‌ای — کارمند باید دوباره پیکربندی کند.' });
  revalidatePath('/admin/staff');
  return ok('احراز هویت دومرحله‌ای بازنشانی شد؛ کارمند باید در ورود بعدی دوباره آن را فعال کند.');
}

const roleCreateSchema = z.object({ nameFa: z.string().min(2, 'نام نقش الزامی است.').max(80), description: z.string().max(300).optional() });

export async function createRole(input: z.infer<typeof roleCreateSchema>): Promise<ActionResult> {
  const parsed = roleCreateSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'ورودی نامعتبر است.');
  const staff = await assertPermission('staff.manage');

  const slug = parsed.data.nameFa.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9؀-ۿ-]/g, '') || `role-${Date.now()}`;
  const created = await db.role.create({ data: { slug: `${slug}-${Date.now().toString(36)}`, nameFa: parsed.data.nameFa, description: parsed.data.description || null } });
  await audit({ action: 'role.create', entity: 'Role', entityId: created.id, actorId: staff.id, actorType: 'STAFF', after: { nameFa: parsed.data.nameFa } });
  revalidatePath('/admin/staff');
  return ok('نقش جدید ایجاد شد.');
}

const permissionToggleSchema = z.object({ roleId: z.string().min(1), permission: z.string().min(1), enabled: z.boolean() });

export async function toggleRolePermission(input: z.infer<typeof permissionToggleSchema>): Promise<ActionResult> {
  const parsed = permissionToggleSchema.safeParse(input);
  if (!parsed.success) return fail('ورودی نامعتبر است.');
  const staff = await assertPermission('staff.manage');

  const role = await db.role.findUnique({ where: { id: parsed.data.roleId } });
  if (!role) return fail('نقش یافت نشد.');
  if (role.isSystem) return fail('نقش‌های سیستمی قابل ویرایش نیستند.');
  if (!(parsed.data.permission in PERMISSIONS)) return fail('دسترسی نامعتبر است.');

  await ensurePermissionCatalog();
  const permission = await db.permission.findUniqueOrThrow({ where: { key: parsed.data.permission as PermissionKey } });

  if (parsed.data.enabled) {
    await db.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
      create: { roleId: role.id, permissionId: permission.id },
      update: {},
    });
  } else {
    await db.rolePermission.deleteMany({ where: { roleId: role.id, permissionId: permission.id } });
  }
  await audit({ action: 'role.permission.toggle', entity: 'Role', entityId: role.id, actorId: staff.id, actorType: 'STAFF', summary: `${parsed.data.permission}: ${parsed.data.enabled ? 'فعال' : 'غیرفعال'}` });
  revalidatePath('/admin/staff');
  return ok();
}
