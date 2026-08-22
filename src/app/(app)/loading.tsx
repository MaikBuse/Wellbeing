import { ViewTransition } from 'react';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * Route-level skeleton. Wrapped in a ViewTransition with an exit animation so
 * it hands off to the real content rather than being swapped out instantly —
 * see the .skeleton-out / .content-in rules in globals.css.
 */
export default function Loading() {
  return (
    // Hands off to the real content instead of being swapped out instantly.
    <ViewTransition exit="skeleton-out" default="none">
      <div className="space-y-4 p-4">
        <div className="space-y-2 pt-2">
          <Skeleton className="h-9 w-40" />
          <Skeleton className="h-4 w-56" />
        </div>

        <Skeleton className="h-28 w-full rounded-card" />

        {[0, 1, 2].map((row) => (
          <div key={row} className="space-y-2">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        ))}
      </div>
    </ViewTransition>
  );
}
