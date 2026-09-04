import { requirePermission } from '@/server/auth/guard';
import { PageHeader } from '@/components/admin/kit';
import { InventoryNav } from '../inventory-nav';
import { ReconcilePanel } from './panel';

export const metadata = { title: 'بازبینی موجودی' };
export const dynamic = 'force-dynamic';

export default async function ReconcilePage() {
  await requirePermission('inventory.view');

  return (
    <div className="space-y-6">
      <PageHeader title="بازبینی موجودی" description="بررسی ناسازگاری بین کدها، سفارش‌ها و تحویل‌ها." />
      <InventoryNav />
      <ReconcilePanel />
    </div>
  );
}
