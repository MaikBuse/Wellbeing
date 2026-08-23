import { ViewTransition } from 'react';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * The nutrient read joins every logged item against the catalogue over the
 * whole range, so this route has a real first-byte cost. Same handoff the other
 * heavy routes use.
 */
export default function NutritionLoading() {
  return (
    <ViewTransition exit="skeleton-out" default="none">
      <div className="space-y-4 p-4">
        <div className="space-y-2 pt-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-8 w-44" />
        </div>
        <Skeleton className="h-11 w-full rounded-pill" />
        <Skeleton className="h-40 w-full rounded-card" />
        <Skeleton className="h-52 w-full rounded-card" />
        <Skeleton className="h-64 w-full rounded-card" />
      </div>
    </ViewTransition>
  );
}
