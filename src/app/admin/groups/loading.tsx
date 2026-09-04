import { Skeleton } from '@/components/ui';

export default function GroupsLoading() {
  return (
    <div>
      <Skeleton className="mb-5 h-8 w-40" />
      <Skeleton className="h-64 rounded-xl" />
    </div>
  );
}
