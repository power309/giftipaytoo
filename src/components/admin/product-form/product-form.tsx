'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Info } from 'lucide-react';
import { FormTabs, SaveBar } from '@/components/admin/kit';
import { Button, Alert } from '@/components/ui';
import {
  productFormSchema,
  tabForPath,
  PRODUCT_TABS,
  type ProductFormValue,
  type ProductFormRefData,
  type ProductTabKey,
} from './types';
import { BasicInfoTab } from './tabs/basic-info-tab';
import { DescriptionsTab } from './tabs/descriptions-tab';
import { VariantsTab } from './tabs/variants-tab';
import { MediaTab } from './tabs/media-tab';
import { SeoTab } from './tabs/seo-tab';
import { SettingsTab } from './tabs/settings-tab';
import { useLocalAutosave, useBeforeUnloadGuard, useInAppNavigationGuard, readLocalDraft, clearLocalDraft } from './autosave';
import { saveProduct, saveProductDraft } from '@/app/admin/products/actions';

function validate(value: ProductFormValue): { errors: Record<string, string>; errorsByTab: Record<ProductTabKey, number> } {
  const result = productFormSchema.safeParse(value);
  const errors: Record<string, string> = {};
  const errorsByTab: Record<ProductTabKey, number> = { basic: 0, descriptions: 0, variants: 0, media: 0, seo: 0, settings: 0 };
  if (!result.success) {
    for (const issue of result.error.issues) {
      const key = issue.path.join('.');
      if (!errors[key]) errors[key] = issue.message;
      const tab = tabForPath(issue.path);
      errorsByTab[tab] += 1;
    }
  }
  return { errors, errorsByTab };
}

export function ProductForm({
  mode,
  initialValue,
  refData,
}: {
  mode: 'create' | 'edit';
  initialValue: ProductFormValue;
  refData: ProductFormRefData;
}) {
  const router = useRouter();
  const [value, setValue] = React.useState(initialValue);
  const [savedSnapshot, setSavedSnapshot] = React.useState(JSON.stringify(initialValue));
  const [activeTab, setActiveTab] = React.useState<ProductTabKey>('basic');
  const [saving, setSaving] = React.useState<'full' | 'draft' | null>(null);
  const [serverError, setServerError] = React.useState<string | null>(null);
  const [draftBanner, setDraftBanner] = React.useState(false);

  const dirty = JSON.stringify(value) !== savedSnapshot;
  const autosaveAt = useLocalAutosave(value.id, value, dirty);
  useBeforeUnloadGuard(dirty);
  useInAppNavigationGuard(dirty);

  React.useEffect(() => {
    const local = readLocalDraft(initialValue.id);
    if (local && JSON.stringify(local) !== JSON.stringify(initialValue)) setDraftBanner(true);
    // Only check once on mount for this product id.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function patch(p: Partial<ProductFormValue>) {
    setServerError(null);
    setValue((v) => ({ ...v, ...p }));
  }

  const { errors, errorsByTab } = React.useMemo(() => validate(value), [value]);
  const errorsByTabDisplay = Object.fromEntries(PRODUCT_TABS.map((t) => [t.key, errorsByTab[t.key]]));

  async function doSave(after: 'stay' | 'list') {
    setSaving('full');
    setServerError(null);
    const res = await saveProduct(value, {});
    setSaving(null);
    if (!res.ok) {
      setServerError(res.error);
      return;
    }
    clearLocalDraft(value.id);
    if (mode === 'create' && res.data) {
      setSavedSnapshot(JSON.stringify({ ...value, id: res.data.id }));
      router.push(after === 'list' ? '/admin/products' : `/admin/products/${res.data.id}`);
      return;
    }
    setSavedSnapshot(JSON.stringify(value));
    if (after === 'list') router.push('/admin/products');
    else router.refresh();
  }

  async function doSaveDraft() {
    setSaving('draft');
    setServerError(null);
    const res = await saveProductDraft({ id: value.id, payload: value });
    setSaving(null);
    if (!res.ok) {
      setServerError(res.error);
      return;
    }
    clearLocalDraft(value.id);
    if (mode === 'create' && res.data) {
      router.push(`/admin/products/${res.data.id}`);
      return;
    }
    setSavedSnapshot(JSON.stringify(value));
    router.refresh();
  }

  const hasBlockingErrors = Object.keys(errors).length > 0;

  return (
    <div className="space-y-4">
      {draftBanner && (
        <Alert tone="warn" title="پیش‌نویس ذخیره‌نشده در این مرورگر">
          <div className="flex flex-wrap items-center gap-2">
            <span>نسخه‌ای متفاوت از این فرم به‌صورت خودکار در این مرورگر ذخیره شده بود.</span>
            <Button
              type="button"
              size="xs"
              variant="secondary"
              onClick={() => {
                const local = readLocalDraft(initialValue.id);
                if (local) setValue(local);
                setDraftBanner(false);
              }}
            >
              بازیابی پیش‌نویس محلی
            </Button>
            <Button type="button" size="xs" variant="ghost" onClick={() => setDraftBanner(false)}>
              نادیده گرفتن
            </Button>
          </div>
        </Alert>
      )}

      {serverError && (
        <Alert tone="danger" title="ذخیره ناموفق بود">
          {serverError}
        </Alert>
      )}

      <div className="card p-0">
        <div className="px-4 pt-3 sm:px-6">
          <FormTabs tabs={PRODUCT_TABS as unknown as { key: string; label: string }[]} active={activeTab} onChange={(k) => setActiveTab(k as ProductTabKey)} errorsByTab={errorsByTabDisplay} />
        </div>
        <div className="p-4 sm:p-6">
          {activeTab === 'basic' && <BasicInfoTab value={value} onChange={patch} errors={errors} refData={refData} productId={value.id} />}
          {activeTab === 'descriptions' && <DescriptionsTab value={value} onChange={patch} errors={errors} />}
          {activeTab === 'variants' && <VariantsTab value={value} onChange={patch} errors={errors} refData={refData} baseSku={value.sku} />}
          {activeTab === 'media' && <MediaTab value={value} onChange={patch} productName={value.nameFa} />}
          {activeTab === 'seo' && <SeoTab value={value} onChange={patch} />}
          {activeTab === 'settings' && <SettingsTab value={value} onChange={patch} errors={errors} refData={refData} productId={value.id} />}
        </div>
      </div>

      {hasBlockingErrors && (
        <p className="flex items-center gap-1.5 text-xs text-warn">
          <Info className="size-3.5" aria-hidden />
          برای ذخیره نهایی، خطاهای فرم را در تب‌های علامت‌خورده برطرف کنید — «ذخیره پیش‌نویس» بدون اعتبارسنجی کامل کار می‌کند.
        </p>
      )}

      <SaveBar
        dirty={dirty}
        saving={saving === 'full'}
        autosaveAt={autosaveAt}
        onSave={() => doSave('stay')}
        onDiscard={() => setValue(JSON.parse(savedSnapshot))}
        extra={
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="secondary" loading={saving === 'draft'} onClick={doSaveDraft}>
              ذخیره پیش‌نویس
            </Button>
            <Button type="button" size="sm" variant="outline" loading={saving === 'full'} disabled={hasBlockingErrors} onClick={() => doSave('list')}>
              ذخیره و بازگشت
            </Button>
          </div>
        }
      />
    </div>
  );
}
