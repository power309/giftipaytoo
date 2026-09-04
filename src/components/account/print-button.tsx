'use client';

import { Printer } from 'lucide-react';
import { Button } from '@/components/ui';

export function PrintButton() {
  return (
    <Button type="button" variant="secondary" onClick={() => window.print()} className="print:hidden">
      <Printer className="size-4" aria-hidden />
      چاپ / ذخیره PDF
    </Button>
  );
}
