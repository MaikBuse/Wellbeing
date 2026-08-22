import { ViewTransition } from 'react';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * Route-level fallback, handed off to the real content through the existing
 * `.skeleton-out` / `.content-in` view transition — the same pattern the day
 * screens already use, so the analysis does not introduce a second one.
 */
export default function AnalyseLoading() {
  return (
    <ViewTransition exit="skeleton-out" default="none">
      <div className="space-y-4 p-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-44 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    </ViewTransition>
  );
}
