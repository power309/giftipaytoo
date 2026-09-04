'use client';

import { RevealCode } from '@/components/account/reveal-code';
import { revealDeliveryAction } from './actions';

export function DeliveryCodeRow({ deliveryId, mask, lastRevealedLabel }: { deliveryId: string; mask: string; lastRevealedLabel?: string | null }) {
  return (
    <RevealCode mask={mask} lastRevealedLabel={lastRevealedLabel} onReveal={() => revealDeliveryAction(deliveryId)} />
  );
}
