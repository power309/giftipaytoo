'use client';

import * as React from 'react';
import { recordViewAction } from '@/app/(storefront)/_view-actions';

/** Fire-and-forget: records this product view once per mount. Renders nothing. */
export function RecordView({ productId }: { productId: string }) {
  React.useEffect(() => {
    recordViewAction(productId).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId]);
  return null;
}
