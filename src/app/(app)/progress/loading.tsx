import { ViewTransition } from 'react';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * The streak walks the whole history and the completeness window regenerates
 * the medication plan per day, so this route has a real first-byte cost. Handed
 * off through the existing `.skeleton-out` / `.content-in` transition rather
 * than a second pattern of its own.
 */
export default function ProgressLoading() {
  return (
    <ViewTransition exit="skeleton-out" default="none">
      <div className="space-y-4 p-4">
        <div className="space-y-2 pt-2">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-8 w-40" />
        </div>
        <Skeleton className="h-64 w-full rounded-card" />
        <Skeleton className="h-56 w-full rounded-card" />
        <Skeleton className="h-44 w-full rounded-card" />
        <Skeleton className="h-52 w-full rounded-card" />
      </div>
    </ViewTransition>
  );
}
