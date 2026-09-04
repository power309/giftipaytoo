import Link from 'next/link';
import { Plus, Package } from 'lucide-react';
import { requirePermission } from '@/server/auth/guard';
import { db } from '@/server/db';
import { PageHeader, Money, StatusPill, DemoBadge } from '@/components/admin/kit';
import { Button, Badge } from '@/components/ui';
import { DataTable, type Column } from '@/components/admin/data-table';
import { listProducts, type ProductListRow } from './query';
import { runProductBulkAction } from './actions';

export const metadata = { title: 'محصولات' };
export const dynamic = 'force-dynamic';

const PRODUCT_TYPE_LABELS: Record<string, string> = {
  GIFT_CARD: 'گیفت‌کارت',
  SUBSCRIPTION: 'اشتراک',
  GAME_CURRENCY: 'ارز درون‌بازی',
  MOBILE_TOPUP: 'شارژ موبایل',
  SOFTWARE_LICENSE: 'لایسنس نرم‌افزار',
  ACCOUNT_TOPUP: 'شارژ اکانت',
  OTHER: 'سایر',
};
const DELIVERY_TYPE_LABELS: Record<string, string> = {
  INSTANT_CODE: 'کد آنی',
  MANUAL_CODE: 'کد دستی',
  ACCOUNT_TOPUP: 'شارژ اکانت',
  SUPPLIER_API: 'API تأمین‌کننده',
};

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePermission('product.view');
  const sp = await searchParams;
  const get = (k: string) => (Array.isArray(sp[k]) ? sp[k]?.[0] : sp[k]) ?? '';

  const page = Math.max(1, Number(get('page')) || 1);
  const perPage = [20, 50, 100].includes(Number(get('perPage'))) ? Number(get('perPage')) : 20;

  const [{ rows, total }, categories, brands, platforms] = await Promise.all([
    listProducts({
      q: get('q'),
      status: get('status'),
      categoryId: get('category'),
      brandId: get('brand'),
      platformId: get('platform'),
      productType: get('productType'),
      deliveryType: get('deliveryType'),
      stockState: (get('stockState') as 'in' | 'low' | 'out') || undefined,
      featured: (get('featured') as '1' | '0') || undefined,
      demo: (get('demo') as '1' | '0') || undefined,
      sort: get('sort') || 'date',
      dir: get('dir') === 'asc' ? 'asc' : 'desc',
      page,
      perPage,
    }),
    db.category.findMany({ orderBy: { nameFa: 'asc' }, select: { id: true, nameFa: true } }),
    db.brand.findMany({ orderBy: { nameFa: 'asc' }, select: { id: true, nameFa: true } }),
    db.platform.findMany({ orderBy: { nameFa: 'asc' }, select: { id: true, nameFa: true } }),
  ]);

  const columns: Column<ProductListRow>[] = [
    {
      key: 'poster',
      header: '',
      width: '48px',
      render: (r) =>
        r.posterPath ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={r.posterPath} alt="" className="size-10 rounded-lg border border-border-base object-cover" />
        ) : (
          <span className="grid size-10 place-items-center rounded-lg border border-dashed border-border-base text-fg-faint">
            <Package className="size-4" aria-hidden />
          </span>
        ),
    },
    {
      key: 'name',
      header: 'محصول',
      sortable: true,
      render: (r) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-fg">{r.nameFa}</p>
          <p className="truncate text-xs text-fg-faint" dir="ltr">{r.sku}</p>
          {r.isDemo && <DemoBadge />}
        </div>
      ),
    },
    { key: 'brand', header: 'برند', secondary: true, render: (r) => r.brandName },
    { key: 'category', header: 'دسته', secondary: true, render: (r) => r.categoryName },
    { key: 'status', header: 'وضعیت', render: (r) => <StatusPill status={r.status} /> },
    { key: 'variants', header: 'تنوع', align: 'center', secondary: true, render: (r) => r.variantCount.toLocaleString('fa-IR') },
    { key: 'price', header: 'کمترین قیمت', sortable: true, align: 'end', render: (r) => <Money value={r.lowestPrice} /> },
    {
      key: 'stock',
      header: 'موجودی',
      sortable: true,
      align: 'end',
      render: (r) => (
        <span className={r.availableStock === 0 ? 'text-danger' : r.availableStock <= 5 ? 'text-warn' : 'text-fg'}>
          {r.availableStock.toLocaleString('fa-IR')}
        </span>
      ),
    },
    { key: 'sales', header: 'فروش', sortable: true, align: 'end', secondary: true, render: (r) => r.salesCount.toLocaleString('fa-IR') },
    {
      key: 'date',
      header: 'به‌روزرسانی',
      sortable: true,
      secondary: true,
      render: (r) => new Date(r.updatedAt).toLocaleDateString('fa-IR'),
    },
    {
      key: 'featured',
      header: 'ویژه',
      align: 'center',
      secondary: true,
      render: (r) => (r.isFeatured ? <Badge tone="gold" size="sm">ویژه</Badge> : null),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="محصولات"
        description="مدیریت کاتالوگ محصولات، تنوع‌ها، قیمت و موجودی."
        actions={
          <>
            <Link href="/admin/import" className="inline-flex">
              <Button variant="secondary" size="sm" type="button">ورود گروهی</Button>
            </Link>
            <Link href="/admin/products/new" className="inline-flex">
              <Button size="sm" type="button">
                <Plus className="size-4" aria-hidden />
                محصول جدید
              </Button>
            </Link>
          </>
        }
      />

      <DataTable
        rows={rows}
        columns={columns}
        total={total}
        page={page}
        perPage={perPage}
        searchPlaceholder="جست‌وجوی نام، SKU یا نامک…"
        rowHref={(r) => `/admin/products/${r.id}`}
        exportHref={`/api/admin/catalog/products/export?${new URLSearchParams(
          Object.fromEntries(Object.entries(sp).filter(([, v]) => v !== undefined).map(([k, v]) => [k, Array.isArray(v) ? v[0] ?? '' : v ?? ''])),
        ).toString()}`}
        emptyTitle="محصولی یافت نشد"
        emptyDescription="فیلترها را تغییر دهید یا اولین محصول را ایجاد کنید."
        emptyAction={
          <Link href="/admin/products/new">
            <Button size="sm">محصول جدید</Button>
          </Link>
        }
        filters={[
          {
            key: 'status',
            label: 'وضعیت',
            options: [
              { value: 'DRAFT', label: 'پیش‌نویس' },
              { value: 'ACTIVE', label: 'فعال' },
              { value: 'INACTIVE', label: 'غیرفعال' },
              { value: 'SCHEDULED', label: 'زمان‌بندی‌شده' },
              { value: 'ARCHIVED', label: 'بایگانی' },
            ],
          },
          { key: 'category', label: 'دسته', options: categories.map((c) => ({ value: c.id, label: c.nameFa })) },
          { key: 'brand', label: 'برند', options: brands.map((b) => ({ value: b.id, label: b.nameFa })) },
          { key: 'platform', label: 'پلتفرم', options: platforms.map((p) => ({ value: p.id, label: p.nameFa })) },
          {
            key: 'productType',
            label: 'نوع محصول',
            options: Object.entries(PRODUCT_TYPE_LABELS).map(([value, label]) => ({ value, label })),
          },
          {
            key: 'deliveryType',
            label: 'نوع تحویل',
            options: Object.entries(DELIVERY_TYPE_LABELS).map(([value, label]) => ({ value, label })),
          },
          {
            key: 'stockState',
            label: 'وضعیت موجودی',
            options: [
              { value: 'in', label: 'موجود' },
              { value: 'low', label: 'رو به اتمام' },
              { value: 'out', label: 'ناموجود' },
            ],
          },
          { key: 'featured', label: 'ویژه', options: [{ value: '1', label: 'ویژه' }, { value: '0', label: 'عادی' }] },
          { key: 'demo', label: 'نمونه', options: [{ value: '1', label: 'داده نمونه' }, { value: '0', label: 'واقعی' }] },
        ]}
        bulkActions={[
          { key: 'activate', label: 'فعال‌سازی' },
          { key: 'deactivate', label: 'غیرفعال‌سازی' },
          { key: 'feature', label: 'ویژه کردن' },
          { key: 'unfeature', label: 'خارج از ویژه' },
          {
            key: 'set-category',
            label: 'تغییر دسته…',
            prompt: `شناسه دسته جدید را وارد کنید:\n${categories.map((c) => `${c.id} — ${c.nameFa}`).join('\n')}`,
          },
          {
            key: 'set-brand',
            label: 'تغییر برند…',
            prompt: `شناسه برند جدید را وارد کنید:\n${brands.map((b) => `${b.id} — ${b.nameFa}`).join('\n')}`,
          },
          { key: 'duplicate', label: 'تکثیر' },
          {
            key: 'archive',
            label: 'حذف (بایگانی)',
            tone: 'danger',
            confirm: 'محصولات انتخاب‌شده بایگانی می‌شوند. ادامه می‌دهید؟',
          },
        ]}
        onBulkAction={runProductBulkAction}
      />
    </div>
  );
}
