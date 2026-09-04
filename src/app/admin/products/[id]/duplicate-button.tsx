'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Copy } from 'lucide-react';
import { Button } from '@/components/ui';
import { duplicateProduct } from '../actions';

export function DuplicateButton({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);

  return (
    <Button
      type="button"
      size="sm"
      variant="secondary"
      loading={busy}
      onClick={async () => {
        setBusy(true);
        const res = await duplicateProduct(id);
        setBusy(false);
        if (res.ok && res.data) router.push(`/admin/products/${res.data.id}`);
        else alert(res.ok ? 'خطای غیرمنتظره' : res.error);
      }}
    >
      <Copy className="size-3.5" aria-hidden />
      تکثیر محصول
    </Button>
  );
}
