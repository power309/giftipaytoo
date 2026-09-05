'use client';

import * as React from 'react';
import * as Icons from 'lucide-react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  Button,
  Field,
  Input,
  Textarea,
  Select,
  Switch,
  Modal,
  Badge,
  EmptyState,
} from '@/components/ui';
import { Panel } from '@/components/admin/kit';
import { ImageUploader } from '@/components/admin/product-form/image-uploader';
import {
  createCategory,
  updateCategory,
  reparentCategory,
  reorderCategories,
  deleteCategory,
} from './actions';

export type CategoryNode = {
  id: string;
  slug: string;
  nameFa: string;
  nameEn: string | null;
  descriptionFa: string | null;
  parentId: string | null;
  sortOrder: number;
  isActive: boolean;
  showInMegaMenu: boolean;
  iconKey: string | null;
  posterKey: string | null;
  bannerKey: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  productCount: number;
};

function buildTree(nodes: CategoryNode[]) {
  const byParent = new Map<string | null, CategoryNode[]>();
  for (const n of nodes) {
    const key = n.parentId;
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key)!.push(n);
  }
  for (const list of byParent.values()) list.sort((a, b) => a.sortOrder - b.sortOrder);
  return byParent;
}

export function CategoryTree({ initialNodes }: { initialNodes: CategoryNode[] }) {
  const router = useRouter();
  const [nodes, setNodes] = React.useState(initialNodes);
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [addingParentId, setAddingParentId] = React.useState<string | null | 'root'>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<CategoryNode | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [notice, setNotice] = React.useState<{ tone: 'ok' | 'err'; text: string } | null>(null);

  React.useEffect(() => setNodes(initialNodes), [initialNodes]);

  const byParent = React.useMemo(() => buildTree(nodes), [nodes]);

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function flash(tone: 'ok' | 'err', text: string) {
    setNotice({ tone, text });
    setTimeout(() => setNotice(null), 4000);
  }

  async function handleMove(node: CategoryNode, direction: -1 | 1) {
    const siblings = byParent.get(node.parentId) ?? [];
    const idx = siblings.findIndex((s) => s.id === node.id);
    const swapWith = siblings[idx + direction];
    if (!swapWith) return;
    const reordered = [...siblings];
    [reordered[idx], reordered[idx + direction]] = [reordered[idx + direction], reordered[idx]];
    setBusy(true);
    const res = await reorderCategories({ parentId: node.parentId, orderedIds: reordered.map((r) => r.id) });
    setBusy(false);
    if (res.ok) router.refresh();
    else flash('err', res.error);
  }

  async function handleReparent(node: CategoryNode, parentId: string) {
    setBusy(true);
    const res = await reparentCategory({ id: node.id, parentId: parentId || null });
    setBusy(false);
    if (res.ok) {
      router.refresh();
      flash('ok', 'دسته جابه‌جا شد.');
    } else flash('err', res.error);
  }

  async function handleToggleActive(node: CategoryNode) {
    setBusy(true);
    const res = await updateCategory({ id: node.id, isActive: !node.isActive });
    setBusy(false);
    if (res.ok) router.refresh();
    else flash('err', res.error);
  }

  function renderRow(node: CategoryNode, depth: number) {
    const children = byParent.get(node.id) ?? [];
    const isExpanded = expanded.has(node.id);
    const isEditing = editingId === node.id;
    const siblings = byParent.get(node.parentId) ?? [];
    const idx = siblings.findIndex((s) => s.id === node.id);

    return (
      <div key={node.id} className="border-b border-border-base last:border-0">
        <div
          className="flex flex-wrap items-center gap-2 py-2.5"
          style={{ paddingInlineStart: `${depth * 1.5}rem` }}
        >
          {children.length > 0 ? (
            <button
              type="button"
              onClick={() => toggle(node.id)}
              aria-label={isExpanded ? 'بستن زیردسته‌ها' : 'باز کردن زیردسته‌ها'}
              className="grid size-6 shrink-0 place-items-center rounded-md text-fg-muted hover:bg-surface-muted"
            >
              <Icons.ChevronDown className={cn('size-4 transition-transform', !isExpanded && '-rotate-90')} aria-hidden />
            </button>
          ) : (
            <span className="size-6 shrink-0" aria-hidden />
          )}

          <span className="min-w-0 flex-1 truncate text-sm font-medium text-fg">{node.nameFa}</span>
          {node.nameEn && <span className="hidden shrink-0 text-xs text-fg-faint sm:inline">{node.nameEn}</span>}
          {!node.isActive && <Badge tone="neutral" size="sm">غیرفعال</Badge>}
          {!node.showInMegaMenu && <Badge tone="warn" size="sm">خارج از مگامنو</Badge>}
          <Badge tone="primary" size="sm">{node.productCount.toLocaleString('fa-IR')} محصول</Badge>

          <div className="ms-auto flex shrink-0 items-center gap-1">
            <button
              type="button"
              disabled={idx <= 0 || busy}
              onClick={() => handleMove(node, -1)}
              aria-label={`جابه‌جایی ${node.nameFa} به بالا`}
              className="grid size-8 place-items-center rounded-lg text-fg-muted hover:bg-surface-muted disabled:opacity-30"
            >
              <Icons.ChevronUp className="size-4" aria-hidden />
            </button>
            <button
              type="button"
              disabled={idx < 0 || idx >= siblings.length - 1 || busy}
              onClick={() => handleMove(node, 1)}
              aria-label={`جابه‌جایی ${node.nameFa} به پایین`}
              className="grid size-8 place-items-center rounded-lg text-fg-muted hover:bg-surface-muted disabled:opacity-30"
            >
              <Icons.ChevronDown className="size-4" aria-hidden />
            </button>
            <Switch checked={node.isActive} onChange={() => handleToggleActive(node)} label="" id={`active-${node.id}`} />
            <Button type="button" size="xs" variant="ghost" onClick={() => setAddingParentId(node.id)}>
              <Icons.Plus className="size-3.5" aria-hidden /> زیردسته
            </Button>
            <Button type="button" size="xs" variant="secondary" onClick={() => setEditingId(isEditing ? null : node.id)}>
              <Icons.Pencil className="size-3.5" aria-hidden /> ویرایش
            </Button>
            <Button type="button" size="xs" variant="danger" onClick={() => setDeleteTarget(node)}>
              <Icons.Trash2 className="size-3.5" aria-hidden />
            </Button>
          </div>
        </div>

        {isEditing && (
          <div style={{ paddingInlineStart: `${(depth + 1) * 1.5}rem` }} className="pb-4">
            <CategoryEditForm
              node={node}
              allNodes={nodes}
              onDone={() => {
                setEditingId(null);
                router.refresh();
              }}
              onReparent={(parentId) => handleReparent(node, parentId)}
              onError={(e) => flash('err', e)}
            />
          </div>
        )}

        {addingParentId === node.id && (
          <div style={{ paddingInlineStart: `${(depth + 1) * 1.5}rem` }} className="pb-4">
            <AddCategoryForm
              parentId={node.id}
              onCancel={() => setAddingParentId(null)}
              onCreated={() => {
                setAddingParentId(null);
                setExpanded((prev) => new Set(prev).add(node.id));
                router.refresh();
              }}
              onError={(e) => flash('err', e)}
            />
          </div>
        )}

        {isExpanded && children.map((child) => renderRow(child, depth + 1))}
      </div>
    );
  }

  const roots = byParent.get(null) ?? [];

  return (
    <Panel
      title="ساختار دسته‌ها"
      actions={
        <Button type="button" size="sm" onClick={() => setAddingParentId('root')}>
          <Icons.Plus className="size-4" aria-hidden />
          دسته اصلی جدید
        </Button>
      }
    >
      {notice && (
        <p
          role="status"
          className={cn(
            'mb-3 rounded-xl px-3.5 py-2.5 text-sm',
            notice.tone === 'ok' ? 'bg-accent-soft text-accent' : 'bg-danger-soft text-danger',
          )}
        >
          {notice.text}
        </p>
      )}

      {addingParentId === 'root' && (
        <div className="mb-4">
          <AddCategoryForm
            parentId={null}
            onCancel={() => setAddingParentId(null)}
            onCreated={() => {
              setAddingParentId(null);
              router.refresh();
            }}
            onError={(e) => flash('err', e)}
          />
        </div>
      )}

      {roots.length === 0 ? (
        <EmptyState
          icon={<Icons.FolderTree className="size-7" aria-hidden />}
          title="هنوز دسته‌ای ثبت نشده"
          description="با «دسته اصلی جدید» اولین دسته را بسازید."
        />
      ) : (
        <div>{roots.map((n) => renderRow(n, 0))}</div>
      )}

      <DeleteCategoryModal
        node={deleteTarget}
        allNodes={nodes}
        onClose={() => setDeleteTarget(null)}
        onDeleted={() => {
          setDeleteTarget(null);
          router.refresh();
        }}
        onError={(e) => flash('err', e)}
      />
    </Panel>
  );
}

function AddCategoryForm({
  parentId,
  onCancel,
  onCreated,
  onError,
}: {
  parentId: string | null;
  onCancel: () => void;
  onCreated: () => void;
  onError: (e: string) => void;
}) {
  const [nameFa, setNameFa] = React.useState('');
  const [nameEn, setNameEn] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  return (
    <form
      className="flex flex-wrap items-end gap-2 rounded-xl border border-border-base bg-surface-muted/50 p-3"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!nameFa.trim()) return;
        setBusy(true);
        const res = await createCategory({ nameFa: nameFa.trim(), nameEn: nameEn.trim() || null, parentId });
        setBusy(false);
        if (res.ok) onCreated();
        else onError(res.error);
      }}
    >
      <Field label="نام فارسی" htmlFor="new-cat-fa" className="min-w-[10rem] flex-1">
        <Input id="new-cat-fa" value={nameFa} onChange={(e) => setNameFa(e.target.value)} autoFocus />
      </Field>
      <Field label="نام انگلیسی (اختیاری)" htmlFor="new-cat-en" className="min-w-[10rem] flex-1">
        <Input id="new-cat-en" value={nameEn} onChange={(e) => setNameEn(e.target.value)} dir="ltr" />
      </Field>
      <Button type="submit" size="sm" loading={busy} disabled={!nameFa.trim()}>
        افزودن
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
        انصراف
      </Button>
    </form>
  );
}

function CategoryEditForm({
  node,
  allNodes,
  onDone,
  onReparent,
  onError,
}: {
  node: CategoryNode;
  allNodes: CategoryNode[];
  onDone: () => void;
  onReparent: (parentId: string) => void;
  onError: (e: string) => void;
}) {
  const [form, setForm] = React.useState({
    nameFa: node.nameFa,
    nameEn: node.nameEn ?? '',
    descriptionFa: node.descriptionFa ?? '',
    iconKey: node.iconKey,
    posterKey: node.posterKey,
    bannerKey: node.bannerKey,
    seoTitle: node.seoTitle ?? '',
    seoDescription: node.seoDescription ?? '',
    showInMegaMenu: node.showInMegaMenu,
  });
  const [busy, setBusy] = React.useState(false);

  const parentOptions = allNodes.filter((n) => n.id !== node.id);

  async function save() {
    setBusy(true);
    const res = await updateCategory({
      id: node.id,
      nameFa: form.nameFa.trim(),
      nameEn: form.nameEn.trim() || null,
      descriptionFa: form.descriptionFa.trim() || null,
      iconKey: form.iconKey,
      posterKey: form.posterKey,
      bannerKey: form.bannerKey,
      seoTitle: form.seoTitle.trim() || null,
      seoDescription: form.seoDescription.trim() || null,
      showInMegaMenu: form.showInMegaMenu,
    });
    setBusy(false);
    if (res.ok) onDone();
    else onError(res.error);
  }

  return (
    <div className="space-y-4 rounded-xl border border-border-base bg-surface-muted/40 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="نام فارسی" htmlFor={`edit-fa-${node.id}`}>
          <Input id={`edit-fa-${node.id}`} value={form.nameFa} onChange={(e) => setForm((f) => ({ ...f, nameFa: e.target.value }))} />
        </Field>
        <Field label="نام انگلیسی" htmlFor={`edit-en-${node.id}`}>
          <Input id={`edit-en-${node.id}`} value={form.nameEn} onChange={(e) => setForm((f) => ({ ...f, nameEn: e.target.value }))} dir="ltr" />
        </Field>
      </div>

      <Field label="توضیح کوتاه" htmlFor={`edit-desc-${node.id}`}>
        <Textarea id={`edit-desc-${node.id}`} rows={2} value={form.descriptionFa} onChange={(e) => setForm((f) => ({ ...f, descriptionFa: e.target.value }))} />
      </Field>

      <Field label="دسته والد">
        <Select
          value={node.parentId ?? ''}
          onChange={(e) => onReparent(e.target.value)}
        >
          <option value="">— بدون والد (دسته اصلی) —</option>
          {parentOptions.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nameFa}
            </option>
          ))}
        </Select>
      </Field>

      <div className="grid gap-4 sm:grid-cols-3">
        <MediaField label="آیکون" path={form.iconKey} folder="categories" onChange={(p) => setForm((f) => ({ ...f, iconKey: p }))} />
        <MediaField label="پوستر" path={form.posterKey} folder="categories" onChange={(p) => setForm((f) => ({ ...f, posterKey: p }))} />
        <MediaField label="بنر" path={form.bannerKey} folder="banners" onChange={(p) => setForm((f) => ({ ...f, bannerKey: p }))} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="عنوان سئو" htmlFor={`seo-title-${node.id}`}>
          <Input id={`seo-title-${node.id}`} value={form.seoTitle} onChange={(e) => setForm((f) => ({ ...f, seoTitle: e.target.value }))} maxLength={200} />
        </Field>
        <Field label="توضیح سئو" htmlFor={`seo-desc-${node.id}`}>
          <Input id={`seo-desc-${node.id}`} value={form.seoDescription} onChange={(e) => setForm((f) => ({ ...f, seoDescription: e.target.value }))} maxLength={400} />
        </Field>
      </div>

      <Switch
        checked={form.showInMegaMenu}
        onChange={(v) => setForm((f) => ({ ...f, showInMegaMenu: v }))}
        label="نمایش در مگامنو"
        id={`mega-${node.id}`}
      />

      <div className="flex gap-2">
        <Button type="button" size="sm" loading={busy} onClick={save}>
          ذخیره تغییرات
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onDone}>
          انصراف
        </Button>
      </div>
    </div>
  );
}

function MediaField({
  label,
  path,
  folder,
  onChange,
}: {
  label: string;
  path: string | null;
  folder: 'categories' | 'banners' | 'brands';
  onChange: (path: string | null) => void;
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-fg-muted">{label}</p>
      {path ? (
        <div className="flex items-center gap-2">
          {/* A preview of an arbitrary uploaded path at a fixed 56px; next/image
              would add an optimisation round-trip for no benefit here. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={path} alt="" className="size-14 rounded-lg border border-border-base object-cover" />
          <Button type="button" size="xs" variant="ghost" onClick={() => onChange(null)}>
            حذف
          </Button>
        </div>
      ) : (
        <ImageUploader folder={folder} label={`بارگذاری ${label}`} onUploaded={(r) => onChange(r.path)} compact />
      )}
    </div>
  );
}

function DeleteCategoryModal({
  node,
  allNodes,
  onClose,
  onDeleted,
  onError,
}: {
  node: CategoryNode | null;
  allNodes: CategoryNode[];
  onClose: () => void;
  onDeleted: () => void;
  onError: (e: string) => void;
}) {
  const [reassignTo, setReassignTo] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => setReassignTo(''), [node]);

  if (!node) return null;
  const hasProducts = node.productCount > 0;
  const targets = allNodes.filter((n) => n.id !== node.id);

  return (
    <Modal
      open={!!node}
      onClose={onClose}
      title={`حذف دسته «${node.nameFa}»`}
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose}>
            انصراف
          </Button>
          <Button
            type="button"
            variant="danger"
            loading={busy}
            disabled={hasProducts && !reassignTo}
            onClick={async () => {
              setBusy(true);
              const res = await deleteCategory({ id: node.id, reassignToId: reassignTo || null });
              setBusy(false);
              if (res.ok) onDeleted();
              else onError(res.error);
            }}
          >
            حذف قطعی
          </Button>
        </>
      }
    >
      {hasProducts ? (
        <div className="space-y-3">
          <p className="text-sm text-fg">
            این دسته دارای <strong className="tnum">{node.productCount.toLocaleString('fa-IR')}</strong> محصول
            است. برای حذف، ابتدا یک دسته جایگزین برای انتقال این محصولات انتخاب کنید.
          </p>
          <Field label="انتقال محصولات به" htmlFor="reassign-select">
            <Select id="reassign-select" value={reassignTo} onChange={(e) => setReassignTo(e.target.value)}>
              <option value="">— انتخاب کنید —</option>
              {targets.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nameFa}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      ) : (
        <p className="text-sm text-fg">آیا از حذف این دسته مطمئن هستید؟ این عملیات قابل بازگشت نیست.</p>
      )}
    </Modal>
  );
}
