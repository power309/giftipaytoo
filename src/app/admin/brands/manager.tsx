'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import * as Icons from 'lucide-react';
import { Button, Field, Input, Textarea, Switch, Modal, Select, Badge, EmptyState } from '@/components/ui';
import { ImageUploader } from '@/components/admin/product-form/image-uploader';
import { saveBrand, deleteBrand, toggleBrandActive } from './actions';

export type BrandRow = {
  id: string;
  slug: string;
  nameFa: string;
  nameEn: string | null;
  descriptionFa: string | null;
  logoKey: string | null;
  bannerKey: string | null;
  accentColor: string | null;
  isActive: boolean;
  isFeatured: boolean;
  seoTitle: string | null;
  seoDescription: string | null;
  productCount: number;
};

const emptyForm = {
  id: undefined as string | undefined,
  nameFa: '',
  nameEn: '',
  descriptionFa: '',
  logoKey: null as string | null,
  bannerKey: null as string | null,
  accentColor: '#2563eb',
  isActive: true,
  isFeatured: false,
  seoTitle: '',
  seoDescription: '',
};

export function BrandManager({ initialBrands }: { initialBrands: BrandRow[] }) {
  const router = useRouter();
  const [brands, setBrands] = React.useState(initialBrands);
  const [formOpen, setFormOpen] = React.useState(false);
  const [form, setForm] = React.useState(emptyForm);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [deleteTarget, setDeleteTarget] = React.useState<BrandRow | null>(null);

  React.useEffect(() => setBrands(initialBrands), [initialBrands]);

  function openCreate() {
    setForm(emptyForm);
    setError(null);
    setFormOpen(true);
  }
  function openEdit(b: BrandRow) {
    setForm({
      id: b.id,
      nameFa: b.nameFa,
      nameEn: b.nameEn ?? '',
      descriptionFa: b.descriptionFa ?? '',
      logoKey: b.logoKey,
      bannerKey: b.bannerKey,
      accentColor: b.accentColor ?? '#2563eb',
      isActive: b.isActive,
      isFeatured: b.isFeatured,
      seoTitle: b.seoTitle ?? '',
      seoDescription: b.seoDescription ?? '',
    });
    setError(null);
    setFormOpen(true);
  }

  async function submit() {
    if (!form.nameFa.trim() || !form.nameEn.trim()) {
      setError('نام فارسی و انگلیسی الزامی است.');
      return;
    }
    setBusy(true);
    setError(null);
    const res = await saveBrand({
      id: form.id,
      nameFa: form.nameFa.trim(),
      nameEn: form.nameEn.trim(),
      descriptionFa: form.descriptionFa.trim() || null,
      logoKey: form.logoKey,
      bannerKey: form.bannerKey,
      accentColor: form.accentColor,
      isActive: form.isActive,
      isFeatured: form.isFeatured,
      seoTitle: form.seoTitle.trim() || null,
      seoDescription: form.seoDescription.trim() || null,
    });
    setBusy(false);
    if (res.ok) {
      setFormOpen(false);
      router.refresh();
    } else setError(res.error);
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button type="button" size="sm" onClick={openCreate}>
          <Icons.Plus className="size-4" aria-hidden />
          برند جدید
        </Button>
      </div>

      {brands.length === 0 ? (
        <EmptyState icon={<Icons.Tag className="size-7" aria-hidden />} title="برندی ثبت نشده" action={<Button size="sm" onClick={openCreate}>افزودن برند</Button>} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {brands.map((b) => (
            <div key={b.id} className="card overflow-hidden p-0">
              <div className="flex items-center gap-3 border-b border-border-base p-4">
                <div
                  className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-xl border border-border-base"
                  style={{ backgroundColor: b.accentColor ?? undefined }}
                >
                  {b.logoKey ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={b.logoKey} alt="" className="size-full object-cover" />
                  ) : (
                    <Icons.Tag className="size-5 text-white/90" aria-hidden />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-fg">{b.nameFa}</p>
                  <p className="truncate text-xs text-fg-faint" dir="ltr">{b.nameEn}</p>
                </div>
              </div>
              <div className="space-y-2.5 p-4">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge tone={b.isActive ? 'success' : 'neutral'} size="sm">{b.isActive ? 'فعال' : 'غیرفعال'}</Badge>
                  {b.isFeatured && <Badge tone="gold" size="sm">ویژه</Badge>}
                  <Badge tone="primary" size="sm">{b.productCount.toLocaleString('fa-IR')} محصول</Badge>
                </div>
                <div className="flex items-center gap-2 pt-1.5">
                  <Button type="button" size="xs" variant="secondary" onClick={() => openEdit(b)}>
                    <Icons.Pencil className="size-3.5" aria-hidden /> ویرایش
                  </Button>
                  <Switch
                    checked={b.isActive}
                    onChange={async (v) => {
                      const res = await toggleBrandActive(b.id, v);
                      if (res.ok) router.refresh();
                    }}
                    label="فعال"
                    id={`brand-active-${b.id}`}
                  />
                  <Button type="button" size="xs" variant="danger" className="ms-auto" onClick={() => setDeleteTarget(b)}>
                    <Icons.Trash2 className="size-3.5" aria-hidden />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={form.id ? 'ویرایش برند' : 'برند جدید'}
        size="lg"
        footer={
          <>
            <Button type="button" variant="ghost" onClick={() => setFormOpen(false)}>
              انصراف
            </Button>
            <Button type="button" loading={busy} onClick={submit}>
              ذخیره
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger" role="alert">{error}</p>}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="نام فارسی" htmlFor="brand-fa" required>
              <Input id="brand-fa" value={form.nameFa} onChange={(e) => setForm((f) => ({ ...f, nameFa: e.target.value }))} />
            </Field>
            <Field label="نام انگلیسی" htmlFor="brand-en" required>
              <Input id="brand-en" value={form.nameEn} onChange={(e) => setForm((f) => ({ ...f, nameEn: e.target.value }))} dir="ltr" />
            </Field>
          </div>
          <Field label="توضیحات" htmlFor="brand-desc">
            <Textarea id="brand-desc" rows={3} value={form.descriptionFa} onChange={(e) => setForm((f) => ({ ...f, descriptionFa: e.target.value }))} />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <p className="text-xs font-medium text-fg-muted">لوگو</p>
              {form.logoKey ? (
                <div className="flex items-center gap-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={form.logoKey} alt="" className="size-14 rounded-lg border border-border-base object-cover" />
                  <Button type="button" size="xs" variant="ghost" onClick={() => setForm((f) => ({ ...f, logoKey: null }))}>حذف</Button>
                </div>
              ) : (
                <ImageUploader folder="brands" label="بارگذاری لوگو" onUploaded={(r) => setForm((f) => ({ ...f, logoKey: r.path }))} compact />
              )}
            </div>
            <div className="space-y-2">
              <p className="text-xs font-medium text-fg-muted">بنر</p>
              {form.bannerKey ? (
                <div className="flex items-center gap-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={form.bannerKey} alt="" className="h-14 w-24 rounded-lg border border-border-base object-cover" />
                  <Button type="button" size="xs" variant="ghost" onClick={() => setForm((f) => ({ ...f, bannerKey: null }))}>حذف</Button>
                </div>
              ) : (
                <ImageUploader folder="banners" label="بارگذاری بنر" onUploaded={(r) => setForm((f) => ({ ...f, bannerKey: r.path }))} compact />
              )}
            </div>
          </div>

          <Field label="رنگ اختصاصی برند" htmlFor="brand-color" hint="برای پوسترهای تولیدشده و برجسته‌سازی برند استفاده می‌شود.">
            <div className="flex items-center gap-2">
              <input
                id="brand-color"
                type="color"
                value={/^#[0-9a-fA-F]{6}$/.test(form.accentColor) ? form.accentColor : '#2563eb'}
                onChange={(e) => setForm((f) => ({ ...f, accentColor: e.target.value }))}
                className="size-11 cursor-pointer rounded-lg border border-border-base bg-surface p-1"
              />
              <Input
                value={form.accentColor}
                onChange={(e) => setForm((f) => ({ ...f, accentColor: e.target.value }))}
                dir="ltr"
                className="max-w-[9rem]"
                placeholder="#2563eb"
              />
            </div>
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="عنوان سئو" htmlFor="brand-seo-title">
              <Input id="brand-seo-title" value={form.seoTitle} onChange={(e) => setForm((f) => ({ ...f, seoTitle: e.target.value }))} maxLength={200} />
            </Field>
            <Field label="توضیح سئو" htmlFor="brand-seo-desc">
              <Input id="brand-seo-desc" value={form.seoDescription} onChange={(e) => setForm((f) => ({ ...f, seoDescription: e.target.value }))} maxLength={400} />
            </Field>
          </div>

          <div className="flex flex-wrap gap-6">
            <Switch checked={form.isActive} onChange={(v) => setForm((f) => ({ ...f, isActive: v }))} label="فعال" id="brand-active" />
            <Switch checked={form.isFeatured} onChange={(v) => setForm((f) => ({ ...f, isFeatured: v }))} label="برند ویژه" id="brand-featured" />
          </div>
        </div>
      </Modal>

      <DeleteBrandModal
        target={deleteTarget}
        allBrands={brands}
        onClose={() => setDeleteTarget(null)}
        onDeleted={() => {
          setDeleteTarget(null);
          router.refresh();
        }}
      />
    </div>
  );
}

function DeleteBrandModal({
  target,
  allBrands,
  onClose,
  onDeleted,
}: {
  target: BrandRow | null;
  allBrands: BrandRow[];
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [reassignTo, setReassignTo] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setReassignTo('');
    setError(null);
  }, [target]);

  if (!target) return null;
  const hasProducts = target.productCount > 0;
  const others = allBrands.filter((b) => b.id !== target.id);

  return (
    <Modal
      open={!!target}
      onClose={onClose}
      title={`حذف برند «${target.nameFa}»`}
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose}>انصراف</Button>
          <Button
            type="button"
            variant="danger"
            loading={busy}
            disabled={hasProducts && !reassignTo}
            onClick={async () => {
              setBusy(true);
              const res = await deleteBrand({ id: target.id, reassignToId: reassignTo || null });
              setBusy(false);
              if (res.ok) onDeleted();
              else setError(res.error);
            }}
          >
            حذف قطعی
          </Button>
        </>
      }
    >
      {error && <p className="mb-3 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger" role="alert">{error}</p>}
      {hasProducts ? (
        <div className="space-y-3">
          <p className="text-sm text-fg">
            این برند دارای <strong className="tnum">{target.productCount.toLocaleString('fa-IR')}</strong> محصول
            است. برای حذف، یک برند جایگزین برای انتقال محصولات انتخاب کنید.
          </p>
          <Field label="انتقال محصولات به" htmlFor="brand-reassign">
            <Select id="brand-reassign" value={reassignTo} onChange={(e) => setReassignTo(e.target.value)}>
              <option value="">— انتخاب کنید —</option>
              {others.map((o) => (
                <option key={o.id} value={o.id}>{o.nameFa}</option>
              ))}
            </Select>
          </Field>
        </div>
      ) : (
        <p className="text-sm text-fg">آیا از حذف این برند مطمئن هستید؟ این عملیات قابل بازگشت نیست.</p>
      )}
    </Modal>
  );
}
