import { requirePermission } from '@/server/auth/guard';
import { PageHeader } from '@/components/admin/kit';
import { ProductForm } from '@/components/admin/product-form/product-form';
import { emptyProductForm } from '@/components/admin/product-form/types';
import { loadProductFormRefData } from '../ref-data';

export const metadata = { title: 'محصول جدید' };
export const dynamic = 'force-dynamic';

export default async function NewProductPage() {
  await requirePermission('product.create');
  const refData = await loadProductFormRefData();

  return (
    <div className="space-y-6">
      <PageHeader title="محصول جدید" description="اطلاعات محصول را در تب‌های زیر تکمیل کنید." />
      <ProductForm mode="create" initialValue={emptyProductForm()} refData={refData} />
    </div>
  );
}
