import { Skeleton } from '@/components/ui';

export default function StaffActivityLoading() {
  return (
    <div>
      <Skeleton className="mb-5 h-8 w-48" />
      <Skeleton className="h-96 rounded-xl" />
    </div>
  );
}
