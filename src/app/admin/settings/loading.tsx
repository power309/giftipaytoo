import { Skeleton } from '@/components/ui';

export default function SettingsLoading() {
  return (
    <div>
      <Skeleton className="mb-5 h-8 w-32" />
      <Skeleton className="mb-4 h-10 w-full max-w-xl rounded-xl" />
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-32 rounded-xl" />
        ))}
      </div>
    </div>
  );
}
