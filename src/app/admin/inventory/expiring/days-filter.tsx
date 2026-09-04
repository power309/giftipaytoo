'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Select } from '@/components/ui';

export function DaysFilter({ days }: { days: number }) {
  const router = useRouter();
  const params = useSearchParams();

  return (
    <div className="flex items-center gap-2">
      <label htmlFor="days" className="text-sm text-fg-muted">بازه:</label>
      <Select
        id="days"
        value={String(days)}
        className="h-9 w-40 text-xs"
        onChange={(e) => {
          const next = new URLSearchParams(params.toString());
          next.set('days', e.target.value);
          router.push(`/admin/inventory/expiring?${next.toString()}`);
        }}
      >
        <option value="7">۷ روز آینده</option>
        <option value="14">۱۴ روز آینده</option>
        <option value="30">۳۰ روز آینده</option>
        <option value="60">۶۰ روز آینده</option>
      </Select>
    </div>
  );
}
