'use client';

import { RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';

/**
 * Route-level error boundary. Deliberately prints nothing from `error`: the
 * message could carry a food name, a symptom or a dose, and this app keeps
 * health data out of anything a screenshot or a bug report might capture.
 */
export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="p-4 pt-8">
      <EmptyState
        title="Das hat nicht geklappt"
        description="Die Seite konnte nicht geladen werden. Deine Einträge sind gespeichert."
        action={
          <Button variant="outline" onClick={reset}>
            <RotateCcw aria-hidden className="size-4" />
            Nochmal versuchen
          </Button>
        }
      />
    </div>
  );
}
