'use client';

import * as React from 'react';
import { recordViewAction } from '@/app/(storefront)/_view-actions';

/** Fire-and-forget: records this product view once per mount. Renders nothing. */
export function RecordView({ productId }: { productId: string }) {
  React.useEffect(() => {
    recordViewAction(productId).catch(() => undefined);
  }, [productId]);
  return null;
}
