import { Skeleton } from '@/components/ui';
import { CartSkeleton } from '@/components/checkout/cart-skeleton';

export default function CartPageLoading() {
  return (
    <div className="container-page py-6 sm:py-8" aria-busy="true">
      <Skeleton className="mb-6 h-7 w-32" />
      <CartSkeleton />
    </div>
  );
}
