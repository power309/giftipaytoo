import { requirePermission } from '@/server/auth/guard';
import { db } from '@/server/db';
import { PageHeader } from '@/components/admin/kit';
import { SupplierManager, type SupplierRow } from './manager';

export const metadata = { title: 'تأمین‌کنندگان' };
export const dynamic = 'force-dynamic';

export default async function SuppliersPage() {
  await requirePermission('supplier.manage');

  const suppliers = await db.supplier.findMany({
    orderBy: { nameFa: 'asc' },
    select: {
      id: true,
      nameFa: true,
      adapterKey: true,
      apiBaseUrl: true,
      credentialsEncrypted: true,
      isActive: true,
      autoFulfill: true,
      reliabilityScore: true,
      notesFa: true,
      _count: { select: { variants: true, inventory: true } },
    },
  });

  const rows: SupplierRow[] = suppliers.map((s) => ({
    id: s.id,
    nameFa: s.nameFa,
    adapterKey: s.adapterKey,
    apiBaseUrl: s.apiBaseUrl,
    hasCredentials: !!s.credentialsEncrypted,
    isActive: s.isActive,
    autoFulfill: s.autoFulfill,
    reliabilityScore: s.reliabilityScore,
    notesFa: s.notesFa,
    variantCount: s._count.variants,
    inventoryCount: s._count.inventory,
  }));

  return (
    <div className="space-y-6">
      <PageHeader title="تأمین‌کنندگان" description="مدیریت تأمین‌کنندگان کد، اتصال API و تحویل خودکار." />
      <SupplierManager initialSuppliers={rows} />
    </div>
  );
}
