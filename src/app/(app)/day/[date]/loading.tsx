import { ViewTransition } from 'react';
import { Skeleton } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    // Hands off to the real content instead of being swapped out instantly.
    <ViewTransition exit="skeleton-out" default="none">
      <div className="space-y-4 p-4">
        <div className="flex items-center justify-between gap-2 pt-2">
          <Skeleton className="h-11 w-24 rounded-control" />
          <Skeleton className="h-11 w-24 rounded-control" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-9 w-52" />
          <Skeleton className="h-4 w-40" />
        </div>
        <Skeleton className="h-28 w-full rounded-card" />
        {[0, 1, 2].map((row) => (
          <div key={row} className="space-y-2">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-4 w-full" />
          </div>
        ))}
      </div>
    </ViewTransition>
  );
}
