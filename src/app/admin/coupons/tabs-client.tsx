'use client';

import * as React from 'react';
import { Tabs } from '@/components/ui';

export function CouponsTabs({ couponsPanel, campaignsPanel }: { couponsPanel: React.ReactNode; campaignsPanel: React.ReactNode }) {
  const [active, setActive] = React.useState('coupons');
  return (
    <div>
      <Tabs
        className="mb-4"
        active={active}
        onChange={setActive}
        tabs={[
          { key: 'coupons', label: 'کدهای تخفیف' },
          { key: 'campaigns', label: 'کمپین‌ها' },
        ]}
      />
      {active === 'coupons' ? couponsPanel : campaignsPanel}
    </div>
  );
}
