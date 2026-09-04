import { Spinner } from '@/components/ui';

export default function AuthLoading() {
  return (
    <div className="grid min-h-dvh place-items-center" aria-busy="true" aria-label="در حال بارگذاری">
      <Spinner />
    </div>
  );
}
