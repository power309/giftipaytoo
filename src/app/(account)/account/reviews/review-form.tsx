'use client';

import * as React from 'react';
import { useActionState } from 'react';
import { Star } from 'lucide-react';
import { Modal, Field, Input, Textarea, Alert } from '@/components/ui';
import { AuthSubmitButton } from '@/components/auth/submit-button';
import { cn } from '@/lib/utils';
import { createReviewAction, type ReviewFormState } from './actions';

function StarPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [hover, setHover] = React.useState<number | null>(null);
  return (
    <div className="flex items-center gap-1" role="radiogroup" aria-label="امتیاز">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} ستاره`}
          onMouseEnter={() => setHover(n)}
          onMouseLeave={() => setHover(null)}
          onClick={() => onChange(n)}
          className="p-0.5"
        >
          <Star
            className={cn(
              'size-7 transition-colors',
              (hover ?? value) >= n ? 'fill-gold text-gold' : 'fill-transparent text-border-strong',
            )}
          />
        </button>
      ))}
    </div>
  );
}

export function ReviewFormModal({
  open,
  onClose,
  productId,
  productNameFa,
}: {
  open: boolean;
  onClose: () => void;
  productId: string;
  productNameFa: string;
}) {
  const [state, formAction] = useActionState<ReviewFormState, FormData>(createReviewAction, { ok: false });
  const [rating, setRating] = React.useState(5);

  React.useEffect(() => {
    if (state.ok) onClose();
  }, [state.ok, onClose]);

  return (
    <Modal open={open} onClose={onClose} title={`ثبت دیدگاه برای ${productNameFa}`}>
      <form action={formAction} className="space-y-4">
        <input type="hidden" name="productId" value={productId} />
        <input type="hidden" name="rating" value={rating} />

        {!state.ok && state.error && <Alert tone="danger">{state.error}</Alert>}

        <Field label="امتیاز شما" required>
          <StarPicker value={rating} onChange={setRating} />
        </Field>

        <Field label="عنوان (اختیاری)" htmlFor="titleFa">
          <Input id="titleFa" name="titleFa" maxLength={120} />
        </Field>

        <Field label="متن دیدگاه" htmlFor="bodyFa" required hint="حداقل ۱۰ کاراکتر">
          <Textarea id="bodyFa" name="bodyFa" required minLength={10} maxLength={2000} />
        </Field>

        <AuthSubmitButton>ثبت دیدگاه</AuthSubmitButton>
      </form>
    </Modal>
  );
}
