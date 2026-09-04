/**
 * GiftiPay shared UI primitives.
 * Every surface (storefront, account, admin) composes from these so the
 * product keeps one visual language. RTL-first, themed via CSS tokens.
 */
'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { Loader2, X, ChevronLeft, ChevronRight, Check, AlertCircle, Info, CircleCheck, TriangleAlert } from 'lucide-react';
import { toPersianDigits } from '@/lib/persian';

// ── Button ───────────────────────────────────────────────────

const buttonVariants = {
  primary:
    'bg-primary text-primary-contrast hover:bg-primary-hover shadow-sm disabled:bg-fg-faint',
  secondary:
    'bg-surface-muted text-fg hover:bg-border-base border border-border-base',
  outline:
    'border border-border-strong text-fg hover:bg-surface-muted bg-transparent',
  ghost: 'text-fg hover:bg-surface-muted bg-transparent',
  danger: 'bg-danger text-white hover:brightness-95',
  accent: 'bg-accent text-white hover:brightness-95 dark:text-ink-950',
  link: 'text-primary hover:underline underline-offset-4 bg-transparent px-0',
} as const;

const buttonSizes = {
  xs: 'h-7 px-2.5 text-xs gap-1 rounded-lg',
  sm: 'h-9 px-3.5 text-sm gap-1.5 rounded-lg',
  md: 'h-11 px-5 text-sm gap-2 rounded-xl',
  lg: 'h-13 px-7 text-base gap-2 rounded-xl',
  icon: 'h-10 w-10 rounded-xl justify-center',
} as const;

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof buttonVariants;
  size?: keyof typeof buttonSizes;
  loading?: boolean;
  fullWidth?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', loading, fullWidth, children, disabled, ...props }, ref) => (
    <button
      ref={ref}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex items-center justify-center font-medium transition-all duration-200',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
        'disabled:opacity-55 disabled:cursor-not-allowed active:scale-[0.985]',
        buttonVariants[variant],
        buttonSizes[size],
        fullWidth && 'w-full',
        className,
      )}
      {...props}
    >
      {loading && <Loader2 className="size-4 animate-spin shrink-0" aria-hidden />}
      {children}
    </button>
  ),
);
Button.displayName = 'Button';

// ── Field wrapper ────────────────────────────────────────────

export function Field({
  label,
  htmlFor,
  hint,
  error,
  required,
  children,
  className,
}: {
  label?: string;
  htmlFor?: string;
  hint?: string;
  error?: string | null;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      {label && (
        <label htmlFor={htmlFor} className="block text-sm font-medium text-fg">
          {label}
          {required && <span className="text-danger ms-1" aria-hidden>*</span>}
        </label>
      )}
      {children}
      {error ? (
        <p className="text-xs text-danger flex items-center gap-1" role="alert">
          <AlertCircle className="size-3.5 shrink-0" aria-hidden />
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-fg-muted">{hint}</p>
      ) : null}
    </div>
  );
}

const controlBase =
  'w-full bg-surface border border-border-base rounded-xl px-3.5 text-sm text-fg placeholder:text-fg-faint ' +
  'transition-colors focus:border-primary focus:outline-2 focus:outline-offset-0 focus:outline-primary/30 ' +
  'disabled:opacity-60 disabled:cursor-not-allowed aria-[invalid=true]:border-danger';

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input ref={ref} className={cn(controlBase, 'h-11', className)} {...props} />
  ),
);
Input.displayName = 'Input';

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, rows = 4, ...props }, ref) => (
  <textarea ref={ref} rows={rows} className={cn(controlBase, 'py-2.5 leading-7 resize-y', className)} {...props} />
));
Textarea.displayName = 'Textarea';

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, children, ...props }, ref) => (
  <select
    ref={ref}
    className={cn(controlBase, 'h-11 appearance-none bg-no-repeat ps-3.5 pe-9', className)}
    style={{
      backgroundImage:
        "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%236b7391' stroke-width='2.5' stroke-linecap='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
      backgroundPosition: 'left 0.85rem center',
    }}
    {...props}
  >
    {children}
  </select>
));
Select.displayName = 'Select';

export const Checkbox = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement> & { label?: React.ReactNode }
>(({ className, label, id, ...props }, ref) => {
  const autoId = React.useId();
  const inputId = id ?? autoId;
  return (
    <div className="flex items-start gap-2.5">
      <input
        ref={ref}
        id={inputId}
        type="checkbox"
        className={cn(
          'mt-0.5 size-[18px] shrink-0 rounded-[6px] border border-border-strong bg-surface',
          'accent-[var(--primary)] cursor-pointer',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
          className,
        )}
        {...props}
      />
      {label && (
        <label htmlFor={inputId} className="text-sm text-fg leading-6 cursor-pointer select-none">
          {label}
        </label>
      )}
    </div>
  );
});
Checkbox.displayName = 'Checkbox';

export function Switch({
  checked,
  onChange,
  label,
  disabled,
  id,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
  disabled?: boolean;
  id?: string;
}) {
  const autoId = React.useId();
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        role="switch"
        id={id ?? autoId}
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
          checked ? 'bg-primary' : 'bg-border-strong',
          disabled && 'opacity-50 cursor-not-allowed',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 size-5 rounded-full bg-white shadow transition-all duration-200',
            checked ? 'end-0.5' : 'end-[1.375rem]',
          )}
        />
      </button>
      {label && (
        <label htmlFor={id ?? autoId} className="text-sm text-fg cursor-pointer select-none">
          {label}
        </label>
      )}
    </div>
  );
}

// ── Badge ────────────────────────────────────────────────────

const badgeTones = {
  neutral: 'bg-surface-muted text-fg-muted border-border-base',
  primary: 'bg-primary-soft text-primary border-transparent',
  success: 'bg-accent-soft text-accent border-transparent',
  warn: 'bg-warn-soft text-warn border-transparent',
  danger: 'bg-danger-soft text-danger border-transparent',
  gold: 'bg-gold-soft text-gold border-transparent',
} as const;

export function Badge({
  tone = 'neutral',
  className,
  children,
  size = 'md',
}: {
  tone?: keyof typeof badgeTones;
  className?: string;
  children: React.ReactNode;
  size?: 'sm' | 'md';
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border font-medium whitespace-nowrap',
        size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs',
        badgeTones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

// ── Card ─────────────────────────────────────────────────────

export function Card({
  className,
  children,
  as: Tag = 'div',
  ...rest
}: React.HTMLAttributes<HTMLElement> & { as?: React.ElementType }) {
  return (
    <Tag className={cn('card p-5', className)} {...rest}>
      {children}
    </Tag>
  );
}

export function SectionHeading({
  title,
  subtitle,
  action,
  className,
  id,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <div className={cn('flex items-end justify-between gap-4 mb-5', className)}>
      <div className="min-w-0">
        <h2 id={id} className="text-lg sm:text-xl font-bold text-fg">{title}</h2>
        {subtitle && <p className="text-sm text-fg-muted mt-1">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

// ── Alert ────────────────────────────────────────────────────

const alertTones = {
  info: { cls: 'bg-primary-soft text-primary border-primary/25', Icon: Info },
  success: { cls: 'bg-accent-soft text-accent border-accent/25', Icon: CircleCheck },
  warn: { cls: 'bg-warn-soft text-warn border-warn/25', Icon: TriangleAlert },
  danger: { cls: 'bg-danger-soft text-danger border-danger/25', Icon: AlertCircle },
} as const;

export function Alert({
  tone = 'info',
  title,
  children,
  className,
}: {
  tone?: keyof typeof alertTones;
  title?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  const { cls, Icon } = alertTones[tone];
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={cn('flex gap-3 rounded-xl border p-3.5 text-sm', cls, className)}
    >
      <Icon className="size-5 shrink-0 mt-0.5" aria-hidden />
      <div className="min-w-0 space-y-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className="leading-7 [&_a]:underline">{children}</div>}
      </div>
    </div>
  );
}

// ── Skeletons ────────────────────────────────────────────────

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton', className)} aria-hidden />;
}

export function ProductCardSkeleton() {
  return (
    <div className="card p-3 space-y-3">
      <Skeleton className="aspect-[4/3] w-full rounded-xl" />
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-3 w-1/2" />
      <Skeleton className="h-9 w-full rounded-lg" />
    </div>
  );
}

export function TableSkeleton({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-2" aria-hidden>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-3">
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} className="h-10 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}

// ── Empty state ──────────────────────────────────────────────

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center text-center py-14 px-6', className)}>
      {icon && (
        <div className="mb-4 flex size-16 items-center justify-center rounded-2xl bg-surface-muted text-fg-faint">
          {icon}
        </div>
      )}
      <h3 className="text-base font-semibold text-fg">{title}</h3>
      {description && <p className="mt-1.5 max-w-sm text-sm text-fg-muted leading-7">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

// ── Modal ────────────────────────────────────────────────────

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  size = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}) {
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab' && ref.current) {
        // Focus trap: cycle within the dialog.
        const focusables = ref.current.querySelectorAll<HTMLElement>(
          'a[href],button:not([disabled]),textarea,input,select,[tabindex]:not([tabindex="-1"])',
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const timer = setTimeout(() => {
      ref.current?.querySelector<HTMLElement>('button,input,a[href]')?.focus();
    }, 40);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      clearTimeout(timer);
    };
  }, [open, onClose]);

  if (!open) return null;

  const widths = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div
        className="absolute inset-0 bg-ink-950/55 backdrop-blur-sm animate-[gp-fade-up_.2s_ease]"
        onClick={onClose}
        aria-hidden
      />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          'relative w-full bg-surface border border-border-base shadow-lg',
          'rounded-t-2xl sm:rounded-2xl max-h-[92dvh] flex flex-col gp-fade-up',
          widths[size],
        )}
      >
        <div className="flex items-center justify-between gap-4 border-b border-border-base p-4 sm:p-5">
          <h2 className="text-base font-bold text-fg">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="بستن"
            className="rounded-lg p-1.5 text-fg-muted hover:bg-surface-muted hover:text-fg transition-colors"
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>
        <div className="overflow-y-auto p-4 sm:p-5 flex-1">{children}</div>
        {footer && (
          <div className="border-t border-border-base p-4 sm:p-5 flex gap-3 justify-start">{footer}</div>
        )}
      </div>
    </div>
  );
}

// ── Tabs ─────────────────────────────────────────────────────

export function Tabs({
  tabs,
  active,
  onChange,
  className,
}: {
  tabs: { key: string; label: React.ReactNode; badge?: number }[];
  active: string;
  onChange: (key: string) => void;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      className={cn('flex gap-1 overflow-x-auto no-scrollbar border-b border-border-base', className)}
    >
      {tabs.map((t) => (
        <button
          key={t.key}
          role="tab"
          type="button"
          aria-selected={active === t.key}
          onClick={() => onChange(t.key)}
          className={cn(
            'relative whitespace-nowrap px-4 py-2.5 text-sm font-medium transition-colors',
            'border-b-2 -mb-px flex items-center gap-2',
            active === t.key
              ? 'border-primary text-primary'
              : 'border-transparent text-fg-muted hover:text-fg',
          )}
        >
          {t.label}
          {typeof t.badge === 'number' && t.badge > 0 && (
            <span className="rounded-full bg-surface-muted px-1.5 text-[11px] tnum">
              {toPersianDigits(t.badge)}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

// ── Pagination ───────────────────────────────────────────────

export function Pagination({
  page,
  totalPages,
  onPage,
  hrefTemplate,
}: {
  page: number;
  totalPages: number;
  /** Client-side handler. Ignored when `hrefTemplate` is given. */
  onPage?: (p: number) => void;
  /**
   * URL template with a literal `{page}` placeholder, e.g.
   * `/category/steam?sort=newest&page={page}`.
   *
   * This is a *string*, not a builder function, on purpose: this is a Client
   * Component, and a Server Component cannot pass a function across that
   * boundary — doing so throws "Functions cannot be passed directly to Client
   * Components" at render time.
   */
  hrefTemplate?: string;
}) {
  if (!Number.isFinite(totalPages) || totalPages <= 1) return null;

  const buildHref = hrefTemplate
    ? (p: number) => hrefTemplate.replace(/\{page\}/g, String(p))
    : undefined;

  const pages: (number | '…')[] = [];
  const push = (p: number) => pages.push(p);
  push(1);
  if (page > 3) pages.push('…');
  for (let p = Math.max(2, page - 1); p <= Math.min(totalPages - 1, page + 1); p++) push(p);
  if (page < totalPages - 2) pages.push('…');
  if (totalPages > 1) push(totalPages);

  const Item = ({ p, children, disabled, label }: { p: number; children: React.ReactNode; disabled?: boolean; label?: string }) => {
    const cls = cn(
      'inline-flex h-10 min-w-10 items-center justify-center rounded-lg border px-3 text-sm transition-colors tnum',
      p === page
        ? 'border-primary bg-primary text-primary-contrast font-semibold'
        : 'border-border-base bg-surface text-fg hover:bg-surface-muted',
      disabled && 'pointer-events-none opacity-40',
    );
    if (buildHref && !disabled) {
      return (
        <a href={buildHref(p)} className={cls} aria-label={label} aria-current={p === page ? 'page' : undefined}>
          {children}
        </a>
      );
    }
    return (
      <button type="button" disabled={disabled} onClick={() => onPage?.(p)} className={cls} aria-label={label} aria-current={p === page ? 'page' : undefined}>
        {children}
      </button>
    );
  };

  return (
    <nav className="flex items-center justify-center gap-1.5 flex-wrap" aria-label="صفحه‌بندی">
      <Item p={page - 1} disabled={page <= 1} label="صفحه قبل">
        <ChevronRight className="size-4" aria-hidden />
      </Item>
      {pages.map((p, i) =>
        p === '…' ? (
          <span key={`gap-${i}`} className="px-1.5 text-fg-faint select-none">…</span>
        ) : (
          <Item key={p} p={p}>{toPersianDigits(p)}</Item>
        ),
      )}
      <Item p={page + 1} disabled={page >= totalPages} label="صفحه بعد">
        <ChevronLeft className="size-4" aria-hidden />
      </Item>
    </nav>
  );
}

// ── Rating ───────────────────────────────────────────────────

export function Rating({
  value,
  count,
  size = 'md',
  showValue = true,
}: {
  value: number; // 0..5
  count?: number;
  size?: 'sm' | 'md';
  showValue?: boolean;
}) {
  const pct = Math.max(0, Math.min(100, (value / 5) * 100));
  const px = size === 'sm' ? 'text-sm' : 'text-base';
  return (
    <div className="inline-flex items-center gap-1.5" aria-label={`امتیاز ${value} از ۵`}>
      <span className={cn('relative inline-block leading-none select-none', px)} aria-hidden>
        <span className="text-border-strong">★★★★★</span>
        <span
          className="absolute inset-0 overflow-hidden text-gold whitespace-nowrap"
          style={{ width: `${pct}%`, direction: 'rtl' }}
        >
          ★★★★★
        </span>
      </span>
      {showValue && (
        <span className="text-xs text-fg-muted tnum">
          {toPersianDigits(value.toFixed(1))}
          {typeof count === 'number' && count > 0 && ` (${toPersianDigits(count)})`}
        </span>
      )}
    </div>
  );
}

// ── Toast ────────────────────────────────────────────────────

type Toast = { id: number; tone: 'info' | 'success' | 'warn' | 'danger'; message: string };
const ToastCtx = React.createContext<{ push: (t: Omit<Toast, 'id'>) => void }>({ push: () => {} });

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = React.useState<Toast[]>([]);
  const push = React.useCallback((t: Omit<Toast, 'id'>) => {
    const id = Date.now() + Math.random();
    setItems((prev) => [...prev, { ...t, id }]);
    setTimeout(() => setItems((prev) => prev.filter((x) => x.id !== id)), 5000);
  }, []);
  return (
    <ToastCtx.Provider value={{ push }}>
      {children}
      <div
        className="fixed bottom-4 start-4 z-[60] flex flex-col gap-2 pointer-events-none max-w-[min(24rem,calc(100vw-2rem))]"
        role="region"
        aria-live="polite"
        aria-label="اعلان‌ها"
      >
        {items.map((t) => {
          const { cls, Icon } = alertTones[t.tone];
          return (
            <div
              key={t.id}
              className={cn(
                'pointer-events-auto flex items-start gap-2.5 rounded-xl border p-3.5 text-sm shadow-lg gp-fade-up',
                'bg-surface',
                cls,
              )}
            >
              <Icon className="size-5 shrink-0" aria-hidden />
              <span className="leading-6">{t.message}</span>
              <button
                type="button"
                onClick={() => setItems((p) => p.filter((x) => x.id !== t.id))}
                className="ms-auto shrink-0 opacity-60 hover:opacity-100"
                aria-label="بستن اعلان"
              >
                <X className="size-4" aria-hidden />
              </button>
            </div>
          );
        })}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast() {
  return React.useContext(ToastCtx);
}

// ── Misc ─────────────────────────────────────────────────────

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('size-5 animate-spin text-primary', className)} aria-label="در حال بارگذاری" />;
}

export function CopyButton({ text, label = 'کپی' }: { text: string; label?: string }) {
  const [done, setDone] = React.useState(false);
  return (
    <Button
      variant="secondary"
      size="sm"
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 2000);
        } catch {
          /* clipboard unavailable — the value stays selectable on screen */
        }
      }}
    >
      {done ? <Check className="size-4" aria-hidden /> : null}
      {done ? 'کپی شد' : label}
    </Button>
  );
}
